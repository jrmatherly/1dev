## Why

Phase 0 hard gate #8 of the enterprise-fork migration requires removing the
Claude Code router's hard dependency on an upstream SaaS backend
(`apollosai.dev` / legacy `1code.dev`) as an OAuth redirect host. The
current implementation at `src/main/lib/trpc/routers/claude-code.ts` exposes
three tRPC procedures — `startAuth`, `pollStatus`, `submitCode` — that
collectively provision a CodeSandbox VM via the upstream backend, poll that
sandbox for an OAuth URL, and submit the returned OAuth code back to the
sandbox. Without this deletion the enterprise fork cannot be shipped
standalone, and CLAUDE.md's "Known Security Gaps & Footguns" section calls
this out as a P0 hidden dependency inside what otherwise looks like a P3
background-agents router.

An alternate auth path already exists in the same router but is not wired
into the active onboarding UI: `importSystemToken` reads
`~/.claude/.credentials.json` — the Claude CLI's own credential file, which
the CLI refreshes natively on every `claude /login`. A 4-reviewer
independent audit of an earlier broader plan (which bundled deletion with
environment-variable bearer-token injection and a three-segment auth model)
returned 6 Critical and 6 High findings and concluded that the minimum
Phase 0 close is deletion of the sandbox procedures plus rewiring the two
renderer entry points to `importSystemToken`. Enterprise SSO via
Entra/MSAL/LiteLLM is Phase 1 work and will be tracked under a separate
future proposal.

## What Changes

**Main-process deletions** (`src/main/lib/trpc/routers/claude-code.ts`):

- **BREAKING** Delete the `claudeCode.startAuth` tRPC procedure (the
  mutation that fetches from the upstream `/api/auth/claude-code/start`
  endpoint to provision a sandbox VM)
- **BREAKING** Delete the `claudeCode.pollStatus` tRPC procedure (the
  query that polls the returned sandbox URL for an OAuth URL)
- **BREAKING** Delete the `claudeCode.submitCode` tRPC procedure (the
  mutation that submits the OAuth code back to the sandbox)
- Delete the `getDesktopToken` helper function (only used by the three
  deleted procedures)
- Delete the `getApiUrl` import at the top of the file (only used by the
  three deleted procedures)
- Delete the `claudeCode.openOAuthUrl` tRPC procedure (a thin
  `shell.openExternal` wrapper whose only two callers are in the two
  sandbox-flow renderer sites — verified to have zero remaining callers
  after the cleanup below)

**Renderer rewiring — asymmetric work across the two callers:**

`src/renderer/features/onboarding/anthropic-onboarding-page.tsx` already
has `importSystemTokenMutation` wired (line ~66-67) and an already-defined
`handleUseExistingToken` handler (line ~196-215) that calls it. A stale
comment block and a set of `hasExistingToken = false` hardcodes are the
only things preventing the already-present Claude Max path from being
exposed. The cleanup here is:

- Un-hardcode `existingToken`, `hasExistingToken`, `checkedExistingToken`,
  `shouldOfferExistingToken`
- Re-enable the `trpc.claudeCode.getSystemToken` query
- Delete the stale "Disabled: importing CLI token is broken" comment
- Delete the sandbox-flow state machine (the `AuthFlowState` type + its
  reducer usage + all references to `startAuthMutation`, `submitCodeMutation`,
  `pollStatusQuery`, `openOAuthUrlMutation` **in the context of the sandbox
  flow**)
- Keep `openOAuthUrl` available if still needed for the external
  "Open in browser" affordance, otherwise delete that too

`src/renderer/components/dialogs/claude-login-modal.tsx` is a pure
sandbox-flow modal. It does NOT currently import `importSystemToken` or
`importToken` at all. The cleanup here is larger:

- Add `importSystemTokenMutation` and a "Use existing Claude CLI login"
  button that calls it via `.mutateAsync()`
- Add user-facing copy instructing the user to run `claude /login` in
  their terminal before clicking, with explicit recovery instructions if
  the mutation throws `"No existing Claude token found"`
- Delete the sandbox-flow state machine (`AuthFlowState`, `startAuthMutation`,
  `submitCodeMutation`, `pollStatusQuery`, the poll-refetch timer, the
  URL auto-open effect, the code-input form, and the sandbox-flow error
  copy)
- If a path to the existing API-key onboarding is appropriate, link to
  the Settings > Models tab via the existing `setSettingsActiveTab`
  helper (it is already in scope in this file)

**Regression guard:**

- Add `tests/regression/no-upstream-sandbox-oauth.test.ts` with 6
  bypass-resistant assertions designed to resist the specific bypass paths
  the 4-reviewer audit identified

**Documentation fixes (same commit):**

