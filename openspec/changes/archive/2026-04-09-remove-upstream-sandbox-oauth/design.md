## Context

Phase 0 hard gate #8 requires removing the Claude Code router's dependency
on an upstream-provided CodeSandbox VM as an OAuth redirect host. The
current code at `src/main/lib/trpc/routers/claude-code.ts` (lines 180-307)
exposes three tRPC procedures (`startAuth`, `pollStatus`, `submitCode`) that
together:

1. Ask the upstream backend (`${getApiUrl()}/api/auth/claude-code/start`)
   to provision a sandbox VM and return a `sandboxUrl` + `sessionId`
2. Poll `${sandboxUrl}/api/auth/${sessionId}/status` for the OAuth URL the
   user should visit
3. Submit the OAuth code the user receives back to
   `${sandboxUrl}/api/auth/${sessionId}/code` and receive a usable token

This is a P0 hidden dependency inside what looks like a P3 background-agents
router — the only reason the enterprise fork cannot be shipped standalone
today is that the primary auth path for Claude Code on first install hits
upstream. CLAUDE.md's "Known Security Gaps & Footguns" section explicitly
calls this out.

A prior session in this workstream drafted a broader plan that bundled
three concerns into a single change:

- **(A)** Delete the sandbox OAuth procedures
- **(B)** Add environment-variable bearer-token injection for an
  enterprise gateway (`ANTHROPIC_AUTH_TOKEN` on Claude/Codex spawn)
- **(C)** Introduce a three-segment auth model (Enterprise / Max / BYOK)
  with gateway URLs stored in feature flags

A 4-reviewer independent audit of that plan returned **6 Critical and 6
High findings** that the three concerns must be unbundled. The core
problems:

- **(B)** regresses the auth strategy's hard rule against environment-variable
  bearer injection. Any same-UID process on the host can read
  `/proc/<pid>/environ` (Linux), `ps eww` (macOS), or
  `NtQueryInformationProcess` (Windows) and extract the bearer token. The
  mandated alternative is a helper that writes the token to a 0600 tmpfile
  and passes `ANTHROPIC_AUTH_TOKEN_FILE=/path` instead — and that helper
  is Phase 1 work because it requires verifying the pinned Claude CLI
  version supports `ANTHROPIC_AUTH_TOKEN_FILE` and that cluster-side
  lock-down is in place.
- **(C)** would store gateway URLs (and eventually credentials) in the
  `feature_flag_overrides` Drizzle table, which is plain
  `text("value").notNull()` with no encryption and no redaction in the
  admin inspection procedure.
- **(B)** and **(C)** together create a silent-misconfig downgrade: if the
  enterprise flag is enabled but MSAL token acquisition fails, the flow
  falls back to the legacy token-file path without surfacing the
  degradation to the user.
- **(B)** duplicates an existing `buildClaudeEnv({ customEnv })` substrate
  in `src/main/lib/trpc/routers/claude.ts` rather than extending it.

The audit's binding conclusion: ship **(A)** only. The existing
`importSystemToken` procedure already covers the Claude Max subscription
path (via `~/.claude/.credentials.json` and the platform keychain), and
the existing `api-key-onboarding-page.tsx` + `customClaudeConfigAtom`
already covers the BYOK (bring-your-own-key) path via an independent
client-side storage mechanism. No new injection code is needed to close
Phase 0. **(B)** and **(C)** belong in a future enterprise-auth proposal
that will start from a known-clean router surface and include a dedicated
credential-storage discussion.

A pre-implementation audit of the live codebase (distinct from the
4-reviewer audit above) surfaced six additional facts that reshape the
cleanup scope:

1. **The two renderer callers are not symmetric.** `anthropic-onboarding-page.tsx`
   already has `importSystemTokenMutation` wired (line 66-67) and an
   already-defined `handleUseExistingToken` handler (lines 196-210) that
   calls it — the path is blocked only by a stale comment block and a set
   of `hasExistingToken = false` hardcodes at lines 72-75.
   `claude-login-modal.tsx` has no references to `importSystemToken` at
   all and needs the mutation wired from scratch plus a new button with
   supporting copy.
