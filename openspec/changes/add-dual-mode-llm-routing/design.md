## Context

The Electron app currently couples user-to-app auth (Entra ID via MSAL Node) with Claude-CLI-to-LLM auth in one code path: `applyEnterpriseAuth()` in `src/main/lib/claude/env.ts:217-247` writes the Entra access token to `ANTHROPIC_AUTH_TOKEN`, which the Claude CLI sends verbatim as `Authorization: Bearer <entra_jwt>` to whatever endpoint `ANTHROPIC_BASE_URL` points to (or `api.anthropic.com` by default). Anthropic returns a generic 401 referencing an Azure Marketplace signature, because it cannot parse the Entra JWT. This has blocked Phase 1 enterprise-auth-wiring end-to-end testing on 2026-04-13.

Authoritative research (per `https://code.claude.com/docs/en/env-vars` and reverse-engineering of `resources/bin/darwin-arm64/claude`):

- `CLAUDE_CODE_OAUTH_TOKEN` is the correct env var for Claude Max/Pro subscription OAuth; precedes Keychain.
- `ANTHROPIC_API_KEY` is sent as `X-Api-Key`; used for BYOK direct to Anthropic.
- `ANTHROPIC_AUTH_TOKEN` is sent raw as `Authorization: Bearer <value>`; the right shape for a LiteLLM virtual key (Pattern D-style BYOK-via-LiteLLM).
- `ANTHROPIC_CUSTOM_HEADERS` is parsed as newline-separated `Name: Value` pairs (regex `/\n|\r\n/`) and merged into every request — the correct vehicle for `x-litellm-api-key` and `x-litellm-customer-id`.
- `ANTHROPIC_BASE_URL` overrides endpoint; when non-first-party, MCP tool search is disabled unless `ENABLE_TOOL_SEARCH=true`.

Users need **two** intent expressions — "I have a Claude Max subscription" vs "I have an API key" — crossed with **two** routing choices gated by the enterprise flag `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC`. The current `ModelProfile { model, token, baseUrl }` shape does not express this; the spawn-env code infers routing from presence/absence of fields, which is the root of the Entra-JWT leak.

Upstream boundary: `remoteTrpc.*` and `fetch(${apiUrl}/)` are untouched by this change. LiteLLM proxy address moves from implicit `LITELLM_PROXY_URL` (process.env) to an explicit `MAIN_VITE_LITELLM_BASE_URL` (Electron-conventional prefix).

Strategy reference: auth-strategy v2.1 (`docs/enterprise/auth-strategy.md`) remains the cluster-side target; this app-side change is compatible with it and does not require Envoy JWT validation to be deployed first — the LiteLLM virtual-key path works today against OSS LiteLLM without any Envoy plumbing.

## Goals / Non-Goals

**Goals:**
- Eliminate the ANTHROPIC_AUTH_TOKEN = Entra-JWT coupling so chat send works on all four routing patterns.
- Give users two clear UI choices (Claude Code Subscription vs BYOK) with the routing mode hidden unless `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=true`.
- Introduce a single pure function `deriveClaudeSpawnEnv(mode, liteLlmBaseUrl)` that is the only place Claude-CLI env vars are assembled. All call sites feed it a typed `ProviderMode` union.
- Store credentials per-type in `anthropicAccounts` (oauthToken | apiKey | virtualKey), encrypted via `credential-store.ts`.
- Enumerate accessible LiteLLM models via `GET /v1/models` and auto-map Sonnet/Haiku/Opus slots, user-overridable.
- Add regression guards that fail CI if anyone re-introduces Entra-JWT-as-Anthropic-bearer, or mutually exclusive env vars coexist.
- Remove the `migrateLegacy` useEffect + tRPC mutation that resurrects deleted accounts.

**Non-Goals:**
- Azure AI Foundry / non-Anthropic model routing (Pattern D). The env var shape supports it but tests/UI/spec coverage are deferred to a follow-up change.
- Automatic LiteLLM virtual-key provisioning via `1code-api`. Tracked on roadmap; user pastes the key manually in this change.
- Envoy JWT validation of Entra tokens on the CLI path. Lives in strategy v2.1 cluster-side work; the design here works against OSS LiteLLM directly.
- Existing Claude CLI subscription tokens tied to specific Anthropic workspaces (Azure-Marketplace-bound tokens). Those need to be reissued by the user from a non-Marketplace workspace; this change does not attempt to detect or migrate them.
- Codex / Ollama backends. Same `env.ts` flow, but `deriveClaudeSpawnEnv` is Claude-only for now; Codex equivalent will be a sibling function in a later change.

## Decisions

### Decision 1: Pure function for env derivation (not a class, not a tRPC procedure)

`deriveClaudeSpawnEnv(mode: ProviderMode, liteLlmBaseUrl?: string): Record<string,string>` lives in `src/main/lib/claude/spawn-env.ts` and is synchronous, side-effect-free, and deterministic. It is called by `claude.ts` inside `query.start` after the profile has been resolved.

