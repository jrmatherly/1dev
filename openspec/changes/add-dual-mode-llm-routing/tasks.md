## 1. Schema + types foundation

- [x] 1.1 Extend `anthropic_accounts` table in `src/main/lib/db/schema/index.ts` with columns: `accountType` (enum `claude-subscription | byok`, NOT NULL), `routingMode` (enum `direct | litellm`, NOT NULL default `litellm`), `apiKey` (text nullable), `virtualKey` (text nullable), `modelSonnet` (text nullable), `modelHaiku` (text nullable), `modelOpus` (text nullable). Make `oauthToken` nullable (was NOT NULL).
- [x] 1.2 Run `bun run db:generate` to produce a migration file under `drizzle/`; check in the generated SQL. (Hand-edited `0010_flowery_blackheart.sql` INSERT to select only columns that exist in old schema; new columns get DEFAULT.)
- [x] 1.3 Add `ProviderMode` discriminated-union type to `src/main/lib/claude/spawn-env.ts` header (see design.md §Decision 2 for shape).
- [x] 1.4 Extend `ModelProfile` and `CustomClaudeConfig` types in `src/renderer/lib/atoms/index.ts` with optional `accountType`, `routingMode`, `apiKey`, `virtualKey`, `modelMap`. Keep legacy fields for backward compat until step 7.3.

## 2. Pure env-derivation function

- [x] 2.1 Create `src/main/lib/claude/spawn-env.ts` exporting `deriveClaudeSpawnEnv(mode: ProviderMode, liteLlmBaseUrl?: string)` and `buildLiteLlmHeaders(virtualKey?: string, customerId?: string)` per design.md §Decision 1.
- [x] 2.2 Write `tests/regression/spawn-env-invariants.test.ts` exercising all four `ProviderMode` kinds. Assert exact env-var key sets per llm-routing spec scenarios.
- [x] 2.3 Verify `bun test tests/regression/spawn-env-invariants.test.ts` passes green. (14 pass, 39 expects)

## 3. Credential storage wiring

- [x] 3.1 Update `src/main/lib/trpc/routers/anthropic-accounts.ts` — all writes to `oauthToken`, `apiKey`, `virtualKey` columns MUST wrap value in `encryptCredential(...)` from `src/main/lib/credential-store.ts`; all reads MUST wrap in `decryptCredential(...)`. (add mutation extended; routing-mode-aware inserts)
- [x] 3.2 Extend `tests/regression/credential-storage-tier.test.ts` to assert the three anthropicAccounts credential columns route through `credential-store.ts` exclusively (grep scan matching existing pattern).
- [x] 3.3 Verify `bun test tests/regression/credential-storage-tier.test.ts` passes green. (10 pass)

## 4. Remove Entra-JWT-as-Anthropic-bearer coupling

- [x] 4.1 Edit `src/main/lib/claude/env.ts:217-247` (`applyEnterpriseAuth` function) — removed the `env.ANTHROPIC_AUTH_TOKEN = token` write and the `env.ANTHROPIC_BASE_URL = proxyUrl` write. `getValidToken()` still called for side-effect (MSAL cache warming + early failure).
- [x] 4.2 Write `tests/regression/no-entra-in-anthropic-auth-token.test.ts` that reads `src/main/lib/claude/env.ts`, extracts the `applyEnterpriseAuth` function body, and asserts it contains no `env.ANTHROPIC_AUTH_TOKEN =` assignment.
- [x] 4.3 Add helper `getEntraCustomerId(): Promise<string | undefined>` in `src/main/lib/enterprise-auth.ts` returning the `oid` claim from the cached MSAL account. **Skipped — not needed:** `authManager.getUser()?.id` already returns the `oid` when enterprise mode is active via existing `adaptEnterpriseUser()` helper. Task 5.1 will consume that directly.
- [x] 4.4 Verify `bun test tests/regression/no-entra-in-anthropic-auth-token.test.ts` passes green. (2 pass)

## 5. Rewire claude.ts to call deriveClaudeSpawnEnv