2. **`trpc.claudeCode.importToken` is never called from the renderer.**
   A full-tree grep for `importToken` returns exactly one hit (the
   router definition at line 309). It has never been wired to UI.
3. **The existing BYOK path lives elsewhere.** BYOK is handled by
   `src/renderer/features/onboarding/api-key-onboarding-page.tsx` which
   writes to the `customClaudeConfigAtom` Jotai atom — a completely
   independent storage mechanism from the `anthropicAccounts` table that
   `importToken` writes to. Wiring `importToken` into the sandbox-flow
   cleanup would create a second parallel BYOK storage mechanism and
   cause real UX drift.
4. **There is no "Enterprise" tab or UI segmentation** in either
   renderer file. Both files are single-purpose: one onboarding page, one
   login modal, both wired purely to the sandbox OAuth flow. There is no
   enterprise-specific UI surface to replace with a Phase 1 placeholder.
5. **`storeOAuthToken` writes to three tables, not one.** The helper at
   `claude-code.ts:51-103` inserts a new row into `anthropicAccounts`,
   upserts `anthropicSettings.singleton.activeAccountId` to point at the
   new row, and mirrors the token into the legacy `claudeCodeCredentials`
   table. All three writes remain in effect after this change; only the
   sandbox-flow acquisition path is removed.
6. **The `openOAuthUrl` tRPC procedure becomes dead code after the
   renderer cleanup.** It has exactly two callers today —
   `anthropic-onboarding-page.tsx:65` and `claude-login-modal.tsx:71` —
   and both are scheduled for deletion in §3 and §4 of this change. The
   procedure itself (a thin `shell.openExternal` wrapper at
   `claude-code.ts:451-457`) is therefore also deleted as part of this
   change's scope.

The artifacts in this change proposal reflect these six facts.

## Goals / Non-Goals

**Goals:**

- Delete `claudeCode.startAuth`, `claudeCode.pollStatus`,
  `claudeCode.submitCode`, and `claudeCode.openOAuthUrl` from
  `claude-code.ts`
- Delete the `getDesktopToken` helper and the `getApiUrl` import (both
  only used by the deleted procedures)
- Un-hardcode the already-present `importSystemToken` path in
  `anthropic-onboarding-page.tsx` by removing the stale comment block and
  re-enabling the `getSystemToken` query
- Delete the sandbox-flow state machine (`AuthFlowState` type, state
  reducer, and all sandbox-flow references) from `anthropic-onboarding-page.tsx`
- Add `importSystemTokenMutation` + a new "Use existing Claude CLI login"
  button with supporting copy to `claude-login-modal.tsx`
- Delete the sandbox-flow state machine from `claude-login-modal.tsx`
- Add a bypass-resistant regression guard at
  `tests/regression/no-upstream-sandbox-oauth.test.ts` covering the
  seven original bypass paths plus four additional bypass paths
  identified by a second independent review
- Close Phase 0 hard gate #8 and fix the stale "12 of 15" drift in
  CLAUDE.md's Phase 0 progress header
- Delete the "Claude Code OAuth flow uses upstream sandboxes as a
  redirect host" footgun note in CLAUDE.md (no longer a footgun after
  this change)

**Non-Goals (explicitly out of scope for this change):**

- Environment-variable injection of bearer tokens on Claude/Codex spawn
- Any edit to `src/main/lib/trpc/routers/claude.ts`
- Any edit to `src/main/lib/claude/env.ts`
- The `applyEnterpriseAuth()` tmpfile pattern (Phase 1)
- MSAL-in-Electron integration
- Feature-flag extensions carrying gateway URLs, credentials, or auth
  mode selectors
- Three-segment auth model (Enterprise / Max / BYOK) wiring
- Envoy Gateway routing, LiteLLM virtual-key provisioning, or any
  Phase 1 enterprise auth mechanism
- Wiring `trpc.claudeCode.importToken` anywhere in the renderer (the
  existing BYOK path via `api-key-onboarding-page.tsx` +
  `customClaudeConfigAtom` is untouched)