- Fix the stale "12 of 15 hard gates complete" count in the CLAUDE.md
  Phase 0 progress header to "**15 of 15**" (the header has been wrong
  since 2026-04-08; the bullet list already shows 14 ✅ completed plus
  gate #8 as the only ⏳ — this change closes gate #8)
- Mark gate #8 as ✅ in the progress bullet list
- Delete the "Claude Code OAuth flow uses upstream sandboxes as a
  redirect host" footgun note in the CLAUDE.md "Known Security Gaps"
  section — it is no longer a gap after this change

**Explicitly out of scope** (deferred to a future enterprise-auth proposal
per the 4-reviewer audit):

- Environment-variable injection of bearer tokens
  (`ANTHROPIC_AUTH_TOKEN=<bearer>`, `ANTHROPIC_CUSTOM_HEADERS=Bearer ...`)
  on Claude or Codex subprocess spawn
- Any edit to `src/main/lib/trpc/routers/claude.ts` or
  `src/main/lib/claude/env.ts`
- The `applyEnterpriseAuth()` tmpfile pattern (Phase 1 — requires
  verifying Claude CLI `ANTHROPIC_AUTH_TOKEN_FILE` support against the
  pinned CLI version, verifying cluster-side lock-down is in place, and
  making a credential-storage architecture decision)
- Wiring `trpc.claudeCode.importToken` anywhere in the renderer. The
  existing BYOK path is `src/renderer/features/onboarding/api-key-onboarding-page.tsx`
  which stores its token via the `customClaudeConfigAtom` Jotai atom — a
  completely independent storage mechanism from the `anthropicAccounts`
  table that `importToken` writes to. Wiring `importToken` into the
  existing renderer files would create a second parallel BYOK storage
  mechanism that does not match the existing UX. Any future change to
  consolidate these storage mechanisms is Phase 1 work.
- MSAL-in-Electron integration for Entra SSO
- Feature-flag extensions carrying gateway URLs, credentials, or auth mode
  selectors (the `feature_flag_overrides` table is unencrypted plain text
  and unsuitable for credential storage)
- Envoy Gateway routing, LiteLLM virtual-key provisioning, or any other
  enterprise auth mechanism
- Introducing an "Enterprise tab" or enterprise-specific UI surface — no
  such UI exists today, so there is nothing to replace with a Phase 1
  placeholder

## Capabilities

### New Capabilities
- `claude-code-auth-import`: Token acquisition paths for the Claude Code
  backend that depend only on local artifacts — specifically the Claude
  CLI's native credentials file at `~/.claude/.credentials.json` via the
  `importSystemToken` tRPC procedure. Establishes the contract that no
  Claude Code OAuth path may call out to the upstream SaaS
  (`/api/auth/claude-code/...`) or to any sandboxed redirect host, and
  that the renderer entry points for Claude Code authentication MUST use
  the existing `importSystemToken` procedure rather than any
  newly-invented OAuth flow.

### Modified Capabilities
<!-- None. No capability exists under openspec/specs/ that owns Claude
     Code auth behavior today. The only promoted capability is
     brand-identity. This proposal introduces claude-code-auth-import as
     a new capability. -->

## Impact

**Affected code:**

- `src/main/lib/trpc/routers/claude-code.ts` — 4 procedures deleted
  (`startAuth`, `pollStatus`, `submitCode`, `openOAuthUrl` — ~135
  lines), 1 helper deleted (`getDesktopToken` — ~7 lines), 1 import
  removed (`getApiUrl` — 1 line); net deletion of ~143 lines
- `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` (427
  lines) — delete the sandbox-flow state machine and un-hardcode the
  already-present `importSystemToken` path; smaller net rewrite since the
  replacement handler already exists
- `src/renderer/components/dialogs/claude-login-modal.tsx` (454 lines) —
  delete the sandbox-flow state machine and add a new `importSystemToken`
  button with supporting UI; larger net rewrite because the replacement
  path does not exist in this file today
- `tests/regression/no-upstream-sandbox-oauth.test.ts` — new regression
  guard (~11 assertions using the offender-collection pattern from
  `token-leak-logs-removed.test.ts`)
- `CLAUDE.md` — Phase 0 progress header count fix (12→15 of 15), gate #8
  marked ✅, footgun note about sandbox redirect host deleted

**Affected APIs / behaviors:**

- `trpc.claudeCode.startAuth` — **REMOVED.** Any type-level caller will
  fail type check. Renderer callers are updated in this change; there
  are no other callers (verified via `grep -rn "trpc\.claudeCode\.startAuth" src/`).
- `trpc.claudeCode.pollStatus` — **REMOVED.** Same.
- `trpc.claudeCode.submitCode` — **REMOVED.** Same.
- `trpc.claudeCode.openOAuthUrl` — **REMOVED.** The only callers were
  in the two sandbox-flow renderer sites; zero callers survive the
  cleanup.
- `trpc.claudeCode.importSystemToken` — **NEWLY EXPOSED IN THE UI** of
  both renderer files. The procedure itself is unchanged.
- `trpc.claudeCode.getSystemToken` — **NEWLY EXPOSED IN THE UI** of
  `anthropic-onboarding-page.tsx` (the query was commented out). The
  procedure itself is unchanged.
- `trpc.claudeCode.importToken` — **NOT TOUCHED.** Remains available in
  the router but remains uncalled from the renderer. BYOK continues to
  use the existing `customClaudeConfigAtom` path in
  `api-key-onboarding-page.tsx`.

**Downstream unblocks:**

- Closes the last Phase 0 hard gate (#8), completing the Phase 0
  migration precondition for shipping the enterprise fork standalone
- Enables the future enterprise-auth proposal to start from a known-clean
  Claude Code router surface with no hidden upstream dependencies

**Dependencies / tools touched:**

- No package.json changes
- No Drizzle schema changes
- No new tRPC routers, no new Drizzle tables, no new preload bridges
- No new environment variables consumed
- No Electron API surface change

**Quality gates after implementation:**

- `bun run ts:check` — error count must remain at the 88-error baseline or
  lower (enforced by the `.claude/settings.json` PostToolUse hook reading
  `.claude/.tscheck-baseline`)
- `bun run build` — must exit 0
- `bun test` — must show 15+ tests across 7 regression guard files (6
  existing + 1 new)
- `bun audit` — must show no new advisories
