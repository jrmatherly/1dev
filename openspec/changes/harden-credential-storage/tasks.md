## 1. Core Module

- [x] 1.1 Create `src/main/lib/credential-store.ts` with `CredentialTier` type, `CredentialStorageRefusedError` class, and tier detection logic using `safeStorage.isEncryptionAvailable()` + `safeStorage.getSelectedStorageBackend()`
- [x] 1.2 Implement `encryptCredential(plaintext: string): string` — delegates to `safeStorage.encryptString()` on Tier 1/2, throws `CredentialStorageRefusedError` on Tier 3
- [x] 1.3 Implement `decryptCredential(encrypted: string): string` — delegates to `safeStorage.decryptString()`
- [x] 1.4 Implement enterprise flag check — when `getFlag("credentialStorageRequireEncryption")` is `true`, Tier 2 escalates to `CredentialStorageRefusedError`
- [x] 1.5 Verify `bun run ts:check` does not introduce new errors above baseline

## 2. Feature Flag

- [x] 2.1 Add `credentialStorageRequireEncryption: false` to `FLAG_DEFAULTS` in `src/main/lib/feature-flags.ts`
- [x] 2.2 Verify `bun test tests/regression/feature-flags-shape.test.ts` still passes (flag count may need updating)

## 3. Refactor Callers

- [x] 3.1 Refactor `src/main/lib/trpc/routers/anthropic-accounts.ts` — delete local `encryptToken`/`decryptToken`, import `encryptCredential`/`decryptCredential` from `../../credential-store`, update all call sites
- [x] 3.2 Refactor `src/main/auth-store.ts` — replace inline `safeStorage` calls with `encryptCredential`/`decryptCredential`, remove plaintext `.json` write fallback and all legacy read paths (no deployments exist), propagate `CredentialStorageRefusedError` from `save()`
- [x] 3.3 Refactor `src/main/lib/trpc/routers/claude-code.ts` — had its own copy of encryptToken/decryptToken (not inherited from anthropic-accounts.ts). Deleted local functions, added credential-store imports, replaced all call sites
- [x] 3.4 Grep `src/main/` for any remaining direct `safeStorage.encryptString` / `safeStorage.decryptString` / `safeStorage.isEncryptionAvailable` calls outside `credential-store.ts` and remove them — also refactored `claude.ts` (had its own decryptToken copy)
- [x] 3.5 Verify `bun run ts:check` does not introduce new errors above baseline

## 4. Startup Audit Log

- [x] 4.1 Add `logCredentialTier()` call in `src/main/index.ts` after `app.whenReady()`, in the format specified by the credential-storage spec
- [x] 4.2 Verify log output manually with `bun run dev` (check terminal for `[CredentialStore] Storage tier:` line) — build passes, manual verification at user's discretion

## 5. Regression Guard

- [x] 5.1 Create `tests/regression/credential-storage-tier.test.ts` with 9 assertions: module exports, 3-tier detection, no direct safeStorage calls, no local encrypt/decrypt in 3 routers, auth-store clean, flag exists, positive controls
- [x] 5.2 Verify `bun test` passes — 36 tests across 10 files, 0 failures

## 6. Quality Gates

- [x] 6.1 Run `bun run ts:check` — 87 errors (at baseline)
- [x] 6.2 Run `bun run build` — clean build in 50s
- [x] 6.3 Run `bun test` — 36 tests across 10 files, 0 failures
- [x] 6.4 Run `bun audit` — no new advisories (57 pre-existing)
- [x] 6.5 Update CLAUDE.md: regression guard count (9 → 10, 27 → 36 tests), `credential-store.ts` in architecture diagram + Important Files