- Introducing an "Enterprise SSO" UI surface or "coming in Phase 1" empty
  state (no such surface exists today, so there is nothing to replace)
- Hardening the `encryptToken` Linux plaintext fallback (pre-existing
  concern; tracked for a separate standalone discussion about
  `safeStorage` platform degradation)
- Cleaning the `bun run ts:check` baseline (~88 pre-existing errors; this
  change must not increase the baseline but also must not try to decrease
  it)
- Broader `mock-api.ts` migration (tracked separately)

## Decisions

### Decision 1: Ship deletion + minimal renderer rewiring to an already-existing procedure; defer injection to a future proposal

**Choice:** Delete the sandbox procedures and `openOAuthUrl`, un-hardcode
the existing `importSystemToken` path in
`anthropic-onboarding-page.tsx`, and add a new `importSystemToken`
button to `claude-login-modal.tsx`. Do NOT add any new auth mechanism.

**Rationale:** The 4-reviewer audit found the bundled plan silently
regressed the strategy's hard rule against env-var bearer injection.
`importSystemToken` is already implemented, already tested at the router
level, and already covers the Claude Max path via the Claude CLI's native
credential refresh (keychain on macOS/Windows, `~/.claude/.credentials.json`
fallback). Phase 0 gate #8 is about severing the upstream dependency, not
about landing enterprise auth. Enterprise auth is Phase 1.

**Framing note:** "Deletion-only" understates the work slightly — the
modal cleanup in §4 adds 5 lines of new wiring (mutation declaration,
handler, button, error UI, recovery copy) that invoke an already-existing
router procedure. The scope remains bounded because every new line
invokes something that was already in the router and was already being
called from the onboarding page's `handleUseExistingToken`.

**Alternatives considered:**

- **Full bundled plan (A+B+C):** Rejected by audit; 6 Critical + 6 High
  findings.
- **Deletion + env-var injection only (A+B):** Still violates the strategy
  hard rule.
- **Deletion + tmpfile-based injection helper (A + compliant B):** Correct
  eventual direction but requires verifying pinned Claude CLI version
  supports the tmpfile env var, verifying cluster-side lock-down, and
  making a credential-storage architecture decision. All Phase 1 work.

### Decision 2: Renderer cleanup is asymmetric

**Choice:** Treat the two renderer files as separate cleanup tasks.

For `anthropic-onboarding-page.tsx`:

1. Un-hardcode `existingToken`, `hasExistingToken`, `checkedExistingToken`,
   `shouldOfferExistingToken` at lines 72-75 (currently all forced to
   `null`/`false`/`true`)
2. Re-enable the `trpc.claudeCode.getSystemToken` query at line 70
   (currently commented out)
3. Delete the stale "Disabled" comment at lines 68-71
4. Delete the sandbox-flow state machine: the `AuthFlowState` type at
   lines 16-33, `startAuthMutation`/`submitCodeMutation`/`openOAuthUrlMutation`
   at lines 63-65, the `flowState`/`setFlowState` reducer, the
   `pollStatusQuery` at lines 78-87, the auto-start-on-mount effect, the
   code input form, and any error-state UI tied specifically to the
   sandbox flow
5. Preserve the existing `handleUseExistingToken` handler at lines 196-210
   — it already wires `importSystemTokenMutation.mutateAsync()` correctly
   and becomes the primary path

For `claude-login-modal.tsx`:

1. Add `trpc.claudeCode.importSystemToken.useMutation()` at the top of
   the component
2. Add a "Use existing Claude CLI login" primary button
3. Add a handler (equivalent to the onboarding page's
   `handleUseExistingToken`) that calls `.mutateAsync()`, catches errors
   via `error instanceof Error ? error.message : String(error)` (never
   logs the raw error object), handles the `"No existing Claude token
   found"` error with recovery copy, and transitions the modal to
   closed-and-authenticated on success
4. Delete the sandbox-flow state machine: the `AuthFlowState` type at
   lines 26-43, `startAuthMutation`/`submitCodeMutation`/`openOAuthUrlMutation`
   at lines 69-71, the `pollStatusQuery` at lines 75-84, the
   poll-refetch timer, the URL auto-open effect, and the code-input form

