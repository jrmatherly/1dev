# credential-storage Specification

## Purpose

Unified 3-tier credential encryption via credential-store.ts. No direct safeStorage calls outside this module.
## Requirements
### Requirement: Unified credential encryption module with 3-tier degradation

The system SHALL provide a single TypeScript module at `src/main/lib/credential-store.ts` that ALL credential encryption and decryption operations in the main process delegate to. No other file SHALL call `safeStorage.encryptString()` or `safeStorage.decryptString()` directly.

The module SHALL detect the platform credential storage tier at runtime using `safeStorage.isEncryptionAvailable()` and `safeStorage.getSelectedStorageBackend()`, and enforce the following policy:

- **Tier 1** (preferred): `getSelectedStorageBackend()` returns `"keychain"`, `"dpapi"`, `"gnome_libsecret"`, `"kwallet"`, `"kwallet5"`, or `"kwallet6"` — proceed with full OS-keystore encryption.
- **Tier 2** (degraded): `getSelectedStorageBackend()` returns `"basic_text"` — proceed with encryption but log a warning at startup. The `basic_text` backend uses a hardcoded password and provides obfuscation, not real encryption.
- **Tier 3** (refuse): `isEncryptionAvailable()` returns `false` — refuse to store credentials and throw a `CredentialStorageRefusedError` with an actionable error message.

The detected tier SHALL be cached after the first detection call and remain immutable for the lifetime of the Electron process.

#### Scenario: Tier 1 encryption on macOS with Keychain

- **WHEN** the app starts on macOS where `safeStorage.getSelectedStorageBackend()` returns `"keychain"`
- **THEN** `getCredentialTier()` returns `1`
- **AND** `encryptCredential("my-token")` returns a base64-encoded string produced by `safeStorage.encryptString()`
- **AND** `decryptCredential()` on that output returns `"my-token"`

#### Scenario: Tier 2 degraded encryption on Linux with basic_text backend

- **WHEN** the app starts on a Linux system without libsecret/KWallet where `safeStorage.getSelectedStorageBackend()` returns `"basic_text"`
- **AND** `safeStorage.isEncryptionAvailable()` returns `true`
- **THEN** `getCredentialTier()` returns `2`
- **AND** `encryptCredential()` still produces output (obfuscated, not truly encrypted)
- **AND** a warning is logged: `[CredentialStore] Storage tier: 2 (backend: basic_text) — WARNING: tokens obfuscated, not encrypted`

#### Scenario: Tier 3 hard refusal when no encryption available

- **WHEN** the app starts in an environment where `safeStorage.isEncryptionAvailable()` returns `false`
- **THEN** `getCredentialTier()` returns `3`
- **AND** `encryptCredential()` throws a `CredentialStorageRefusedError`
- **AND** the error's `actionableMessage` property contains platform-specific guidance (e.g., "Install gnome-keyring: sudo apt install gnome-keyring")

#### Scenario: Enterprise hard-refusal override escalates Tier 2 to refusal

- **WHEN** the feature flag `credentialStorageRequireEncryption` is set to `true` via the `feature_flag_overrides` table
- **AND** the detected backend is `"basic_text"` (Tier 2)
- **THEN** `encryptCredential()` throws a `CredentialStorageRefusedError` as if the system were Tier 3
- **AND** the error's `actionableMessage` indicates that the enterprise policy requires a real keystore

### Requirement: Public API contract for credential-store.ts

The module SHALL export exactly these public symbols:

- `type CredentialTier = 1 | 2 | 3` — the tier type
- `function getCredentialTier(): CredentialTier` — returns the cached detected tier
- `function encryptCredential(plaintext: string): string` — encrypts and returns base64-encoded ciphertext; throws `CredentialStorageRefusedError` on Tier 3 (or Tier 2 with enterprise flag)
- `function decryptCredential(encrypted: string): string` — decrypts base64-encoded ciphertext; throws on corrupted input
- `class CredentialStorageRefusedError extends Error` — carries `tier: CredentialTier` and `actionableMessage: string`

No other public exports SHALL exist on the module. Internal helpers SHALL remain unexported.

**New constraint (add-dual-mode-llm-routing):** All callers that persist credentials on the `anthropic_accounts` table (via `anthropicAccounts.add`, `anthropicAccounts.updateCredentials`, or migration seed paths) SHALL route through `encryptCredential()` / `decryptCredential()`. This applies to `oauthToken`, `apiKey`, and `virtualKey` columns uniformly.

#### Scenario: Type inference of encryptCredential return value

