## 1. Prerequisite: promote `@anthropic-ai/sdk` to explicit dep

- [x] 1.1 Add `@anthropic-ai/sdk: ^0.81.0` to `dependencies` in `package.json` (matches the transitive version currently resolved via `@anthropic-ai/claude-agent-sdk`).
- [x] 1.2 Run `bun install` to update `bun.lock`. Verify the explicit dep appears at root-level `dependencies` and the transitive entry is still intact.
- [x] 1.3 Add pin rationale to `docs/conventions/pinned-deps.md` — explain that promoting from transitive to explicit protects packaged builds from upstream re-hoisting.

## 2. Raw-logger concurrent-write fix

- [x] 2.1 Replace `let logsDir: string | null` with `let logsDirPromise: Promise<string> | null` in `src/main/lib/claude/raw-logger.ts`. Update `ensureLogsDir()` to await the singleton promise. On rejection, reset the promise to null so the next call can retry.
- [x] 2.2 Write `tests/regression/raw-logger-concurrent-writes.test.ts` — shape guard matching the project's grep-based regression-guard convention (runtime concurrency verified per §18 manual smoke).
- [x] 2.3 Verify `bun test tests/regression/raw-logger-concurrent-writes.test.ts` passes green.

## 3. Migration + schema hotfix (Critical: A-C1, A-C2)

- [x] 3.1 In `src/main/lib/db/schema/index.ts`, change the `routingMode` column default from `"litellm"` to `"direct"`. Existing users were direct-to-Anthropic before `add-dual-mode-llm-routing`; defaulting to `direct` matches their working state.
- [x] 3.2 Hand-edit `drizzle/0010_flowery_blackheart.sql`: the INSERT that copies legacy rows into `__new_anthropic_accounts` MUST populate `routing_mode='direct'` for all backfilled rows. Keep the table-level DEFAULT in sync (`'direct'` on the column).
- [x] 3.3 Add a prominent top-of-file comment to `drizzle/0010_flowery_blackheart.sql` naming it as a hand-edited migration (documented exception), cross-referencing `.claude/rules/database.md`.
- [x] 3.4 Update `.claude/rules/database.md` with an "Allowed exceptions" section + registry entry for `0010_flowery_blackheart.sql`. Peer review required for future hand-edits.
- [x] 3.5 Updated `drizzle/meta/0010_snapshot.json` — `routing_mode` default flipped from `'litellm'` to `'direct'` to match the revised schema + hand-edit. Snapshot + SQL now in lockstep.
- [ ] 3.6 **DEFERRED TO GROUP 18 MANUAL SMOKE** — pristine DB + legacy-migration smoke tests require a running dev server and DB manipulation (operator action). Automated check: `bun test tests/regression/` passes 129/129 and `bun run ts:check` reports 0 errors after the schema + migration edits.

## 4. Startup preflight warning (Important: complements A-C1)

- [x] 4.1 Added new module `src/main/lib/startup-preflight.ts` with `runStartupPreflight()`. Imported into `src/main/index.ts` and called right after `initDatabase()`.
- [x] 4.2 Preflight is advisory-only — `try/catch` swallows errors; no early-return that would block startup.
- [x] 4.3 Added `docs/operations/env-gotchas.md` §7 documenting the warning format + 3 remediation paths.

## 5. applyEnterpriseAuth return type tightening (A-I4)

- [x] 5.1 Changed signature to `Promise<void>`; removed `return env`; added `void env` placeholder + comment naming the reserved future header-mutation target.
- [x] 5.2 Call site at `env.ts:327` was already `await applyEnterpriseAuth(env)` (no assignment) — no change needed.
- [x] 5.3 `bun run ts:check` — baseline 0 preserved.

## 6. getClaudeCodeToken BYOK-null-return (Important: A-I1)

- [x] 6.1 Added early-return branch in `getClaudeCodeToken()`: when `account.accountType === "byok"`, return null immediately (no legacy fallback).
- [x] 6.2 Wrote `tests/regression/no-legacy-oauth-byok-leak.test.ts` (shape guard): asserts branch presence, source-order placement before legacy fallback, literal `"byok"` comparison.
- [x] 6.3 Guard passes green — 4/4 tests, 6 assertions.

## 7. Rule documentation rewrite (A-I2)

