## ADDED Requirements

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

## MODIFIED Requirements

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
