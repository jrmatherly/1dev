---
title: LLM Routing Patterns
icon: git-branch
---

# LLM Routing Patterns

> **Canonical matrix** for the four `ProviderMode` kinds derived in `src/main/lib/claude/spawn-env.ts` by `deriveClaudeSpawnEnv()`. The pure, deterministic function receives a typed `ProviderMode` + an optional `liteLlmBaseUrl` and returns the exact `Record<string, string>` environment variables the Claude CLI subprocess needs.

The fork supports **two account types** (Claude Pro/Max subscription via OAuth, or BYOK with an Anthropic API key) × **two routing modes** (direct to Anthropic, or through our self-hosted LiteLLM proxy) = **four patterns**. Every spawn of the Claude CLI subprocess flows through exactly one of these patterns.

## The four-pattern matrix

| Mode kind | Account type | Routing | Auth env var | Upstream | Additional env |
|---|---|---|---|---|---|
| `subscription-direct` | Claude Pro/Max | Anthropic direct | `CLAUDE_CODE_OAUTH_TOKEN` | `api.anthropic.com` (default) | — |
| `subscription-litellm` | Claude Pro/Max | Through LiteLLM | `CLAUDE_CODE_OAUTH_TOKEN` + `ANTHROPIC_AUTH_TOKEN` | `ANTHROPIC_BASE_URL=<litellm>` | `ANTHROPIC_CUSTOM_HEADERS` with `x-litellm-api-key` + `x-litellm-customer-id` |
| `byok-direct` | User's own Anthropic key | Anthropic direct | `ANTHROPIC_API_KEY` | `api.anthropic.com` (default) | — |
| `byok-litellm` | User's own LiteLLM virtual key | Through LiteLLM | `ANTHROPIC_AUTH_TOKEN=<virtualKey>` | `ANTHROPIC_BASE_URL=<litellm>` | `ANTHROPIC_CUSTOM_HEADERS` with `x-litellm-customer-id` + `ANTHROPIC_DEFAULT_{SONNET,HAIKU,OPUS}_MODEL` |

The invariants are enforced at runtime by `tests/regression/spawn-env-invariants.test.ts` (per-kind expected-key-set matrix; 18 tests).

## Spawn-env recipes (ground truth)

### `subscription-direct`
```
CLAUDE_CODE_OAUTH_TOKEN=<oauth-token-from-keychain>
```
Nothing else. The CLI reads the OAuth token and talks to `api.anthropic.com` directly. No LiteLLM involvement; virtual keys don't exist in this path.

### `subscription-litellm`
```
CLAUDE_CODE_OAUTH_TOKEN=<oauth-token-from-keychain>
ANTHROPIC_BASE_URL=https://llms.<cluster>/
ENABLE_TOOL_SEARCH=true
ANTHROPIC_CUSTOM_HEADERS=x-litellm-api-key: Bearer <virtualKey>
x-litellm-customer-id: <entra-oid>
```
The CLI sends `CLAUDE_CODE_OAUTH_TOKEN` upstream for subscription identity; LiteLLM relays the request to Anthropic while attaching the virtual key via `x-litellm-api-key` for quota attribution and `x-litellm-customer-id` for per-user audit. Requires `MAIN_VITE_LITELLM_BASE_URL` to be set.

### `byok-direct`
```
ANTHROPIC_API_KEY=<user-supplied-sk-ant-key>
```
Pass-through. The CLI sends the user's key to `api.anthropic.com`; no proxy in the path. Quota and billing are against the user's Anthropic org. Typically enabled only when `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=true` (see §Conditional direct routing below).

### `byok-litellm`
```
ANTHROPIC_BASE_URL=https://llms.<cluster>/
ANTHROPIC_AUTH_TOKEN=<user-supplied-litellm-virtual-key>
ANTHROPIC_DEFAULT_SONNET_MODEL=<mapped-sonnet>
ANTHROPIC_DEFAULT_HAIKU_MODEL=<mapped-haiku>
ANTHROPIC_DEFAULT_OPUS_MODEL=<mapped-opus>
ANTHROPIC_CUSTOM_HEADERS=x-litellm-customer-id: <entra-oid>
```
The CLI authenticates directly to LiteLLM via the virtual key as a Bearer token; LiteLLM dispatches to whichever backing model the user's `modelMap` slots specify (Azure OpenAI, Anthropic direct, etc. — see [1code-api provisioning](./1code-api-provisioning.md) and the [LiteLLM deployment configmap](https://github.com/jrmatherly/talos-ai-cluster/blob/main/templates/config/kubernetes/apps/ai/litellm/app/configmap.yaml.j2)). `customerId` is attached for audit attribution.