- [x] 7.1 Rewrote `.claude/rules/auth-env-vars.md` end-to-end: post-decoupling contract, enforcement + regression guard refs, cluster prerequisite unchanged.
- [x] 7.2 Added §4.9 cross-reference block in `docs/enterprise/auth-strategy.md` linking to the revised rule + regression guard.

## 8. Broader regression guard for Entra-to-AUTH_TOKEN (A-I3)

- [x] 8.1 Added second test walking all `.ts`/`.tsx` files under `src/main/` and scanning for forbidden bind-then-assign shapes in either direction.
- [x] 8.2 Existing `applyEnterpriseAuth` body extraction preserved as primary scan.
- [x] 8.3 Guard passes green — 3/3 tests, positive-control finds 20+ files.

## 9. Per-kind expected-key-set matrix for spawn-env-invariants (A-I5)

- [x] 9.1 Replaced loose `credentialVarCount ≤ 1` with per-kind expected-key-set matrix (4 test cases: subscription-direct, subscription-litellm, byok-direct, byok-litellm).
- [x] 9.2 Added `sk-ant-*` prefix regex check for `byok-litellm` mode — flags Anthropic-token leaks into the virtual-key slot as semantic violations.
- [x] 9.3 Guard passes green — 18/18 tests (up from 14), 41 assertions.

## 10. Provider-aware auxiliary-AI module

- [x] 10.1 Create `src/main/lib/aux-ai.ts` exporting:
  - `AuxAiDeps` interface (createAnthropic, generateOllamaName, getProviderMode, getFlag)
  - `makeGenerateChatTitle(deps: AuxAiDeps)` factory
  - `makeGenerateCommitMessage(deps: AuxAiDeps)` factory
  - Already-bound convenience exports `generateChatTitle`, `generateCommitMessage`
- [x] 10.2 Implement the dispatch matrix in `makeGenerateChatTitle`:
  - Guard: `if (!deps.getFlag("auxAiEnabled")) return fallback`
  - Resolve `mode = deps.getProviderMode()`
  - Route: `subscription-litellm`/`byok-litellm` → `generateViaLiteLlm` ; `byok-direct` → `generateViaAnthropicDirect` ; else → Ollama → fallback
  - `generateViaLiteLlm(mode)`: `deps.createAnthropic({ baseURL: process.env.MAIN_VITE_LITELLM_BASE_URL, authToken: mode.virtualKey, defaultHeaders: mode.customerId ? { "x-litellm-customer-id": mode.customerId } : undefined })`
  - `generateViaAnthropicDirect(mode)`: `deps.createAnthropic({ apiKey: mode.apiKey })`
  - Model resolution: `deps.getFlag("auxAiModel")` nonempty → flag value; `mode.kind` is LiteLLM AND `mode.modelMap.haiku` → modelMap value; else `claude-3-5-haiku-latest`
  - Timeout: use `AbortController` with `setTimeout(..., deps.getFlag("auxAiTimeoutMs"))`
  - Hardcoded: `max_tokens: 50`, `temperature: 0.3`
- [x] 10.3 Implement `makeGenerateCommitMessage` with the same dispatch but hardcoded `max_tokens: 200`, `temperature: 0.5`.
- [x] 10.4 Export bound convenience versions `generateChatTitle` + `generateCommitMessage` that wire `deps` from production sources (real `@anthropic-ai/sdk`, `generateChatNameWithOllama` from `chats.ts` via `setOllamaNameGenerator`, `getActiveProviderMode` from `claude.ts`, `getFlag` from `feature-flags.ts`).

## 11. Refactor chats.ts to delegate to aux-ai.ts

- [x] 11.1 In `src/main/lib/trpc/routers/chats.ts:1445` (`generateSubChatName`), remove the `apollosai.dev` fetch. Delegate to `generateChatTitle(input.userMessage)` from `aux-ai.ts`. Keep the tRPC procedure signature unchanged (still returns `{ name: string }`).
- [x] 11.2 In `src/main/lib/trpc/routers/chats.ts:1340` (the `generate-commit-message` call site), delegate to `generateCommitMessage(context)` from `aux-ai.ts`.
- [x] 11.3 Verify `bun run ts:check` — 0 errors.

## 12. Feature flags addition

- [x] 12.1 Add four entries to `FLAG_DEFAULTS` in `src/main/lib/feature-flags.ts`:
  - `auxAiEnabled: true`
  - `auxAiModel: ""`
  - `auxAiTimeoutMs: 5000`
  - `auxAiOrigin: ""`