- **WHEN** a caller writes `const encrypted = encryptCredential(token)`
- **THEN** TypeScript infers `encrypted` as `string`
- **AND** the value is a valid base64-encoded string that `decryptCredential()` can reverse

#### Scenario: CredentialStorageRefusedError is catchable

- **WHEN** a caller wraps `encryptCredential()` in a try/catch
- **AND** encryption is refused
- **THEN** the caught error is an instance of `CredentialStorageRefusedError`
- **AND** `error.tier` is `2` or `3`
- **AND** `error.actionableMessage` is a non-empty string

#### Scenario: All three anthropicAccounts credential columns route through credential-store

- **WHEN** `src/main/lib/trpc/routers/anthropic-accounts.ts` is scanned
- **THEN** every read of `oauthToken`, `apiKey`, or `virtualKey` columns from `anthropicAccounts` rows is wrapped in `decryptCredential(...)`
- **AND** every write to the same columns on insert/update is wrapped in `encryptCredential(...)`
- **AND** no raw plaintext credential is ever stored in the database

### Requirement: Startup tier audit log

The app SHALL log the detected credential storage tier exactly once at startup, after `app.whenReady()` resolves, in the format:

```
[CredentialStore] Storage tier: <N> (backend: <backend>)
```

For Tier 2, the log line SHALL append: `— WARNING: tokens obfuscated, not encrypted`

For Tier 3, the log line SHALL read: `[CredentialStore] Storage tier: 3 (backend: none) — ERROR: credential storage unavailable`

#### Scenario: Startup log on a healthy macOS system

- **WHEN** the app starts on macOS with Keychain available
- **THEN** the main process emits exactly one log line matching `[CredentialStore] Storage tier: 1 (backend: keychain)`

#### Scenario: Startup log on degraded Linux system

- **WHEN** the app starts on Linux with only basic_text backend
- **THEN** the main process emits exactly one log line matching `[CredentialStore] Storage tier: 2 (backend: basic_text) — WARNING: tokens obfuscated, not encrypted`

### Requirement: No direct safeStorage calls outside credential-store.ts

After this change, no file in `src/main/` other than `src/main/lib/credential-store.ts` SHALL call `safeStorage.encryptString()`, `safeStorage.decryptString()`, or `safeStorage.isEncryptionAvailable()`. All existing call sites in `auth-store.ts`, `anthropic-accounts.ts`, and `claude-code.ts` SHALL be replaced with calls to the `credential-store.ts` public API.

The sole exception is `safeStorage.getSelectedStorageBackend()`, which may appear in test files under `tests/`.

#### Scenario: Grep finds no direct safeStorage encryption calls outside the module

- **WHEN** all files under `src/main/` are scanned with a regex matching `safeStorage\.(encryptString|decryptString|isEncryptionAvailable)`
- **THEN** the only file with matches is `src/main/lib/credential-store.ts`

#### Scenario: anthropic-accounts.ts no longer defines encryptToken or decryptToken

- **WHEN** `src/main/lib/trpc/routers/anthropic-accounts.ts` is read
- **THEN** the file does not contain function definitions named `encryptToken` or `decryptToken`
- **AND** the file imports `encryptCredential` and/or `decryptCredential` from `../../credential-store`

### Requirement: Plaintext and base64 fallback paths removed

The `auth-store.ts` plaintext `.json` fallback write path and the `anthropic-accounts.ts` base64-only fallback path SHALL be removed. On Tier 3, token storage operations SHALL throw `CredentialStorageRefusedError` rather than silently storing unencrypted data.

The `auth-store.ts` legacy file **read** paths (`.json` and `auth.json` migration) MAY be retained for backward compatibility with pre-existing installs, but SHALL NOT write new plaintext files.

#### Scenario: Tier 3 system refuses to store a new token

- **WHEN** `encryptCredential()` is called on a Tier 3 system
- **THEN** the function throws `CredentialStorageRefusedError`
- **AND** no file or database write occurs

#### Scenario: auth-store.ts no longer writes plaintext fallback files

- **WHEN** `auth-store.ts:save()` is called on a Tier 3 system
- **THEN** the method throws or propagates `CredentialStorageRefusedError`
- **AND** no `auth.dat.json` file is created

### Requirement: Feature flag for enterprise encryption enforcement

A new entry `credentialStorageRequireEncryption: false` SHALL be added to the `FLAG_DEFAULTS` map in `src/main/lib/feature-flags.ts`. This follows the existing feature-flags capability spec — no schema migration is required.

When `getFlag("credentialStorageRequireEncryption")` returns `true`, the credential-store module SHALL treat Tier 2 (basic_text backend) as Tier 3 (hard refusal).

#### Scenario: Flag defaults to false