- [x] 5.1 Added `getActiveProviderMode()` helper in `src/main/lib/trpc/routers/claude.ts` (after `getClaudeCodeToken`) that reads the active `anthropicAccounts` row, decrypts via `credential-store.ts`, pulls Entra `oid` from `authManager.getUser()?.id`, and builds the typed `ProviderMode` union.
- [x] 5.2 In the `query.start` handler, compute `providerMode` (skipped when `finalCustomConfig` is present — preserves Ollama/Jotai BYOK path). When present, call `deriveClaudeSpawnEnv(providerMode, process.env.MAIN_VITE_LITELLM_BASE_URL)`. On throw (missing URL), emit error and finish the stream.
- [x] 5.3 `finalEnv` construction now branches: if `derivedEnv` present, clear `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`/`ANTHROPIC_CUSTOM_HEADERS`/`CLAUDE_CODE_OAUTH_TOKEN` from `claudeEnv` then spread `derivedEnv` on top. Legacy path preserved for Ollama/Jotai BYOK (tracked on roadmap follow-up). **Scope-limiting decision noted in answer to scoping question on 2026-04-13.**
- [x] 5.4 `bun run ts:check` — 0 errors (baseline preserved at 0).
- [x] 5.5 `bun run build` — builds in 44.03s without new warnings.

## 6. Rename LITELLM_PROXY_URL to MAIN_VITE_LITELLM_BASE_URL

- [x] 6.1 Src/ already clean of `LITELLM_PROXY_URL` (only reference was in `applyEnterpriseAuth` which was removed in Task 4.1); updated the single code example in `docs/enterprise/auth-strategy.md:668` to reference the new name.
- [x] 6.2 Added `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` and `MAIN_VITE_LITELLM_BASE_URL` to `.env.example` with usage comments.
- [x] 6.3 Wrote `tests/regression/no-legacy-litellm-proxy-url.test.ts` — walks `src/main/` and asserts no reference remains.
- [x] 6.4 Verified 2 pass.

## 7. Delete migrateLegacy path

- [x] 7.1 Removed the `migrateLegacy` mutation body from `anthropic-accounts.ts`; replaced with a deprecation comment referencing the spec's REMOVED Requirements section.
- [x] 7.2 Removed the `useEffect` block in `agents-models-tab.tsx`.
- [x] 7.3 Removed the `migrateLegacy` mutation handle + the `trpc.claudeCode.getIntegration.useQuery()` call that only fed it. No unused imports left behind.
- [x] 7.4 Removed the `claudeCodeCredentials` mirror write inside `storeOAuthToken`. Added `accountType: "claude-subscription"` + env-derived `routingMode` to the `anthropicAccounts` insert so imported Keychain tokens land in the correct mode from day one.
- [x] 7.5 Created `tests/regression/no-migrate-legacy.test.ts` with three checks: (a) no `migrateLegacy:` procedure definition in the router, (b) no `migrateLegacy.*` references in `agents-models-tab.tsx`, (c) recursive renderer scan for `trpc.anthropicAccounts.migrateLegacy`. All 3 pass.

## 8. litellmModels tRPC router

- [ ] 8.1 Create `src/main/lib/trpc/routers/litellm-models.ts` exporting a router with a `listUserModels` procedure: input `{ virtualKey: string }`, output `{ models: Array<{ id: string }> }`. Implementation: `fetch(${MAIN_VITE_LITELLM_BASE_URL}/v1/models, { headers: { Authorization: 'Bearer ' + virtualKey } })`. Handle 401 / network errors by rethrowing with a user-facing message.
- [ ] 8.2 Mount the new router in `src/main/lib/trpc/routers/index.ts` as `litellmModels`. Update `docs/architecture/trpc-routers.md` count (22 → 23).
- [ ] 8.3 Run the `trpc-router-auditor` subagent (or `bun run check:trpc-routers` if wired) to confirm counts align.

## 9. Settings UI wizard (two account types)

