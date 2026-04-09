## Why

The three credential storage paths in the app (`auth-store.ts`, `anthropic-accounts.ts`, `claude-code.ts`) each independently call Electron's `safeStorage` API and each silently degrades to base64 encoding when OS-level encryption is unavailable. No user notification, no audit log, no way for enterprise operators to enforce encryption. The auth strategy document (§7.1.1) prescribes a 3-tier degradation hierarchy (libsecret/Keychain/DPAPI → safeStorage basic → hard refusal), but the current code only implements "encrypt or silently base64." This must be resolved before scaffolding the Phase 1 `add-anthropic-gateway-auth` change, which introduces Entra SSO tokens — the highest-value credential the app will ever store.

## What Changes

- **New `credential-store.ts` module** (`src/main/lib/credential-store.ts`) — single abstraction for all credential encryption/decryption with 3-tier platform degradation policy:
  - **Tier 1** (preferred): OS keystore encryption via `safeStorage` backed by libsecret/Keychain/DPAPI
  - **Tier 2** (degraded): `safeStorage` basic backend (Linux hardcoded-password fallback) — proceed with persistent UI warning + startup audit log
  - **Tier 3** (refuse): No encryption available — hard refusal, block token storage with actionable error message
- **Refactor existing callers** — `auth-store.ts`, `anthropic-accounts.ts`, and `claude-code.ts` become thin wrappers delegating to `credential-store.ts`
- **New feature flag** — `credentialStorageRequireEncryption` in `FLAG_DEFAULTS` (default: `false`). When `true`, Tier 2 escalates to hard refusal (enterprise lockdown mode)
- **Startup tier logging** — log the detected credential storage tier at app startup for operator audit
- **Regression guard** — new `tests/regression/credential-storage-tier.test.ts` ensuring the Tier 3 refusal path exists and the module is the sole encryption entry point

## Capabilities

### New Capabilities
- `credential-storage`: Defines the tiered credential encryption policy, the `credential-store.ts` public API contract, startup audit logging, and the enterprise hard-refusal feature flag override

### Modified Capabilities
_(none — `claude-code-auth-import` covers auth flow, not storage encryption; `feature-flags` defines the flag infrastructure shape which is unchanged — we just add an entry to `FLAG_DEFAULTS`)_

## Impact

- **Affected tRPC routers**: `anthropic-accounts` (encrypt/decrypt calls), `claude-code` (`storeOAuthToken` path), `claude-settings` (token retrieval)
- **Affected main-process modules**: `auth-store.ts` (file-based credential storage), `index.ts` (startup tier log)
- **Database**: No schema changes — uses existing `feature_flag_overrides` table for the new flag
- **No F1-F10 upstream dependency impact** — all changes are local credential storage, no upstream call sites touched
- **Phase 0 status**: All 15 gates remain closed. This is a **Phase 0.5** hardening change — prerequisite for Phase 1