- **WHEN** no override exists in `feature_flag_overrides` for `credentialStorageRequireEncryption`
- **THEN** `getFlag("credentialStorageRequireEncryption")` returns `false`
- **AND** Tier 2 systems proceed with obfuscated storage

#### Scenario: Enterprise operator enables hard refusal

- **WHEN** an operator sets `credentialStorageRequireEncryption` to `true` via `setFlag()`
- **AND** the system is Tier 2 (basic_text)
- **THEN** `encryptCredential()` throws `CredentialStorageRefusedError`
- **AND** the error's `actionableMessage` references the enterprise policy

### Requirement: Regression guard for credential storage tier enforcement

A new regression test file at `tests/regression/credential-storage-tier.test.ts` SHALL verify:

1. `credential-store.ts` exists and exports `getCredentialTier`, `encryptCredential`, `decryptCredential`, and `CredentialStorageRefusedError`
2. No file under `src/main/` other than `credential-store.ts` contains direct `safeStorage.encryptString` or `safeStorage.decryptString` calls
3. The `FLAG_DEFAULTS` map in `feature-flags.ts` includes the `credentialStorageRequireEncryption` key
4. `anthropic-accounts.ts` does not define local `encryptToken` or `decryptToken` functions

#### Scenario: Regression guard passes on compliant codebase

- **WHEN** `bun test tests/regression/credential-storage-tier.test.ts` runs
- **THEN** all assertions pass

#### Scenario: Regression guard catches a new direct safeStorage call

- **WHEN** a developer adds `safeStorage.encryptString()` to a new file under `src/main/`
- **THEN** the regression guard fails with a message identifying the violating file

### Requirement: Token caching for legacy auth
The AuthStore legacy authentication path SHALL cache the decrypted token in memory after first read. Subsequent `getValidToken()` calls SHALL return the cached value without re-reading from disk or re-decrypting. The cache SHALL be invalidated when the token is written or the auth session ends.

#### Scenario: Cached token read
- **WHEN** `getValidToken()` is called after an initial successful token read
- **THEN** the token is returned from memory without calling `readFileSync()` or `decryptCredential()`

#### Scenario: Cache invalidation on token write
- **WHEN** a new token is stored via `storeOAuthToken()`
- **THEN** the in-memory cache is updated with the new token value

#### Scenario: Cache cleared on logout
- **WHEN** the user logs out or the auth session ends
- **THEN** the in-memory cache is cleared

#### Scenario: Enterprise mode unaffected
- **WHEN** `enterpriseAuthEnabled` is true
- **THEN** the legacy AuthStore cache is not used (MSAL has its own cache plugin)

### Requirement: anthropicAccounts credential columns encrypted via credential-store.ts

All credential-bearing columns on the `anthropic_accounts` table — `oauthToken`, `apiKey`, and `virtualKey` — SHALL be encrypted at write time via `encryptCredential()` from `src/main/lib/credential-store.ts` and decrypted at read time via `decryptCredential()` from the same module. No other file SHALL perform encryption or decryption on these columns.

Null column values are permitted for rows whose account type does not populate a given credential slot (e.g., a `claude-subscription` account has `oauthToken` set but `apiKey` and `virtualKey` NULL; a `byok` account with `routingMode=litellm` has `virtualKey` set but `oauthToken` and `apiKey` NULL).

#### Scenario: Writing a BYOK-LiteLLM account encrypts the virtual key

- **WHEN** the `anthropicAccounts.add` tRPC mutation is called with `accountType="byok"`, `routingMode="litellm"`, and a `virtualKey` input
- **THEN** the inserted row's `virtual_key` column contains the output of `encryptCredential(virtualKey)`, not the plaintext
- **AND** `api_key` and `oauth_token` columns are NULL

#### Scenario: Reading a BYOK-LiteLLM account decrypts the virtual key

- **WHEN** a profile row is loaded for use in `deriveClaudeSpawnEnv`
- **AND** the row has `account_type="byok"`, `routing_mode="litellm"`, and `virtual_key` populated
- **THEN** the main process calls `decryptCredential(row.virtualKey)` to obtain the plaintext
- **AND** the plaintext is passed into `deriveClaudeSpawnEnv` as `mode.virtualKey`
- **AND** the plaintext never appears in any log line or tRPC response body

#### Scenario: Regression guard catches direct encryption bypass on new columns

- **WHEN** a developer adds code that writes plaintext to `apiKey` or `virtualKey` columns without routing through `credential-store.ts`
- **AND** `bun test tests/regression/credential-storage-tier.test.ts` is run
- **THEN** the guard fails referencing the bypassed call site