- [x] 12.2 Add per-flag JSDoc blocks explaining each flag's purpose and the precedence chain.
- [x] 12.3 Update `docs/conventions/feature-flags.md` with the new flags.
- [x] 12.4 Verify type inference: `getFlag("auxAiEnabled")` → `boolean`, `getFlag("auxAiModel")` → `string`, etc.

## 13. Aux-AI regression guard

- [x] 13.1 Wrote `tests/regression/aux-ai-provider-dispatch.test.ts` as a SHAPE-based guard (cannot import Electron from bun:test). Asserts:
  - DI factory exports + bound versions present
  - Per-ProviderMode-kind branches present + correct opts (apiKey vs authToken, customerId header)
  - Model resolution chain (flag → modelMap → default `claude-3-5-haiku-latest`)
  - `auxAiEnabled` kill-switch checked in BOTH factories
  - Hardcoded max_tokens/temperature for both helpers
  - 25-char truncated fallback contract
- [x] 13.2 Guard passes green — 15/15 tests, 37 assertions.

## 14. No-upstream grep guard

- [x] 14.1 Wrote `tests/regression/no-apollosai-aux-ai-fetch.test.ts` — scans both files, asserts zero matches for the two upstream agent endpoints. Positive control verifies `aux-ai.ts` exists with expected exports + chats.ts delegates to it.
- [x] 14.2 Guard passes green — 6/6 tests, 17 assertions.

## 15. SignedFetch origin-conditional allowlist + cache

- [x] 15.1 Added module-scoped `checkUpstreamGate(url, rawApiUrl)` + `isUpstreamDisabled` helpers in `src/main/windows/main.ts`. Wired into BOTH `api:signed-fetch` and `api:stream-fetch` handlers. Removed the silent `|| "https://apollosai.dev"` fallback — unset env vars now reject with `disabled_by_env`. Logs once per origin per process via `upstreamLogged` Set.
- [x] 15.2 Added module-scoped `unreachableCache: Map<string, { checkedAt: number }>` with `UNREACHABLE_TTL_MS = 60_000`. `recordUnreachable()` populates on ECONNREFUSED/ENOTFOUND in both fetch catch blocks; gate short-circuits subsequent calls within the TTL.
- [x] 15.3 Wrote `tests/regression/signed-fetch-cache.test.ts` as a SHAPE-based guard (Electron import boundary). Asserts presence of all helpers, the gate-before-fetch flow, the 60s TTL constant, and recordUnreachable wiring at both call sites.
- [x] 15.4 Guard passes green — 11/11 tests, 22 assertions.

## 16. F-entry catalog updates (with qualified-resolved status)

- [x] 16.1 Added F11 section to `docs/enterprise/upstream-features.md` between F10 and the Summary Table. Documents historical dependency, current `aux-ai.ts` implementation, per-mode status (3/4 resolved + qualified `subscription-direct`).
- [x] 16.2 Added F12 section analogously. Both entries also rolled into the Summary Table.
- [ ] 16.3 Run `/docs-drift-check` (manually-invoked skill) — DEFERRED to operator. Recommended right before archive (Group 20).

## 17. Quality gates

- [x] 17.1 `bun run ts:check` — baseline 0 errors preserved.
- [x] 17.2 `bun run build` — built in 39.54s, no new warnings.
- [x] 17.3 `bun test tests/regression/` — 170/170 pass (was 138 pre-Group 13; +32 from new guards).
- [x] 17.4 `bun run lint` (local advisory) — clean (after fixing 1 SonarJS false positive in aux-ai.ts default Ollama generator + removing 1 stale eslint-disable in chats.ts).
- [x] 17.5 `cd docs && bun run build` — xyd-js docs site built in 20.42s.
- [x] 17.6 `bun audit` — 55 vulnerabilities (was 56 pre-change), zero NEW advisories from this work.

## 18. Manual smoke