**Dead-code follow-on:** Because both files are the only callers of
`trpc.claudeCode.openOAuthUrl` (verified via
`grep -rn "trpc\.claudeCode\.openOAuthUrl" src/`), the router procedure
itself at `claude-code.ts:451-457` also becomes unreachable and is
deleted as part of this change (see Decision 1 and the §Router
deletions task group).

**Rationale:** Forcing both files into a single pattern would require
either over-scoping the onboarding page (which already has the correct
handler) or under-scoping the modal (which does not). The asymmetric
approach minimizes churn in each file independently.

**Alternatives considered:**

- **Extract a shared "claude-max-login" hook used by both files:** Valid
  future refactor but out of scope for Phase 0 close. This change is
  already deletion-heavy; adding a new shared abstraction would expand
  scope.
- **Delete `claude-login-modal.tsx` entirely and redirect callers to the
  onboarding page:** Considered and rejected. The modal is opened from
  multiple places in the app (verified via the `agentsLoginModalOpenAtom`
  Jotai atom) and serves a distinct re-auth UX from the first-install
  onboarding page.

### Decision 3: Defense-in-depth regression guard with 11 assertions and offender-collection output

**Choice:** The regression guard at `tests/regression/no-upstream-sandbox-oauth.test.ts`
uses 11 distinct assertions organized in two layers: 6 primary
absence-checks targeting the specific bypass paths identified by the
4-reviewer audit, plus 5 defense-in-depth assertions targeting additional
bypass paths identified by a second independent review (new-file moves,
renderer scope widening, direct-`fetch` bypass, regex tolerance for
multi-line reformatting, and a positive-control self-check).

The guard uses the `token-leak-logs-removed.test.ts` offender-collection
pattern: scan each scoped file-set, push each hit to an `offenders` array
as `{ file, pattern, lineNumber }`, and throw a formatted error naming
the offending files + lines when any offender survives. This produces
one-line-per-offender diagnostics instead of bun:test's default
full-file `.not.toContain()` dump.

**Primary layer — 6 assertions covering the 7 original bypass paths:**

1. **Absence of the literal substring `claude-code/start` across all of
   `src/`.** Blocks URL fragmentation bypass (path 1). The hyphen+slash
   makes the literal hard to split without an obviously-split
   concatenation, and the substring is specific enough to avoid false
   positives.
2. **Absence of whitespace-tolerant procedure-definition patterns in
   `claude-code.ts`.** Uses regex `/\b(startAuth|pollStatus|submitCode|openOAuthUrl)\s*:\s*publicProcedure\b/`
   instead of literal substring, so multi-line reformatting cannot
   silently bypass detection. Blocks stubbing (path 4) and Prettier
   drift.
3. **Absence of `getDesktopToken` anywhere in `claude-code.ts`.** Blocks
   reintroduction via any mechanism.
4. **Absence of the `getApiUrl` import from `../../config` in
   `claude-code.ts`.** Blocks path 7.
5. **Recursive scan of `src/renderer/` for the substrings
   `trpc.claudeCode.startAuth`, `trpc.claudeCode.submitCode`,
   `trpc.claudeCode.pollStatus`, `trpc.claudeCode.openOAuthUrl`.**
   Walks the renderer tree instead of hardcoding two file paths, so a
   third renderer file cannot bypass the guard (path 5 + new-file
   variant).
6. **The guard's assertions use distinct-enough substrings that string
   fragmentation cannot bypass them** — e.g., `"claude-code/start"` as a
   single literal cannot be reconstructed from `"claude-code"` +
   `"/start"` elsewhere in the same file without triggering at least one
   of the other assertions.

**Defense-in-depth layer — 5 additional assertions:**

7. **Cross-file scan of `src/main/` for the same regex pattern as
   assertion 2** (`/\b(startAuth|pollStatus|submitCode|openOAuthUrl)\s*:\s*publicProcedure\b/`).
   Blocks the "move to a new router file" bypass (path 3 and 6 and a
   new-router-file variant). The onboarding page's
   `trpc.claudeCode.startAuth.useMutation()` would trigger this, but the
   scope is `src/main/`, so the renderer files are excluded.