**Rationale:** A pure function is trivially testable (Bun's test runner can call it with a table of inputs and assert exact key-value outputs), and it makes the regression guards straightforward — just grep the function body for forbidden patterns. An earlier sketch had the logic spread across three sites in `claude.ts`; centralizing it closes the "inferred from presence of keys" bug class permanently.

**Alternatives considered:** (a) Keep inline in `claude.ts` — rejected, too easy to re-introduce inference drift. (b) Build as a Jotai atom — rejected, this is main-process code, no Jotai here. (c) tRPC procedure — rejected, no renderer should ever assemble these env vars.

### Decision 2: `ProviderMode` as discriminated union, not a record of flags

```ts
type ProviderMode =
  | { kind: "subscription-direct"; oauthToken: string }
  | { kind: "subscription-litellm"; oauthToken: string; virtualKey: string; customerId?: string }
  | { kind: "byok-direct"; apiKey: string }
  | { kind: "byok-litellm"; virtualKey: string; customerId?: string;
      modelMap: { sonnet: string; haiku: string; opus: string } };
```

**Rationale:** The TypeScript compiler enforces that each branch has the fields it needs and forbids fields from other branches — no `{oauthToken: string, apiKey: string}` can typecheck. This encodes the invariant "the four patterns are mutually exclusive" at the type level, which is stronger than any runtime guard.

**Alternatives considered:** A flat `{accountType, routingMode, ...credentials}` shape — rejected because optional fields make the invariant a runtime property instead of a compile-time one.

### Decision 3: `ALLOW_DIRECT_ANTHROPIC` defaults to false

Enterprise deployments will not set this. Dev and consumer-mode deployments can set `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=true` in `.env`. When false:

- "Bring Your Own API Key" wizard silently locks to LiteLLM routing (user pastes a LiteLLM virtual key, not an Anthropic key).
- "Claude Code Subscription" wizard silently locks to `subscription-litellm` (requires both OAuth and a virtual key).

**Rationale:** The most common deployment is enterprise (LiteLLM-mediated, audit-enabled). Defaulting to true would leak user subscription tokens directly to Anthropic, bypassing audit.

**Alternatives considered:** Three-state (`on`/`off`/`user-choice`) — rejected, `user-choice` is just `on` with a confirmation; flag stays binary.

### Decision 4: Virtual key required for every LiteLLM path, including `subscription-litellm`

Even when the user has a Claude Max OAuth token, `subscription-litellm` mode requires them to ALSO paste a LiteLLM virtual key. The OAuth identifies them to Anthropic; the virtual key identifies them to LiteLLM for quota/audit. LiteLLM OSS has no other way to attribute a request to a user.

**Rationale:** LiteLLM OSS does not implement JWT/SSO (both Enterprise-gated). Without a virtual key, requests are either (a) anonymous to LiteLLM, which breaks audit, or (b) attributed to the master key, which eliminates per-user budgeting. The user-paste UX is ugly but unblocks Phase 1 immediately; `1code-api` auto-provisioning replaces it in a later change.

**Alternatives considered:** (a) Use master key + `x-litellm-customer-id` header only — rejected, the master key is a shared secret that must never ship to clients. (b) Skip virtual key, rely on Entra OID alone — rejected, LiteLLM OSS has no header-based identity; attribution requires an API key it recognizes.

### Decision 5: Delete `migrateLegacy` unconditionally, not deprecate

The mutation + useEffect are greenfield-era scaffolding for a data shape that no user in the wild has ever had. Deleting now is safer than leaving a gun that goes off on empty account lists.

**Rationale:** Every delete-the-last-account event currently triggers the migration loop, which reads the `claudeCodeCredentials` legacy table and re-seeds a phantom account. Users see "Account removed" toast followed by the account reappearing. Deprecate-then-delete takes two changes; delete now with a regression guard prevents regression.

**Alternatives considered:** Feature flag the loop off — rejected, same code shape, same bug class.

### Decision 6: Regression guards live in bun:test, not CI-only grep

Three guards in `tests/regression/`:

1. `spawn-env-invariants.test.ts` — call `deriveClaudeSpawnEnv` with every `ProviderMode` branch; assert mutually-exclusive env vars never coexist.
2. `no-entra-in-anthropic-auth-token.test.ts` — read `src/main/lib/claude/env.ts` source; assert the file contains no string `env.ANTHROPIC_AUTH_TOKEN =` in the `applyEnterpriseAuth` function body.
3. `credential-storage-tier.test.ts` (extend existing) — scan for direct-literal reads/writes of `apiKey` / `virtualKey` / `oauthToken` outside `credential-store.ts`.

**Rationale:** Grep guards in CI can be ignored by developers who don't run the full suite locally. Bun test runs in 3s and is part of every PR. Source-level text assertions are a supported pattern in this repo (`tests/regression/no-scratchpad-references.test.ts`).

**Alternatives considered:** Custom eslint rule — rejected, too much rule-authoring overhead for three checks.

### Decision 7: `MAIN_VITE_` prefix on new env vars

Per memory `feedback_doc_sync.md` and the 2026-04-13 session decision, desktop-Electron env vars use the `MAIN_VITE_` prefix so they reach the main process via the electron-vite define plugin. Both `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` and `MAIN_VITE_LITELLM_BASE_URL` follow this convention.

**Rationale:** Consistency with the prefix rename that landed in the `enterprise-auth-wiring` change. Without the prefix, the vars would not be available in the packaged app.

**Alternatives considered:** Plain `ALLOW_DIRECT_ANTHROPIC` / `LITELLM_BASE_URL` — rejected, would only work in dev via `process.env` and break in production.

## Risks / Trade-offs

- **Risk:** Users with tokens bound to Anthropic's Azure Marketplace workspace will still fail in `subscription-direct` mode because Anthropic requires `x-azure-signature` on that routing path. **Mitigation:** This change cannot reissue tokens; document in `docs/enterprise/llm-routing-patterns.md` that users experiencing the Azure-signature error must reissue their Claude CLI OAuth from a standard Anthropic workspace. Orthogonal to this change.

- **Risk:** Users paste the wrong key type into the BYOK wizard (Anthropic API key when LiteLLM is required, or vice versa). **Mitigation:** Format validation: `sk-ant-*` (42+ chars) is required for direct mode; the LiteLLM path does not prefix-validate (virtual keys have many formats) but does a canary `GET /v1/models` that fails fast if the key is wrong.

- **Risk:** Envoy Gateway JWT validation (strategy v2.1) may land later and require additional headers not anticipated here. **Mitigation:** `ANTHROPIC_CUSTOM_HEADERS` is a catch-all — any future identity header can be added without changing `deriveClaudeSpawnEnv`'s signature.

- **Risk:** `GET /v1/models` call for model enumeration fails if LiteLLM is unreachable at wizard time. **Mitigation:** Show the raw model list with a text input for manual slot mapping. The mapping is user-overridable regardless.

- **Risk:** Deleting `migrateLegacy` affects a real user somewhere who has a populated `claudeCodeCredentials` row. **Mitigation:** Greenfield per user confirmation on 2026-04-13. Release notes will mention "re-add your Claude account in Settings" just in case. The `claudeCodeCredentials` table stays in the schema (deleted row references would break the migration); only the migration tRPC and the useEffect are removed.

- **Trade-off:** The `subscription-litellm` wizard asks users for two credentials (OAuth + virtual key). Friction is real. Accepted because `1code-api` auto-provisioning is the planned fix and is on the roadmap; this change ships a working if verbose UX.

- **Trade-off:** The schema migration adds seven columns to `anthropic_accounts`. Six of them are nullable. This bloats the table but keeps the write path simple; the pure-function env derivation reads only the columns its branch needs.

## Migration Plan

**Rollout steps (main branch):**
1. Land schema migration (`bun run db:generate` → migration file checked in).
2. Land `deriveClaudeSpawnEnv` + regression guards BEFORE removing the old inference code — guards must be green on new-function + old-code-path.
3. Wire `claude.ts` to call `deriveClaudeSpawnEnv`; delete the `hasExistingApiConfig` branch.
4. Remove `applyEnterpriseAuth()`'s `ANTHROPIC_AUTH_TOKEN` write; keep identity acquisition for `x-litellm-customer-id`.
5. Land Settings UI wizard + litellmModels router together.
6. Delete `migrateLegacy` mutation + useEffect.
7. Update `docs/enterprise/llm-routing-patterns.md` + `auth-strategy.md` cross-references.
8. Enable `providerModeV2Enabled` flag default-on.

**Rollback strategy:** Feature flag `providerModeV2Enabled` (default false in code, env-override-true during rollout) — revert flag default to restore the old env derivation path. Schema additions are additive; no rollback required for the DB.

**Zero-downtime considerations:** Electron auto-updater ships both schema migration and new code atomically. Users who upgrade mid-chat-stream continue on the old code path until relaunch; no in-flight session is interrupted.

## Open Questions

- **Where does `entra_oid` come from?** Decision: read from MSAL Node account cache via `enterpriseAuth.getStatus` tRPC return value; accessor to be nailed down in tasks §4.3. Blocker on this change: no, can be wired later; the `x-litellm-customer-id` header is optional in `deriveClaudeSpawnEnv`.

- **Does `subscription-direct` actually work for any user today?** The user's Claude Max token is failing with the Azure-signature error even bypassing Entra entirely, which suggests the token may still be in a non-standard workspace. Need to verify with the user — may require them to reissue from `console.anthropic.com`. Outside the scope of this change; the four routing patterns remain correct.

- **Should we reject writes of `MAIN_VITE_LITELLM_BASE_URL` values that are obviously not LiteLLM (e.g., `https://api.anthropic.com`)?** Deferred — soft-warn for now; hard-reject only if we ship prefix-scheme restrictions via `safe-external.ts`.
