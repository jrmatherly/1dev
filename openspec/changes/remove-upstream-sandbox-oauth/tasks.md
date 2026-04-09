## 1. Red-state regression guard (TDD RED)

- [x] 1.1 Create `tests/regression/no-upstream-sandbox-oauth.test.ts` with 11 assertions organized in two layers per `design.md` §Decision 3
- [x] 1.2 Use the `token-leak-logs-removed.test.ts` offender-collection pattern: scan each scoped file-set, push hits to an `offenders` array as `{ file, pattern, lineNumber }`, and throw a formatted error naming the offending files + lines when any offender survives
- [x] 1.3 **Positive-control assertions (10-11):** assert `claude-code.ts` is readable, ≥1000 bytes, and contains `publicProcedure` and `importSystemToken`; assert both renderer files are readable and ≥1000 bytes. These fire first to catch wrong-path `readFileSync` bugs before any negative assertion can silently pass on an empty buffer
- [x] 1.4 **Assertion 1:** absence of the literal substring `claude-code/start` recursively across all files under `src/` (URL fragmentation bypass)
- [x] 1.5 **Assertion 2:** absence of the regex `/\b(startAuth|pollStatus|submitCode|openOAuthUrl)\s*:\s*publicProcedure\b/` in `claude-code.ts` specifically — whitespace-tolerant so multi-line reformatting cannot silently bypass detection (stubbing bypass)
- [x] 1.6 **Assertion 3:** absence of `getDesktopToken` anywhere in `claude-code.ts` (helper reintroduction bypass)
- [x] 1.7 **Assertion 4:** absence of the import `getApiUrl` from `"../../config"` in `claude-code.ts` (import retention bypass)
- [x] 1.8 **Assertion 5:** recursive scan of all `.ts`/`.tsx` files under `src/renderer/` for the substrings `trpc.claudeCode.startAuth`, `trpc.claudeCode.submitCode`, `trpc.claudeCode.pollStatus`, `trpc.claudeCode.openOAuthUrl` — walks the tree rather than hardcoding two file paths (renderer-scope bypass in any file, not just the two known callers)
- [x] 1.9 **Assertion 7:** cross-file scan of all `.ts` files under `src/main/` for the same procedure-definition regex as assertion 2 (`/\b(startAuth|pollStatus|submitCode|openOAuthUrl)\s*:\s*publicProcedure\b/`) — catches "move to new router file" bypass
- [x] 1.10 **Assertion 8:** cross-file scan of all `.ts` files under `src/main/` for the literal `getDesktopToken` — catches "move helper to a new file" bypass
- [x] 1.11 **Assertion 9:** recursive scan of all `.ts`/`.tsx` files under `src/renderer/` for the regex `/fetch\s*\([^)]*\/api\/auth\/[^)]*claude-code/` — catches the direct-`fetch` bypass that avoids tRPC entirely
- [x] 1.12 Run `bun test tests/regression/no-upstream-sandbox-oauth.test.ts` and confirm RED state: positive-control assertions pass, all 8 negative assertions (1-5 + 7-9) report genuine offender-formatted failures with file:line:pattern
- [x] 1.13 Read each failure message and confirm it names the exact source file and line number in the live codebase, not a test-harness bug or compile/import error

## 2. Router deletions (main process)

- [x] 2.1 Delete the `startAuth` procedure from `src/main/lib/trpc/routers/claude-code.ts` (lines 180-204 — the mutation that fetches `${getApiUrl()}/api/auth/claude-code/start`)
- [x] 2.2 Delete the `pollStatus` procedure from the same file (lines 209-244 — the query that polls `${sandboxUrl}/api/auth/${sessionId}/status`)
- [x] 2.3 Delete the `submitCode` procedure from the same file (lines 249-307 — the mutation that posts to `${sandboxUrl}/api/auth/${sessionId}/code`)
- [x] 2.4 Delete the `getDesktopToken` helper function (lines 17-23 — the JSDoc comment + function body)
- [x] 2.5 Delete the `import { getApiUrl } from "../../config"` line (line 7)
- [x] 2.6 Delete the `openOAuthUrl` procedure (lines 451-457 — the `shell.openExternal` wrapper; verified to have zero remaining callers in `src/` after the renderer cleanup in §3-§4)
- [x] 2.7 Delete any now-orphaned imports that were only used by the deleted code — removed `shell` from electron import (getAuthManager still used by storeOAuthToken)
- [x] 2.8 Run `bun test tests/regression/no-upstream-sandbox-oauth.test.ts` and confirm assertions 1-4 and 7-8 flip green; assertion 5 remains red (expected — renderer not yet cleaned)
- [x] 2.9 Run `bun run ts:check` — count went to 98 (+10 from renderer compile errors referencing deleted procedures; expected and will be resolved in §3 and §4)

