## ADDED Requirements

### Requirement: getClaudeCodeToken returns null when active account is BYOK

The `getClaudeCodeToken()` function in `src/main/lib/trpc/routers/claude.ts` SHALL return `null` when the active anthropicAccounts row has `accountType='byok'`, regardless of whether the legacy `claudeCodeCredentials` table has a populated row.

Without this constraint, a user who switches from a Claude subscription to BYOK (creating a new `anthropicAccounts` row with `accountType='byok'` and no `oauthToken`) would have `getClaudeCodeToken()` fall through to the legacy table's still-populated OAuth token, injecting `CLAUDE_CODE_OAUTH_TOKEN` into their BYOK spawn. Mixing two auth contexts in a single spawn is the exact bug class the dual-mode routing refactor exists to prevent.

The legacy-table fallback SHALL only fire when `settings?.activeAccountId` is null or the resolved account does not exist.

#### Scenario: BYOK active account with populated legacy table returns null

- **WHEN** `anthropic_accounts` has an active row with `account_type='byok'` and `oauth_token=NULL`
- **AND** the legacy `claude_code_credentials` table has a row with a valid encrypted oauth token
- **THEN** `getClaudeCodeToken()` returns `null`
- **AND** does NOT decrypt the legacy row

#### Scenario: No active account falls through to legacy table

- **WHEN** `anthropic_settings.singleton.activeAccountId` is null
- **AND** the legacy `claude_code_credentials` table has a populated row
- **THEN** `getClaudeCodeToken()` returns the decrypted legacy token (preserves backward compatibility)

#### Scenario: Claude-subscription active account still returns the token from active row

- **WHEN** `anthropic_accounts` has an active row with `account_type='claude-subscription'` and a populated `oauth_token`
- **THEN** `getClaudeCodeToken()` returns the decrypted oauth token from the active row
- **AND** does NOT fall through to the legacy table

#### Scenario: Regression guard catches reintroduction of the leak

- **WHEN** a developer removes the BYOK-null-return branch from `getClaudeCodeToken()`
- **AND** `bun test tests/regression/no-legacy-oauth-byok-leak.test.ts` is run
- **THEN** the test fails referencing the missing branch

## MODIFIED Requirements

### Requirement: Renderer Claude Code authentication uses importSystemToken exclusively

The renderer SHALL use `trpc.claudeCode.importSystemToken` as the sole Claude Code authentication path exposed to users, and MUST NOT initiate any OAuth redirect flow from within the Electron renderer process itself.

*Rationale:* Both `src/renderer/features/onboarding/anthropic-onboarding-page.tsx` and `src/renderer/components/dialogs/claude-login-modal.tsx` are covered by this requirement. Users run `claude /login` externally in a terminal to have the Claude CLI refresh a token into `~/.claude/.credentials.json` (or the platform keychain on macOS), after which the desktop app reads that source via `getExistingClaudeToken()` (through the existing `importSystemToken` tRPC procedure) and persists the token into the multi-account system via `storeOAuthToken(...)`.

**Updated persistence contract (add-dual-mode-llm-routing + this change):** `storeOAuthToken(token)` writes a single row into `anthropicAccounts` with `accountType="claude-subscription"`, `routingMode` set from `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` (true → `"direct"`, false/unset → `"direct"` — the default was revised from `"litellm"` to `"direct"` by the migration hotfix in this change), the safeStorage-encrypted token in `oauthToken`, and NULL for `apiKey`, `virtualKey`, and the three `modelSonnet`/`modelHaiku`/`modelOpus` columns. The `anthropicSettings.singleton.activeAccountId` row is upserted to point at the new row. The legacy `claudeCodeCredentials` mirror write is REMOVED.

The BYOK (paste an Anthropic API key) path remains handled by the existing `api-key-onboarding-page.tsx`, which now writes to `anthropicAccounts` with `accountType="byok"` instead of the legacy `customClaudeConfigAtom` Jotai storage. The Jotai atom remains for in-flight migration only and SHALL be removed in a follow-up change after users have been migrated.

**Removed behavior:** The renderer SHALL NOT invoke the `migrateLegacy` tRPC mutation, and the `useEffect` in `src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx` that triggered it is REMOVED.

#### Scenario: Happy path from the onboarding page after the user ran `claude /login`
- **WHEN** a user opens the `anthropic-onboarding-page.tsx` onboarding flow
- **AND** has already run `claude /login` in their terminal
- **AND** clicks the action that triggers the existing `handleUseExistingToken` handler
- **THEN** the renderer calls `importSystemTokenMutation.mutateAsync()`
- **AND** the main process reads the user's Claude CLI credential source via `getExistingClaudeToken()`
- **AND** `storeOAuthToken(token)` inserts a new row into `anthropicAccounts` with `accountType="claude-subscription"` and `routingMode="direct"` (the revised default)
- **AND** `anthropicSettings.singleton.activeAccountId` is upserted to the new row id
- **AND** no write to `claudeCodeCredentials` occurs
- **AND** the UI transitions to the authenticated state via `setAnthropicOnboardingCompleted(true)`

#### Scenario: Existing user upgrades to the schema change without breakage

- **WHEN** a user on a pre-`add-dual-mode-llm-routing` database upgrades to the revised migration
- **AND** the migration backfills existing `anthropic_accounts` rows with `routing_mode='direct'`
- **THEN** the next chat attempt uses `getActiveProviderMode()` → `{ kind: "subscription-direct", oauthToken }`
- **AND** chat works without requiring the user to set `MAIN_VITE_LITELLM_BASE_URL`
