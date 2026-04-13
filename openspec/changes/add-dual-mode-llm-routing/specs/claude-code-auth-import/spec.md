## MODIFIED Requirements

### Requirement: Renderer Claude Code authentication uses importSystemToken exclusively

The renderer SHALL use `trpc.claudeCode.importSystemToken` as the sole Claude Code authentication path exposed to users, and MUST NOT initiate any OAuth redirect flow from within the Electron renderer process itself.

*Rationale:* Both `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` and `src/renderer/components/dialogs/claude-login-modal.tsx` are covered by this requirement. Users run `claude /login` externally in a terminal to have the Claude CLI refresh a token into `~/.claude/.credentials.json` (or the platform keychain on macOS), after which the desktop app reads that source via `getExistingClaudeToken()` (through the existing `importSystemToken` tRPC procedure) and persists the token into the multi-account system via `storeOAuthToken(...)`.

**Updated persistence contract (add-dual-mode-llm-routing):** `storeOAuthToken(token)` writes a single row into `anthropicAccounts` with `accountType="claude-subscription"`, `routingMode` set from `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` (true → `"direct"`, false/unset → `"litellm"`), the safeStorage-encrypted token in `oauthToken`, and NULL for `apiKey`, `virtualKey`, and the three `modelSonnet` / `modelHaiku` / `modelOpus` columns. It upserts `anthropicSettings.singleton.activeAccountId` to point at the new row. The mirror write into the legacy `claudeCodeCredentials` table is REMOVED — the legacy migration path is deleted by this change, and the legacy table is retained only for schema compatibility (no new writes).

The BYOK (paste an Anthropic API key) path remains handled by the existing `api-key-onboarding-page.tsx`, which now writes to `anthropicAccounts` with `accountType="byok"` instead of the legacy `customClaudeConfigAtom` Jotai storage. When `routingMode="direct"`, the pasted key populates `apiKey`; when `routingMode="litellm"`, it populates `virtualKey`. The Jotai atom remains for in-flight migration only and SHALL be removed in a follow-up change after users have been migrated.

**Removed behavior:** The renderer SHALL NOT invoke the `migrateLegacy` tRPC mutation, and the `useEffect` in `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx` that triggered it is REMOVED.

#### Scenario: Happy path from the onboarding page after the user ran `claude /login`
- **WHEN** a user opens the `anthropic-onboarding-page.tsx` onboarding flow
- **AND** has already run `claude /login` in their terminal
- **AND** clicks the action that triggers the existing `handleUseExistingToken` handler
- **THEN** the renderer calls `importSystemTokenMutation.mutateAsync()`
- **AND** the main process reads the user's Claude CLI credential source (platform keychain first, then `~/.claude/.credentials.json`) via `getExistingClaudeToken()`
- **AND** `storeOAuthToken(token)` inserts a new row into `anthropicAccounts` with `accountType="claude-subscription"` and `routingMode` derived from the `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` env var
- **AND** `anthropicSettings.singleton.activeAccountId` is upserted to the new row id
- **AND** no write to `claudeCodeCredentials` occurs
- **AND** the UI transitions to the authenticated state via `setAnthropicOnboardingCompleted(true)`

#### Scenario: Happy path from the Claude login modal after the user ran `claude /login`
- **WHEN** a user opens the `claude-login-modal.tsx` modal
- **AND** has already run `claude /login` in their terminal
- **AND** clicks the "Use existing Claude CLI login" button
- **THEN** the renderer calls `importSystemTokenMutation.mutateAsync()`
- **AND** the main process performs the same single-row `anthropicAccounts` persistence described above
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

#### Scenario: migrateLegacy is removed from the codebase

- **WHEN** `src/main/lib/trpc/routers/anthropic-accounts.ts` is scanned
- **THEN** no procedure named `migrateLegacy` is defined
- **AND** `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx` contains no `useEffect` that calls `migrateLegacy.mutate` or similar
- **AND** `trpc.anthropicAccounts.migrateLegacy` is not referenced anywhere in `src/renderer/`

## REMOVED Requirements

### Requirement: Legacy claudeCodeCredentials mirror write

**Reason:** The legacy `claudeCodeCredentials` table was retained during the multi-account migration to support users upgrading from a pre-multi-account install. Greenfield user confirmation on 2026-04-13 established that no such users exist. The mirror write in `storeOAuthToken` is removed; the `migrateLegacy` tRPC procedure and the matching renderer `useEffect` — which together caused the "deleted account reappears" Settings bug — are removed. The `claudeCodeCredentials` table itself is retained as-is in the Drizzle schema to preserve the migration baseline, but receives no new writes and is not read outside of the deprecated code paths being deleted.

**Migration:** None required — greenfield. Any user encountering the "Account removed" toast followed by a phantom re-seeded account should upgrade; after upgrade, deleted accounts stay deleted. Users with a populated legacy `claudeCodeCredentials` row (vanishingly unlikely) will need to re-add their Claude subscription from Settings → Models.