## 3. Onboarding page cleanup (light)

- [x] 3.1 Open `src/renderer/features/onboarding/anthropic-onboarding-page.tsx`
- [x] 3.2 Un-hardcode the four variables at lines 72-75: replace `existingToken = null`, `hasExistingToken = false`, `checkedExistingToken = true`, `shouldOfferExistingToken = false` with values derived from the `getSystemToken` query
- [x] 3.3 Re-enable the `const existingTokenQuery = trpc.claudeCode.getSystemToken.useQuery()` line at line 70 (currently commented out) and use its data to derive `existingToken`, `hasExistingToken`, `checkedExistingToken`, `shouldOfferExistingToken`
- [x] 3.4 Delete the stale "Disabled: importing CLI token is broken" comment block at lines 68-71 (the 2-line comment + the 2-line commented-out query)
- [x] 3.5 Delete the `AuthFlowState` type definition at lines 16-33
- [x] 3.6 Delete the `flowState` / `setFlowState` state + its initial value `{ step: "idle" }`
- [x] 3.7 Delete the `startAuthMutation`, `submitCodeMutation`, `openOAuthUrlMutation` mutation declarations at lines 63-65 (keep `importSystemTokenMutation` at lines 66-67)
- [x] 3.8 Delete the `pollStatusQuery` declaration at lines 78-87
- [x] 3.9 Delete the `useEffect` that auto-starts auth on mount (the one that calls `startAuthMutation.mutate(undefined, ...)`)
- [x] 3.10 Delete all other effects and handlers tied to the sandbox flow: URL auto-open, code-input submission, `submitCode` local helper, `handleConnectClick`, `handleOpenFallbackUrl`, and any JSX that renders the sandbox state-machine UI (the code-input form, the "Connect" button, the error state for sandbox failures)
- [x] 3.11 Preserve the existing `handleUseExistingToken` handler at lines 196-210 — it already wires `importSystemTokenMutation.mutateAsync()` correctly and becomes the primary path
- [x] 3.12 Verify the JSX now renders a simple "Use existing Claude CLI login" primary action with copy explaining that the user should run `claude /login` in their terminal first; preserve any link to the BYOK path via the existing `billingMethodAtom` / `setBillingMethod` setter that already exists in the file
- [x] 3.13 Update the component's state setters and atom writes so the happy path still calls `setAnthropicOnboardingCompleted(true)` on success

## 4. Login modal cleanup (heavier)

- [x] 4.1 Open `src/renderer/components/dialogs/claude-login-modal.tsx`
- [x] 4.2 Add `const importSystemTokenMutation = trpc.claudeCode.importSystemToken.useMutation()` near the other mutation declarations
- [x] 4.3 Add a `handleUseExistingToken` handler that mirrors the onboarding page's handler shape: calls `importSystemTokenMutation.mutateAsync()`, catches errors via `error instanceof Error ? error.message : String(error)` (never logs the raw error object), handles the `"No existing Claude token found"` error with recovery copy, and transitions the modal to closed+authenticated state on success
- [x] 4.4 Add a primary button ("Use existing Claude CLI login" or equivalent) wired to that handler
- [x] 4.5 Add error-state UI that surfaces the mutation's error message with recovery copy directing the user to run `claude /login` in their terminal
- [x] 4.6 If appropriate, keep or adjust the existing "Custom Model Settings" link (`handleOpenModelsSettings` at line 310) as an escape hatch to the BYOK path in Settings > Models
- [x] 4.7 Delete the `AuthFlowState` type definition at lines 26-43
- [x] 4.8 Delete the `flowState` / `setFlowState` state machine
- [x] 4.9 Delete the `startAuthMutation`, `submitCodeMutation`, `openOAuthUrlMutation` mutation declarations at lines 69-71
- [x] 4.10 Delete the `pollStatusQuery` declaration at lines 75-84
- [x] 4.11 Delete the `useEffect` that updates flow state based on `pollStatusQuery.data`
- [x] 4.12 Delete the `useEffect` that opens the OAuth URL in the browser
- [x] 4.13 Delete the code-input form JSX, the "Connect" button, the auth-code input handling, `handleSubmitCode`, `handleKeyDown`, `handleOpenFallbackUrl`, and any other sandbox-flow UI
- [x] 4.14 Verify no stray `urlOpened`, `savedOauthUrl`, `userClickedConnect`, `urlOpenedRef` references remain after the deletions
- [x] 4.15 Verify that `agentsLoginModalOpenAtom` open/close behavior still works correctly when the user cancels out of the modal