## Conditional direct routing (`MAIN_VITE_ALLOW_DIRECT_ANTHROPIC`)

Direct-to-Anthropic (`subscription-direct`, `byok-direct`) is **off by default** in the onboarding wizard. The operator opts in via env var:

```bash
# .env
MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=true
```

When unset or `false`, the wizard silently locks `routingMode` to `litellm`. The rationale is defense-in-depth: even if a user's Anthropic key leaks to the renderer, they can't bypass the proxy's rate limits, audit logging, or team allowlists.

## Customer-ID header (`x-litellm-customer-id`)

Both LiteLLM-routed modes attach the user's **Entra ID OID** (a stable UUID per person in Azure AD) as the `x-litellm-customer-id` header. This is the canonical audit attribution in our LiteLLM deployment — the proxy logs, metrics, and spend reports group per-customer metrics by this header.

Source: `getActiveProviderMode()` in `src/main/lib/trpc/routers/claude.ts` calls `authManager?.getUser()?.id` which is the OID from the MSAL-issued token. Missing only when `enterpriseAuthEnabled=false` or the user isn't signed in; in that case the header is omitted and the spawn still works (LiteLLM attributes to the virtual key's owning team).

## Anti-pattern: Entra tokens never flow into Anthropic bearer headers

`ANTHROPIC_AUTH_TOKEN` is the bearer header the Claude CLI sends upstream (either to Anthropic directly, or to LiteLLM via `ANTHROPIC_BASE_URL`). **Entra access tokens (the JWT from MSAL) must never populate this env var.**

Why: Entra JWTs authenticate *who you are* (your identity) via our Envoy Gateway. Anthropic/LiteLLM's bearer token authorizes *what model quota to use*. They're distinct tokens with distinct lifetimes (Entra: ~1 hour; virtual keys: indefinite until revoked), distinct issuers, and distinct trust domains. Mixing them creates:
- **Silent quota attribution errors** — LiteLLM treats the Entra `sub` as a user identifier, not as a key holder
- **Token-lifetime mismatches** — Entra tokens expire hourly; Claude CLI sessions last longer and would break mid-stream
- **Scope leakage** — Entra tokens carry Graph API scopes that don't belong in an LLM request path

Historical context: `ANTHROPIC_AUTH_TOKEN` was at one point being populated from the Entra token acquired by `applyEnterpriseAuth()`. This was closed in commits `0f43165` (Groups 4-9 of `remediate-dev-server-findings`) with a `Promise<void>` return type for `applyEnterpriseAuth` and a project-wide regression guard at `tests/regression/no-entra-in-anthropic-auth-token.test.ts`. See [`auth-strategy.md`](./auth-strategy.md) §4.9.

## UI screenshot placeholders

_Screenshots of the onboarding wizard UI will be added here once Group 9 of `add-dual-mode-llm-routing` lands. Placeholders:_

- _Step 1: Account type chooser (Claude Pro/Max | Anthropic API Key | Custom Model)_
- _Step 2: Routing mode (conditional on `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC`)_
- _Step 3: Credentials form_
- _Step 4: BYOK-LiteLLM "Fetch Models" button auto-populating Sonnet/Haiku/Opus dropdowns (backed by the `litellmModels.listUserModels` tRPC procedure landed in Group 8)_

## Related pages

- [`auth-strategy.md`](./auth-strategy.md) — Envoy Gateway dual-auth v2.1 (§4.9 for the Entra↔Anthropic-token separation)
- [`1code-api-provisioning.md`](./1code-api-provisioning.md) — LiteLLM virtual-key provisioning architecture
- [`upstream-features.md`](./upstream-features.md) — F-entry catalog (F11 + F12 resolved via aux-AI, which consumes `ProviderMode` for sub-chat title + commit message generation)
- [`../architecture/trpc-routers.md`](../architecture/trpc-routers.md) — the `litellmModels` router that powers the Group 9 onboarding wizard's "Fetch Models" button

## OpenSpec history

- **Active:** `add-dual-mode-llm-routing` (31/55 — Groups 1-7 + 8 landed; Groups 9-13 pending)
- **Related archived:** `remediate-dev-server-findings` (2026-04-13) — closed the Entra↔Anthropic-token coupling and added the per-kind spawn-env invariants guard; `add-1code-api-litellm-provisioning` (2026-04-11) — shipped the self-hosted backend that owns LiteLLM virtual-key lifecycle.