8. **Cross-file scan of `src/main/` for the literal `getDesktopToken`.**
   Blocks the "move `getDesktopToken` to a helper file" bypass (path 6).
9. **Direct-`fetch` scan of `src/renderer/`:** regex
   `/fetch\s*\([^)]*\/api\/auth\/[^)]*claude-code/` across all renderer
   files. Blocks the bypass where a contributor avoids tRPC entirely and
   calls the deleted endpoint directly from the renderer via `fetch`.
10. **Positive-control assertion on `claude-code.ts`:** asserts that the
    file is readable, non-empty (≥1000 bytes), and contains known-persistent
    strings `publicProcedure` and `importSystemToken`. Catches the
    "wrong-path `readFileSync`" bug where a typo in the test file's
    `REPO_ROOT` calculation causes all negative assertions to pass
    trivially on an empty buffer.
11. **Positive-control assertions on both renderer files:** asserts each
    file is readable, non-empty (≥1000 bytes), and contains known
    strings (`importSystemToken` for the onboarding page, `AlertDialog`
    for the modal). Same rationale as #10.

**Rationale:** The original audit named 7 bypass paths. A second
independent review surfaced 4 additional paths (new-file router bypass,
new-file renderer bypass, direct-`fetch` bypass, wrong-path harness
bug). The 11-assertion design covers all 11 with at least one strong
anchor each, and the defense-in-depth layer ensures paths 3 and 6 have
two covering assertions instead of one.

**Alternatives considered:**

- **AST-based assertions using `ts-morph`:** More semantically precise
  but adds a heavy dependency and runs ~10x slower than string/regex
  checks. The scan-based approach is sufficient for regression-guard
  coverage given the 11 assertions together rule out realistic bypass
  patterns.
- **Keep the original 6-assertion design:** Ships faster but leaves 3-4
  bypass paths weakly covered. The guard is the only thing preventing
  silent reintroduction over the next 6+ months of codebase evolution;
  shipping with known weak coverage was rejected.
- **Allowlist mechanism like `brand-sweep-complete.test.ts`:** Rejected
  as unnecessary. None of the 11 assertion targets have a legitimate
  future use in scope; any reintroduction is either a revert or a design
  mistake worth a second look.

### Decision 4: TDD red state must be an assertion failure, not a compile error

**Choice:** Write the regression guard first and run it. Confirm each
assertion fails with a clear offender report (file + line + pattern)
pointing at the live text in the source file. Do NOT accept a
`ReferenceError`, `TypeError`, or `Cannot find module` as a valid red
state.

**Rationale:** CLAUDE.md's Environment Notes section codifies this rule:
"A test that fails because of a missing import, undefined symbol, or
TypeScript compile error is NOT a valid red. The red step must produce an
assertion failure with a readable `expected X, got Y` message."

A compile-time red can mask a subtly-broken assertion (e.g., a regex that
never matches anything, a wrong-path `readFileSync` that returns an
empty buffer). The positive-control assertions in Decision 3 items 10-11
specifically guard against the wrong-path case — if the harness is
broken, the positive control fails loudly instead of silently passing.

## Risks / Trade-offs

**[Risk] Existing users with a token from the deleted sandbox OAuth flow
lose their auth state on upgrade** → **Mitigation:** The deleted procedures
only cover the *initial token acquisition* — the `disconnect` and `getToken`
procedures that read from the `anthropicAccounts` table are untouched. A
user who successfully authenticated before the upgrade will still have
their token in the safeStorage-encrypted `anthropicAccounts.oauthToken`
column and should continue to work. Users whose stored tokens are stale
will see the new Claude Max onboarding flow and will be instructed to run
`claude /login` in their terminal.

**[Risk] First-install Claude Max users do not know to run `claude /login`
before clicking the desktop button** → **Mitigation:** Both renderer
files surface the `"No existing Claude token found"` error from
`importSystemToken` with recovery copy pointing at the `claude /login`
terminal command. Copy should be tested on a fresh install once the
change is merged — not a blocker for shipping.