- [ ] 18.1 **Pristine DB smoke** — delete `~/Library/Application Support/Agents Dev/data/agents.db`, `bun run dev`. Verify migration runs cleanly with new `routing_mode='direct'` default.
- [ ] 18.2 **Legacy-migration smoke** — restore a dev DB from before `0010_flowery_blackheart.sql`, `bun run dev`. Verify: existing rows backfilled to `routing_mode='direct'`; chat works immediately without `MAIN_VITE_LITELLM_BASE_URL` being set.
- [ ] 18.3 **Subscription-direct smoke** — sign in with Entra, import Claude Max OAuth, send a test chat. Verify: chat works. Verify: title is Ollama-generated (if running) or truncated fallback (if not). Verify: ZERO `apollosai.dev` errors. Verify: `logs/claude/<session>.jsonl` exists, no ENOENT errors.
- [ ] 18.4 **BYOK-direct smoke** — switch account to `byok-direct` with a test Anthropic API key. Send a chat. Verify: title is AI-generated. Verify: no call to `api.anthropic.com` appears in `[SignedFetch]` logs (SDK bypasses the IPC handler — verify via Electron net-log or proxy-debugger instead).
- [ ] 18.5 **LiteLLM smoke** — set up a test `MAIN_VITE_LITELLM_BASE_URL`, switch account to `byok-litellm` with a test virtual key, verify `x-litellm-customer-id` header is included in the outbound request (inspect via proxy tools).
- [ ] 18.6 **Flag-override smoke** — `setFlag("auxAiModel", "claude-sonnet-4-5")` via dev console, verify the SDK call uses the overridden model.
- [ ] 18.7 **Kill-switch smoke** — `setFlag("auxAiEnabled", false)`, verify title is always truncated fallback regardless of provider mode.
- [ ] 18.8 **Startup preflight smoke** — manually seed an `anthropic_accounts` row with `routing_mode='litellm'` but don't set `MAIN_VITE_LITELLM_BASE_URL`. Restart. Verify the warning logs at startup.
- [ ] 18.9 **SignedFetch smoke** — load sidebar + help popover + settings. Verify at most ONE `[SignedFetch] upstream disabled` line per origin per session.

## 19. Follow-up roadmap entries

- [x] 19.1 Added `[Ready] Settings UI for feature-flag runtime toggling` to `docs/operations/roadmap.md` P3 section.
- [x] 19.2 Added `[Deferred] Codex-direct / Codex-litellm provider modes in aux-ai dispatch` to roadmap P3 section.
- [x] 19.3 Added `[Ready] Runtime drift detection for landed migrations` to roadmap P3 section.

## 20. Archive

- [ ] 20.1 After PR merges and manual smoke (Group 18) confirms all scenarios, run `openspec archive remediate-dev-server-findings`.
- [ ] 20.2 Verify specs promoted: `openspec/specs/observability-logging/spec.md` exists; `openspec/specs/renderer-data-access/spec.md`, `openspec/specs/feature-flags/spec.md`, `openspec/specs/enterprise-auth/spec.md`, `openspec/specs/claude-code-auth-import/spec.md` all have the new requirements merged.

## Minor cleanup (tracked — apply during implementation, no separate sign-off needed)

The following items from the code review are minor and will be addressed opportunistically during the tasks above:

- **M1** `design.md` had two "Decision 3" sections — ALREADY FIXED in this revision (renumbered to Decisions 1-10).
- **M2** Spec requirements should not reference test file paths — ALREADY FIXED in `observability-logging` spec (test file moved to tasks.md §2.2).
- **M3** Default values phrased inconsistently — ALREADY FIXED in revised proposal.md.
- **M4** Task 6.2 originally claimed `[SignedFetch]` log entry for `api.anthropic.com` — FIXED in Task 18.4 (SDK bypasses IPC handler, verify via net-log instead).
- **M5** Rollback strategy claim weaker than stated — FIXED in design.md §Migration Plan.
- **M6** F11/F12 P-priority vs RESOLVED framing — FIXED (qualified-resolved status).
- **M7** `src/main/lib/config.ts` path — `isUpstreamAllowed()` helper dropped entirely (collapsed into existing allowlist per Decision 4).
- **M8** TS baseline protection guidance — Task 17.1 covers this; if a new error emerges, fix before proceeding.

Review findings explicitly captured as follow-up tasks above:
- **A-I1, A-I2, A-I3, A-I4, A-I5** — Tasks 6, 7, 8, 5, 9 respectively.
- **B-C1, B-C2, B-C3** — Tasks 1 (dep promotion), 10.2 (model precedence), absorbed into design (codex-direct deletion).
- **B-I1, B-I2, B-I3, B-I4, B-I5, B-I6, B-I7, B-I8** — Tasks 10.2 (customerId header), 10.2 (modelMap precedence), 10 (DI factory), 15 (allowlist collapse), 12 (feature flags), 16 (qualified RESOLVED), 10 (no extraction), 2.1 (spec text).