## 5. Regression guard turns green (TDD GREEN)

- [x] 5.1 Run `bun test tests/regression/no-upstream-sandbox-oauth.test.ts` and confirm all 11 assertions pass (positive controls + 8 negative assertions)
- [x] 5.2 Run `bun test` (full suite) and confirm the total is 15+ tests across 7 regression guard files (6 existing + 1 new)
- [x] 5.3 If any assertion is still red, identify which bypass path remains unblocked and fix the underlying code — do NOT relax the guard
- [x] 5.4 Run `grep -rn "trpc\.claudeCode\.\(startAuth\|submitCode\|pollStatus\|openOAuthUrl\)" src/` as a belt-and-suspenders check against missed callers; the result must be empty

## 6. Four quality gates

- [x] 6.1 `bun run ts:check` — confirm error count is still 88 or lower (run `bun run ts:check 2>&1 | grep -cE "error TS[0-9]+"` and compare to `.claude/.tscheck-baseline`)
- [x] 6.2 `bun run build` — must exit 0; resolves the full electron-vite build pipeline including renderer bundling
- [x] 6.3 `bun test` — full regression suite must show 15+ tests passing, 0 failing, across 7 files
- [x] 6.4 `bun audit` — must show no new advisories beyond the known baseline
- [x] 6.5 If `bun run ts:check` shows the baseline INCREASED because of this change, stop and diagnose; the `.claude/settings.json` PostToolUse hook should have already flagged this

## 7. Documentation sweep (same commit)

- [x] 7.1 Open `CLAUDE.md` and fix the "**Phase 0 progress (2026-04-08):** 12 of 15 hard gates complete" line to "**Phase 0 progress (2026-04-09):** **15 of 15 hard gates complete ✅**"
- [x] 7.2 In the same Phase 0 progress block, change the `⏳ **#8** — upstream sandbox OAuth extraction` bullet to `✅ **#8** — upstream sandbox OAuth removed (see `openspec/changes/remove-upstream-sandbox-oauth/`)`
- [x] 7.3 Delete the "Claude Code OAuth flow uses upstream sandboxes as a redirect host" item from the "Known Security Gaps & Footguns" section (it is no longer a gap after this change)
- [x] 7.4 Add a one-line note after the Phase 0 progress block stating that Phase 1 enterprise auth (Entra SSO + LiteLLM gateway) is deferred to a future proposal with its own security and architecture requirements
- [x] 7.5 Open `.claude/PROJECT_INDEX.md` and grep for `gate #8` or `⏳.*#8` — if a match exists, update the status from ⏳ to ✅
- [x] 7.6 Run `grep -rn "claude-code/start\|startAuth.*publicProcedure\|getDesktopToken\|openOAuthUrl.*publicProcedure" src/` — the result must be empty, confirming all deletion targets are gone
- [x] 7.7 Run `grep -rn "trpc\.claudeCode\.\(startAuth\|submitCode\|pollStatus\|openOAuthUrl\)" src/` — the result must be empty, confirming all renderer call sites are gone
- [x] 7.8 Confirm no new references to any gitignored working-directory path were introduced in committed files by this change, per the existing user-memory rule forbidding such cross-references

## 8. Commit and session close

- [ ] 8.1 Stage all modified / created / deleted files with explicit paths (NOT `git add -A`)
- [ ] 8.2 Write commit message in conventional-commit format with the subject line `feat(security): close Phase 0 gate #8 by removing upstream sandbox OAuth`
- [ ] 8.3 Verify the commit message references the OpenSpec change directory, summarizes the asymmetric renderer cleanup, and documents the deferred Phase 1 scope
- [ ] 8.4 Run `git commit` (NOT `git commit --amend`, even if hooks fail — fix the issue, stage, commit anew)
- [ ] 8.5 Run `git log --oneline -1` and `git status --short` to confirm clean state
- [ ] 8.6 Prompt the user to start the separate `safeStorage` platform-degradation discussion before scaffolding the future enterprise-auth proposal
