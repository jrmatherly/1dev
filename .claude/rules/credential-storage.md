---
paths:
  - "src/main/**/*.ts"
---

# Credential storage — ALL encryption through credential-store.ts

All credential encryption in this repo goes through `src/main/lib/credential-store.ts`. **Do NOT call `safeStorage.encryptString()`, `safeStorage.decryptString()`, or `safeStorage.isEncryptionAvailable()` from any other file.**

## Rule

When writing any code in `src/main/` that touches credentials (OAuth tokens, API keys, cached MSAL blobs):

1. **Import from** `src/main/lib/credential-store.ts`
2. **Call** `encryptCredential()` / `decryptCredential()` / `getCredentialStorageTier()`
3. **Do not import** `safeStorage` from `electron` directly

## Why

The `credential-store.ts` module detects the platform tier:
- **Tier 1** — OS keystore (macOS Keychain, Windows Credential Manager, Linux secret-service)
- **Tier 2** — `basic_text` obfuscation (weak — warns the user)
- **Tier 3** — No encryption available (refuses storage)

Enterprise operators can set `credentialStorageRequireEncryption: true` to also refuse Tier 2. Bypassing this module means credentials might land on disk without encryption in environments the app should refuse.

## Enforcement

Enforced by `tests/regression/credential-storage-tier.test.ts`. The guard scans `src/main/` for forbidden `safeStorage.*` calls outside `credential-store.ts`.

## Platform notes

- `getSelectedStorageBackend()` is **Linux-only** (`@platform linux`). On macOS/Windows, `isEncryptionAvailable()` returning true always resolves to Tier 1.
- Two independent credential flow paths exist:
  - `storeOAuthToken` → writes to `anthropicAccounts` (used by `importSystemToken`, `importToken`)
  - `customClaudeConfigAtom` → Jotai atom used by `api-key-onboarding-page.tsx` for BYOK API keys
  These are **NOT** the same mechanism. Don't conflate them. Both delegate to `credential-store.ts` for encryption.

## Background

- Module: `src/main/lib/credential-store.ts`
- Spec: `openspec/specs/credential-storage/spec.md`
- Canonical doc: (pending — reference the spec for now)