**[Risk] BYOK users who previously discovered the "Paste an API key"
option through the sandbox flow now can only reach it via
`api-key-onboarding-page.tsx`** → **Mitigation:** The app's onboarding
router already segments first-install users through `billingMethodAtom`;
the BYOK path is reachable via a distinct flow and does not depend on
the sandbox flow existing. If UX research shows users need a BYOK entry
point from the `claude-login-modal.tsx` modal specifically, adding one is
out of scope for this Phase 0 close but could be a Phase 1 follow-up.

**[Risk] Regression guard false positives if future code legitimately
needs the word `startAuth` or `getApiUrl` in `claude-code.ts`** →
**Mitigation:** The primary-layer assertions (2, 3, 4) are scoped to
`claude-code.ts` specifically and check for the specific shape of the
procedure definitions (e.g., whitespace-tolerant regex on
`<name>: publicProcedure`). The defense-in-depth cross-file assertions
(7, 8) use the same regex pattern scoped to `src/main/`, so they only
fire on actual procedure definitions, not arbitrary mentions. If a
genuinely new use case for any of these symbols arises in `src/main/`,
that future change would need to explicitly update the regression guard
as part of its own scope — which is a feature, not a bug, because any
import of `getApiUrl` into this router surface deserves a second look
given its role in the deleted upstream calls.

**[Risk] `encryptToken` Linux plaintext fallback** → **Mitigation:** The
`encryptToken` helper at `claude-code.ts:27-32` falls back to reversible
base64 when `safeStorage.isEncryptionAvailable()` returns false (Linux
without libsecret, kiosk mode, etc.). After this change, all remaining
writers into `anthropicAccounts.oauthToken` route through this same
helper — so the fallback becomes the sole acquisition-path gatekeeper for
Claude Code credentials. This is a **pre-existing** risk that is not
introduced by this change; the sandbox deletion does not increase
exposure. The concern is tracked separately for a standalone discussion
about `safeStorage` platform degradation (Linux behavior, Electron 39.8.7
API quirks, known pitfalls) before the future enterprise-auth proposal
is scaffolded. This change does not attempt to harden the fallback.

**[Risk] Renderer error logging could leak token-shaped strings if the
mutation response shape changes in a future SDK version** →
**Mitigation:** Both renderer handlers log only
`error instanceof Error ? error.message : String(error)` rather than the
raw error object. This is a defensive rail; `importSystemToken` itself
only throws the literal `"No existing Claude token found"` string with
no token content, so today's code is already safe. The rail prevents a
future mutation-response shape change from silently introducing
token-exposure in logs.

**[Risk] CLAUDE.md Phase 0 progress count drift may recur if the bullet
list and summary line fall out of sync again** → **Mitigation:** The
existing `docs-drift-check` skill already catalogues Phase 0 gate status
as a drift point. This change fixes the current drift; future drift
prevention is a separate concern.

**[Trade-off] No new enterprise auth mechanism means enterprise users
must wait for Phase 1** → Acceptable. The Phase 0 close is the blocker
for shipping the enterprise fork *at all*; enterprise SSO can be layered
in afterward. The Phase 1 work is explicitly reserved for a future
enterprise-auth proposal.

## Migration Plan

**Step 1 — TDD red state:** Write
`tests/regression/no-upstream-sandbox-oauth.test.ts` with all 11
assertions. Run `bun test tests/regression/no-upstream-sandbox-oauth.test.ts`
and confirm each assertion reports a proper offender report (file + line
+ pattern). This proves the assertions target the live code, not typos.
Confirm the positive-control assertions pass (they should, because the
pre-deletion source files are readable and non-empty).

**Step 2 — Router deletions:** Apply Edit operations to `claude-code.ts`
removing the `startAuth`, `pollStatus`, `submitCode`, and `openOAuthUrl`
procedures, the `getDesktopToken` helper, and the `getApiUrl` import.
Re-run the guard and confirm assertions 1-4 and 7-8 flip green.
Assertions 5, 9 remain red until §3 and §4.

