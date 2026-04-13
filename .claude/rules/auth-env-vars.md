---
paths:
  - "src/main/**/*auth*.ts"
  - "src/main/**/*claude*.ts"
  - "src/main/**/*codex*.ts"
  - "src/main/**/*enterprise*.ts"
---

# HARD RULE: Never inject Entra bearer tokens into Anthropic env vars

This is a **hard rule** for any auth code that touches Claude or Codex subprocess spawn environment variables.

**Before writing or modifying any such code, read `docs/enterprise/auth-strategy.md` §4.9 and §5.4 FIRST.**

## Rule (post-decoupling — `add-dual-mode-llm-routing`, shipped 2026-04-13)

- **DO NOT** write an Entra access token into `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, or any other Claude CLI credential env var. Anthropic's API does not understand Entra JWTs and rejects them with a 401 referencing `x-azure-signature`.
- **DO NOT** add any `env.ANTHROPIC_AUTH_TOKEN = ...` assignment to `applyEnterpriseAuth()` in `src/main/lib/claude/env.ts`. The function is **side-effect-only** — it warms the MSAL cache and surfaces acquisition failures early. Its return type is `Promise<void>` (tightened from `Promise<Record<string, string>>` on 2026-04-13 to eliminate the landmine where a future contributor adds a mutation and expects the caller to consume the return).
- **DO** route Entra identity to LiteLLM through the `x-litellm-customer-id` header ONLY — either via `ANTHROPIC_CUSTOM_HEADERS` (set in `deriveClaudeSpawnEnv()`) for CLI spawns or via the Anthropic SDK's `defaultHeaders` config for in-process calls (see `src/main/lib/aux-ai.ts`). The header carries the `oid` claim; the actual bearer auth is the LiteLLM virtual key.
- **DO** keep `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN_FILE`, `ANTHROPIC_API_KEY`, and `CLAUDE_CODE_OAUTH_TOKEN` in `STRIPPED_ENV_KEYS_BASE` so shell-inherited values cannot leak into a CLI spawn. `deriveClaudeSpawnEnv()` sets the ONE correct credential for the active `ProviderMode` after the strip pass.
- **DO NOT** use `ANTHROPIC_AUTH_TOKEN_FILE` — Claude CLI 2.1.96 does not support it. The FD-based `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` is the documented upgrade path when the CLI pin is bumped.

## Why the Entra token is NOT a substitute for an Anthropic bearer

The pre-decoupling code wrote the Entra access token into `ANTHROPIC_AUTH_TOKEN`, relying on Envoy Gateway's `authorization` header to make Anthropic-scheme auth interchangeable with Entra-issued JWTs. That assumption is wrong in two ways:

1. **`api.anthropic.com` rejects Entra JWTs** with a 401. If the request ever bypasses Envoy (firewall rule, DNS quirk, operator mistake), it leaks a stack trace plus the Entra `x-azure-signature` header.
2. **LiteLLM's audit expects `x-litellm-customer-id`, not a JWT bearer.** The customer-id is a stable claim (`oid` = Entra object id) that survives refresh cycles; the access token rotates every 60-90 minutes.

The correct split, as of `add-dual-mode-llm-routing`:

- **Bearer** (Authorization): Anthropic OAuth `sk-ant-oat01-*` (subscription), Anthropic API key `sk-ant-api03-*` (BYOK-direct), or LiteLLM virtual key `sk-*` (BYOK-litellm / subscription-litellm).
- **Audit** (x-litellm-customer-id header): Entra `oid` claim, flowing through headers — never through a credential env var.

## Co-resident process exposure

Even with the corrected flow, env vars can be read by other processes on the same machine:

- **Linux**: `/proc/<pid>/environ`
- **macOS**: `ps eww`
- **Windows**: `NtQueryInformationProcess`

Mitigations:

1. `STRIPPED_ENV_KEYS_BASE` strips the dangerous names before the spawn env is built, so stale shell-inherited values never reach the child process.
2. `deriveClaudeSpawnEnv()` sets exactly ONE credential per active mode — enforced by `tests/regression/spawn-env-invariants.test.ts`.
3. LiteLLM virtual keys are revocable at the LiteLLM proxy — narrower blast radius than a long-lived Anthropic API key.
4. Future: `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (FD-based) eliminates env-var exposure entirely for the subscription-direct path when the Claude CLI pin is bumped.

## Signature contract

```typescript
// In src/main/lib/claude/env.ts — called at the end of buildClaudeEnv()
export async function applyEnterpriseAuth(
  env: Record<string, string>,
): Promise<void>;
//       ^^^^^^^^^^^^^  Side-effect only: warms MSAL cache, logs failures early.
//                      Adding `env.ANTHROPIC_AUTH_TOKEN = ...` here is a HARD RULE
//                      violation. Future header mutations (e.g., x-litellm-
//                      customer-id via ANTHROPIC_CUSTOM_HEADERS) are the only
//                      legitimate reason to mutate `env` in this function.
```

## Enforcement

- Regression guard: `tests/regression/no-entra-in-anthropic-auth-token.test.ts` — extracts the `applyEnterpriseAuth` body and scans for forbidden assignments, plus a broader project-wide scan for `authManager.(getValidToken|getToken).*ANTHROPIC_.*_TOKEN` anywhere in `src/main/`.
- Spawn-env shape guard: `tests/regression/spawn-env-invariants.test.ts` — per-`ProviderMode` expected-key-set matrix (catches Anthropic tokens leaking into the LiteLLM bearer slot).
- CI quality gate: `bun test tests/regression/` must pass before merge.

## Related cluster prerequisite

`docs/enterprise/auth-strategy.md` §3.1 cluster lock-down (CiliumNetworkPolicy + HTTPRoute header strip) is a **blocking prerequisite** for any code that sends live traffic to LiteLLM via Envoy Gateway. Do not write code that would break if §3.1 is not yet deployed.

## Background

- Canonical strategy: `docs/enterprise/auth-strategy.md` (§4.9 decoupling rationale, §5.4 header-based audit contract)
- Module: `src/main/lib/enterprise-auth.ts`
- Spec: `openspec/specs/enterprise-auth/spec.md` — especially "Requirement: applyEnterpriseAuth never writes ANTHROPIC_AUTH_TOKEN" and "Requirement: applyEnterpriseAuth signature is Promise&lt;void&gt;"
- Regression guards: `tests/regression/no-entra-in-anthropic-auth-token.test.ts`, `tests/regression/spawn-env-invariants.test.ts`
