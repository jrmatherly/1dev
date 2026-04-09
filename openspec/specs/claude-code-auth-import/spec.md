# claude-code-auth-import Specification

## Purpose

Baseline capability spec (promoted from archived change).

## Requirements

### Requirement: Upstream sandbox OAuth procedures removed from the Claude Code router

The `claudeCode` tRPC router SHALL NOT expose any procedure that initiates, polls, or completes an OAuth flow against an upstream SaaS backend or a sandboxed redirect host.

*Rationale:* All code paths that previously called `/api/auth/claude-code/start` on the upstream backend, or polled/posted to any `${sandboxUrl}/api/auth/{sessionId}/...` endpoint, are removed from `src/main/lib/trpc/routers/claude-code.ts`. The `getDesktopToken` helper and the `getApiUrl` import in that file are also removed since they exist only to support the deleted procedures. The `openOAuthUrl` procedure (a thin `shell.openExternal` wrapper) is also removed because its only callers were the two sandbox-flow renderer sites and it has no remaining callers after the cleanup. The deletion is enforced by a regression guard under `tests/regression/` that is resistant to string-fragmentation bypass, renderer-scope bypass, new-file bypass, and direct-`fetch` bypass.

#### Scenario: Router has no upstream sandbox OAuth procedures
- **WHEN** `src/main/lib/trpc/routers/claude-code.ts` is read
- **THEN** the file defines none of `startAuth`, `pollStatus`, `submitCode`, or `openOAuthUrl` as tRPC procedure definitions
- **AND** the file does not contain the substring `claude-code/start`
- **AND** the file does not import `getApiUrl` from `../../config`
- **AND** the file does not define or reference a `getDesktopToken` helper

#### Scenario: Regression guard covers cross-file bypass attempts
- **WHEN** `bun test tests/regression/no-upstream-sandbox-oauth.test.ts` is run against the post-deletion tree
- **THEN** the guard reports all assertions passing
- **AND** the guard scans all files under `src/main/` for stray procedure-definition patterns matching `startAuth`, `pollStatus`, `submitCode`, or `getDesktopToken`, catching any attempt to move the procedures to a new router file
- **AND** the guard scans all files under `src/renderer/` recursively for the substrings `trpc.claudeCode.startAuth`, `trpc.claudeCode.pollStatus`, `trpc.claudeCode.submitCode`, catching any new renderer file that introduces a caller
- **AND** the guard scans all files under `src/renderer/` for direct-`fetch` patterns containing both `/api/auth/` and `claude-code`, catching any bypass that avoids tRPC entirely
- **AND** the guard uses whitespace-tolerant regex (not literal substring) for procedure-definition patterns, so multi-line reformatting does not silently bypass detection

#### Scenario: Regression guard fails loudly on wrong-path bugs
- **WHEN** the regression guard executes with a source file that has been renamed or relocated
- **THEN** a positive-control assertion fails before any negative assertion can silently pass on an empty buffer
- **AND** the positive control verifies that `claude-code.ts` still contains known-persistent symbols (e.g., `importSystemToken`, `publicProcedure`) and has a non-trivial file size

### Requirement: Renderer Claude Code authentication uses importSystemToken exclusively

The renderer SHALL use `trpc.claudeCode.importSystemToken` as the sole Claude Code authentication path exposed to users, and MUST NOT initiate any OAuth redirect flow from within the Electron renderer process itself.

*Rationale:* Both `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` and `src/renderer/components/dialogs/claude-login-modal.tsx` are covered by this requirement. Users run `claude /login` externally in a terminal to have the Claude CLI refresh a token into `~/.claude/.credentials.json` (or the platform keychain on macOS), after which the desktop app reads that source via `getExistingClaudeToken()` (through the existing `importSystemToken` tRPC procedure) and persists the token into the multi-account system via `storeOAuthToken(...)`. The `storeOAuthToken` helper writes to three tables in a single operation: inserts a new row into `anthropicAccounts` with the safeStorage-encrypted token, upserts `anthropicSettings.singleton.activeAccountId` to point at the new row, and mirrors the token into the legacy `claudeCodeCredentials` table for backward compatibility. The BYOK (paste an Anthropic API key) path remains handled by the existing `api-key-onboarding-page.tsx` with its `customClaudeConfigAtom` Jotai storage — a completely separate mechanism that is NOT touched by this change.

#### Scenario: Happy path from the onboarding page after the user ran `claude /login`
- **WHEN** a user opens the `anthropic-onboarding-page.tsx` onboarding flow
- **AND** has already run `claude /login` in their terminal
- **AND** clicks the action that triggers the existing `handleUseExistingToken` handler
- **THEN** the renderer calls `importSystemTokenMutation.mutateAsync()`
- **AND** the main process reads the user's Claude CLI credential source (platform keychain first, then `~/.claude/.credentials.json`) via `getExistingClaudeToken()`
- **AND** `storeOAuthToken(token)` inserts a new row into `anthropicAccounts`, upserts `anthropicSettings.singleton.activeAccountId`, and mirrors the token into the legacy `claudeCodeCredentials` table
- **AND** the UI transitions to the authenticated state via `setAnthropicOnboardingCompleted(true)`

#### Scenario: Happy path from the Claude login modal after the user ran `claude /login`
- **WHEN** a user opens the `claude-login-modal.tsx` modal
- **AND** has already run `claude /login` in their terminal
- **AND** clicks the newly-added "Use existing Claude CLI login" button
- **THEN** the renderer calls `importSystemTokenMutation.mutateAsync()`
- **AND** the main process performs the same three-table persistence as the onboarding scenario (insert `anthropicAccounts`, upsert `anthropicSettings`, mirror `claudeCodeCredentials`)
- **AND** the modal closes and transitions to the authenticated state

#### Scenario: User has not run `claude /login` yet
- **WHEN** a user in either the onboarding page or the login modal clicks the existing-CLI-login action
- **AND** `~/.claude/.credentials.json` does not exist and the platform keychain returns no entry
- **THEN** the `importSystemToken` procedure throws the string `"No existing Claude token found"`
- **AND** the renderer handler logs only `error instanceof Error ? error.message : String(error)` (never the raw error object) to preclude any future mutation change from leaking token-shaped fields
- **AND** the UI surfaces the error with recovery copy telling the user to run `claude /login` in their terminal and try again

#### Scenario: No renderer file contains calls to the deleted OAuth mutations
- **WHEN** every file under `src/renderer/` is scanned
- **THEN** no file contains the substrings `trpc.claudeCode.startAuth`, `trpc.claudeCode.submitCode`, or `trpc.claudeCode.pollStatus`
- **AND** no file contains a direct `fetch` call whose URL combines `/api/auth/` with `claude-code` (the direct-fetch bypass path)