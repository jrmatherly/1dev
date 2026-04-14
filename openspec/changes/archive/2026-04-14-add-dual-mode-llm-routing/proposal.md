## Why

Sending a chat in the app fails with `API Error: 401 "Azure authentication requires the x-azure-signature header"` because `applyEnterpriseAuth()` writes the Entra ID access token into `ANTHROPIC_AUTH_TOKEN`, which the Claude CLI sends verbatim to `api.anthropic.com` as `Authorization: Bearer <entra_jwt>`. Anthropic has no understanding of Entra JWTs and rejects the request. The underlying mistake is that **app-to-user auth (Entra) is coupled to CLI-to-Anthropic auth**, so every Entra-signed-in user is broken even when they hold a valid Claude Max OAuth token in Keychain. This change fully decouples the two, introduces an explicit account-type × routing-mode model, and fixes chat send end-to-end.

## What Changes

- **BREAKING** — `applyEnterpriseAuth()` stops writing `ANTHROPIC_AUTH_TOKEN`. The Entra access token is used only to read the `oid` claim for LiteLLM audit attribution; it never reaches the Anthropic API or LiteLLM as an upstream bearer.
- Add pure function `deriveClaudeSpawnEnv(profile, flags)` in `src/main/lib/claude/spawn-env.ts` that produces a deterministic env map from `{accountType, routingMode}`, replacing the fragile `hasExistingApiConfig` inference in `src/main/lib/trpc/routers/claude.ts`.
- Introduce two account types — **Claude Code Subscription** (user's own OAuth) and **Bring Your Own API Key** — each with two routing modes (direct to Anthropic, or through LiteLLM), gated by new env flag `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` (default `false`).
- Extend `anthropicAccounts` Drizzle schema with `accountType`, `routingMode`, `apiKey`, `virtualKey`, `modelSonnet`, `modelHaiku`, `modelOpus` columns.
- Add `litellmModels` tRPC router with a single `listUserModels` procedure that proxies `GET ${MAIN_VITE_LITELLM_BASE_URL}/v1/models` using the user's virtual key, so BYOK-via-LiteLLM users can enumerate their accessible models and auto-map Sonnet/Haiku/Opus slots.
- Redesign Settings → Models → Anthropic Accounts section: "Add Account" wizard asks account type first, then routing mode (only if `ALLOW_DIRECT_ANTHROPIC=true`), then credential input. For BYOK-via-LiteLLM, a "Fetch Models" button enumerates and auto-suggests slot mappings (user can override).
- Delete the `migrateLegacy` `useEffect` in `agents-models-tab.tsx` and the matching `migrateLegacy` tRPC mutation — this is a greenfield project with no data to migrate, and the current loop resurrects deleted accounts (causing the Settings bug users have reported).
- Add three regression guards: (1) `ANTHROPIC_AUTH_TOKEN` is never set to a value starting with `eyJ` (Entra JWT prefix); (2) `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_AUTH_TOKEN` are never both set in the same spawn env; (3) `applyEnterpriseAuth()` body contains no assignment to `env.ANTHROPIC_AUTH_TOKEN`.
- Rename `LITELLM_PROXY_URL` env var to `MAIN_VITE_LITELLM_BASE_URL` to match the desktop-Electron prefix convention.
- Add `ENABLE_TOOL_SEARCH=true` to the spawn env for all LiteLLM modes (required because `ANTHROPIC_BASE_URL` is non-first-party — per Claude CLI docs, MCP tool search is disabled by default when base URL is overridden).
- **Subscription-aware model-picker gating (scope extension 2026-04-13):** extend `trpc.anthropicAccounts.getActive` to return `accountType` and `routingMode` (schema columns, not credentials — no encryption involved), and add a renderer-side gate in `new-chat-form.tsx` so the agent model selector hides its "Add Models" footer affordance when the active account is `claude-subscription` + `enterpriseAuthEnabled`. End users on a managed subscription have no need to add their own provider credentials; keeping the affordance visible would bypass LiteLLM's centralized audit, rate-limiting, and team-allowlist enforcement. Tracked as tasks §9.8–§9.11 and as an ADDED Requirement in the `llm-routing` delta.

## Capabilities

### New Capabilities
- `llm-routing`: The contract for how user credentials and routing modes map deterministically to Claude CLI spawn-environment variables. Covers account-type × routing-mode matrix, the four spawn-env recipes, `ALLOW_DIRECT_ANTHROPIC` gating, and the invariants that keep Entra tokens from leaking to Anthropic.

### Modified Capabilities
- `enterprise-auth`: requirement that `applyEnterpriseAuth()` never writes `ANTHROPIC_AUTH_TOKEN`; its only role is identity acquisition for `x-litellm-customer-id` attribution.
- `credential-storage`: new requirement for encrypting `apiKey` and `virtualKey` columns on `anthropicAccounts` via `credential-store.ts`.
- `claude-code-auth-import`: clarify that imported Claude Code OAuth tokens populate the `Claude Code Subscription` account type with `oauthToken` column only (no `apiKey` / `virtualKey`).

## Impact

**Affected tRPC routers (4):** `enterpriseAuth`, `anthropicAccounts`, `claudeCode`, new `litellmModels`.

**Affected database tables (1):** `anthropic_accounts` — adds seven columns; requires Drizzle migration via `bun run db:generate`.

**Affected main-process modules:** `src/main/lib/claude/env.ts`, new `src/main/lib/claude/spawn-env.ts`, `src/main/lib/trpc/routers/claude.ts:380-460,820-880`, `src/main/lib/trpc/routers/anthropic-accounts.ts`, `src/main/lib/db/schema/index.ts`.

**Affected renderer modules:** `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`, `src/renderer/lib/atoms/index.ts` (`ModelProfile` / `CustomClaudeConfig` types).

**New env vars:** `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` (default `false`), `MAIN_VITE_LITELLM_BASE_URL` (replaces `LITELLM_PROXY_URL`).

**Upstream-feature coverage:** Not an F-entry itself; unblocks Claude SDK usage broken by the coupling, which supports the self-hosted-API / LiteLLM work streams in `F-LiteLLM` (see `docs/enterprise/upstream-features.md`).

**Phase 0 hard gates:** Does not advance any Phase 0 gate (all 15 complete). Does close a Phase 1 blocker discovered during end-to-end testing of `enterprise-auth-wiring` on 2026-04-13.

**Out of scope (future changes):** Azure AI Foundry / non-Anthropic model routing through LiteLLM (Pattern D); automatic LiteLLM virtual-key provisioning via `1code-api`; Envoy JWT validation of Entra tokens on the CLI path.