**Step 3 — Onboarding page cleanup (light):** Apply Edit operations to
`anthropic-onboarding-page.tsx`:

- Un-hardcode `existingToken`, `hasExistingToken`, `checkedExistingToken`,
  `shouldOfferExistingToken` at lines 72-75
- Re-enable the `getSystemToken` query at line 70
- Delete the stale "Disabled" comment at lines 68-71
- Delete the `AuthFlowState` type at lines 16-33, its reducer usage,
  and all references to `startAuthMutation`, `submitCodeMutation`,
  `openOAuthUrlMutation`, `pollStatusQuery`, and sandbox-flow state
  transitions

**Step 4 — Login modal cleanup (heavier):** Apply Edit operations to
`claude-login-modal.tsx`:

- Add `trpc.claudeCode.importSystemToken.useMutation()`
- Add a "Use existing Claude CLI login" button with a
  `handleUseExistingToken` equivalent that logs `error.message` (not the
  raw error object) on failure
- Delete the `AuthFlowState` type at lines 26-43,
  `startAuthMutation`/`submitCodeMutation`/`openOAuthUrlMutation` at
  lines 69-71, the `pollStatusQuery` at lines 75-84, the poll-refetch
  timer, the URL auto-open effect, and the code input form

Re-run the guard and confirm all 11 assertions are green.

**Step 5 — Four quality gates:** Run `bun run ts:check` (must remain
≤88), `bun run build` (must exit 0), `bun test` (must show 15+ tests
across 7 guards), `bun audit` (must show no new advisories).

**Step 6 — Documentation sweep:** Update CLAUDE.md's Phase 0 progress
block: fix "12 of 15" → "**15 of 15**", mark gate #8 ✅, delete the
"Claude Code OAuth flow uses upstream sandboxes" footgun note, add a
one-line reference to the future enterprise-auth proposal.

**Step 7 — Commit:** One atomic commit. OpenSpec proposal and
implementation land together.

**Rollback strategy:** Revert the single commit. All deleted procedures
can be restored from git history. The regression guard file becomes dead
after revert but does no harm.

## Open Questions

**Q1 — Phase 1 credential storage architecture:** The future enterprise-auth
proposal will need to decide where enterprise gateway credentials live.
The 4-reviewer audit noted that `feature_flag_overrides.value` is plain
text with no encryption, so flags are disqualified for storing
credentials. Three options were floated:

1. Extend `anthropicAccounts` with an `accountType` discriminator column
2. Add a dedicated `litellm_credentials` table mirroring `anthropicAccounts`
3. Encrypt sensitive feature flags via a `sensitive: true` marker plus a
   `safeStorage` encryption hook

**This question is out of scope for this change.** It belongs in the
future enterprise-auth proposal's own design document. A standalone
conversation about `safeStorage` platform degradation (Linux plaintext
fallback, Electron API quirks, known pitfalls) has been requested before
that proposal is scaffolded.

## Resolved Clarifications

**C1 — Regression guard sensitivity to renaming the replacement
procedure:** If a future change renames `importSystemToken` to something
else, this guard continues to pass because it only asserts *absence* of
the deleted procedures and *absence* of the deleted mutation-call
substrings. The positive-control assertion on `claude-code.ts` that
checks for `importSystemToken` as a known-persistent string WOULD fire
in that case — which is the right behavior, because such a rename would
need to update this guard alongside the rename. The guard is not trying
to enforce the positive existence of the replacement path by name, only
to fail loudly if the source file is unreadable.

**C2 — Stale-token users on upgrade:** A user whose
`anthropicAccounts.oauthToken` was obtained via the deleted sandbox flow
retains that token after this change. The token itself may still be valid
(the sandbox flow was just a delivery mechanism; the resulting token is
a normal Claude OAuth token). If the token is invalid, the user will see
auth failures and be directed to the new Claude Max onboarding.
**This is not a migration bug** — the deletion is of the *acquisition
path*, not the *storage layer* or the *usage layer*.