- [ ] 9.1 Redesign `AnthropicAccountsSection` in `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`. Replace the single "Add" button with a wizard dialog.
- [ ] 9.2 Step 1: account-type chooser — "Existing Claude Code Subscription" | "Bring Your Own API Key".
- [ ] 9.3 Step 2 (routing mode): conditionally rendered when `import.meta.env.MAIN_VITE_ALLOW_DIRECT_ANTHROPIC === "true"`. Otherwise silently lock to `litellm`.
- [ ] 9.4 Step 3 (credentials for `claude-subscription`): reuse existing Keychain import flow. For `routingMode="litellm"`, additionally prompt for a LiteLLM virtual key with explanatory copy.
- [ ] 9.5 Step 3 (credentials for `byok`): text input for key. Validate: `direct` mode requires match on `/^sk-ant-[a-z0-9-]{30,}/i`; `litellm` mode accepts any non-empty string.
- [ ] 9.6 Step 4 (BYOK-LiteLLM only): "Fetch Models" button calling `trpc.litellmModels.listUserModels`. On success, show three dropdowns (Sonnet/Haiku/Opus) pre-filled with regex-best-match from returned ids; on failure show error + three plain text inputs.
- [ ] 9.7 Persist via an extended `trpc.anthropicAccounts.add` mutation that accepts the full new shape.

## 10. Documentation

- [ ] 10.1 Create `docs/enterprise/llm-routing-patterns.md` with the four-pattern matrix, spawn-env recipes, and UI screenshots-placeholder section. Reference from the `docs` nav.
- [ ] 10.2 Update `docs/enterprise/auth-strategy.md` to cross-reference the new page and clarify that Entra access tokens never flow into Anthropic bearer headers.
- [ ] 10.3 Update `CLAUDE.md` "Dev environment quick reference" with the new `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` and `MAIN_VITE_LITELLM_BASE_URL` vars.
- [ ] 10.4 Add a roadmap entry to `docs/operations/roadmap.md` — "1code-api LiteLLM virtual-key auto-provisioning" with prereq = this change archived, effort = M, reference = design.md §Decision 4.
- [ ] 10.5 Update `.claude/PROJECT_INDEX.md` and `.serena/memories/codebase_structure.md` for new files + router count.

## 11. Manual smoke test

- [ ] 11.1 Start dev server with `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=false` + `MAIN_VITE_LITELLM_BASE_URL=https://llms.<cluster>` set.
- [ ] 11.2 Sign in with Entra, then add a Claude Subscription account (paste OAuth + virtual key). Send a chat — verify it succeeds and `[claude-auth]` logs show `Using CLAUDE_CODE_OAUTH_TOKEN: true` + `Using ANTHROPIC_BASE_URL: https://llms...` + `Using ANTHROPIC_AUTH_TOKEN: false`.
- [ ] 11.3 Delete the account. Verify it stays deleted (no re-seed). Verify the toast says "Account removed" exactly once.
- [ ] 11.4 Add a BYOK account with `routingMode="litellm"`. Click "Fetch Models". Verify the three slots auto-fill and chat send succeeds.
- [ ] 11.5 With `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=true`, repeat the flows choosing direct routing. Verify direct path works for both account types.

## 12. Quality gates

- [ ] 12.1 Run all 5 quality gates locally: `bun run ts:check && bun run build && bun test && bun audit && cd docs && bun run build`.
- [ ] 12.2 Verify `.claude/.tscheck-baseline` count does not increase.
- [ ] 12.3 Push branch, let CI run all 5 gates — confirm green before opening PR.
- [ ] 12.4 Run the `docs-drift-check` skill to catch any documentation surface drift (CLAUDE.md, README, memories, PROJECT_INDEX).

## 13. Archive

- [ ] 13.1 After PR merges and manual smoke passes in production build, run `openspec archive add-dual-mode-llm-routing`.
- [ ] 13.2 Verify the archived change moves to `openspec/changes/archive/<date>-add-dual-mode-llm-routing/` and specs are merged into `openspec/specs/`.
- [ ] 13.3 Close the roadmap item for "1code-api LiteLLM virtual-key auto-provisioning" on the "Recently Completed" side if the follow-up change has not yet started, or update prereqs to reflect completion.
