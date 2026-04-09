## Context

The 1Code enterprise fork stores OAuth tokens in three independent code paths, each calling Electron's `safeStorage` API directly:

1. **`auth-store.ts`** — File-based (`auth.dat`), stores desktop OAuth session data. Falls back to plaintext `auth.dat.json`.
2. **`anthropic-accounts.ts`** — Drizzle-based, stores per-account tokens in `anthropic_accounts.oauthToken`. Falls back to base64.
3. **`claude-code.ts`** — Calls through to `anthropic-accounts.ts` via `storeOAuthToken`, which writes to 3 tables (`anthropicAccounts`, `anthropicSettings`, `claudeCodeCredentials`).

All three silently degrade to base64/plaintext when `safeStorage.isEncryptionAvailable()` returns `false`. No user notification. No audit trail. No way for enterprise operators to enforce encryption.

The auth strategy document (§7.1.1) prescribes a 3-tier hierarchy that has never been implemented. Phase 1 (`add-anthropic-gateway-auth`) will introduce Entra SSO tokens — the most sensitive credential the app will store. This change must land first.

**Constraint:** This runs entirely in the Electron main process. The renderer never touches raw tokens — it calls tRPC procedures that delegate to main-process routers. No IPC boundary changes are needed.

**Constraint:** The chosen enterprise auth strategy is Envoy Gateway dual-auth v2.1 (empirically validated 2026-04-08). The `credential-store.ts` module must accommodate both existing Anthropic tokens and future Entra MSAL tokens without requiring a second abstraction.

## Goals / Non-Goals

**Goals:**
- Unify all credential encryption behind a single `credential-store.ts` module
- Implement the 3-tier degradation policy from auth-strategy §7.1.1
- Log the detected tier at startup for operator audit
- Provide a feature flag (`credentialStorageRequireEncryption`) for enterprise hard-refusal override
- Add a regression guard ensuring the Tier 3 refusal path exists
- Create a clean foundation for Phase 1 Entra token storage

**Non-Goals:**
- `enterprise-store.ts` / `@azure/msal-node-extensions` integration (Phase 1 scope)
- Migrating existing base64 tokens (no existing tokens to worry about)
- UI banner for Tier 2 degraded mode (deferred — startup log + feature flag is sufficient for now)
- Changing the renderer or IPC boundary
- Modifying the `feature_flag_overrides` Drizzle schema (reuses existing table)
- Detecting the *specific* safeStorage backend (libsecret vs basic) — Electron does not expose this; see Decision 3

## Decisions

### Decision 1: Single module vs. extending existing functions

**Chosen: New `src/main/lib/credential-store.ts` module**

The three existing encrypt/decrypt implementations are near-identical but in different files with different fallback behaviors (`auth-store.ts` writes a file, `anthropic-accounts.ts` base64-encodes into SQLite). A single module eliminates the divergence.

**Alternative considered:** Extending `encryptToken`/`decryptToken` in `anthropic-accounts.ts` and importing from other files. Rejected because `auth-store.ts` uses a fundamentally different storage pattern (file-based) and would awkwardly import from a tRPC router file, violating the dependency direction (library → router).

### Decision 2: Tier detection strategy

**Chosen: `safeStorage.isEncryptionAvailable()` as the sole gate, with `getSelectedStorageBackend()` (Electron 39+) for tier differentiation where available**

Electron 39 exposes `safeStorage.getSelectedStorageBackend()` which returns `"basic_text"`, `"gnome_libsecret"`, `"kwallet"`, `"kwallet5"`, `"kwallet6"`, `"dpapi"`, or `"keychain"`. This lets us distinguish Tier 1 (real keystore) from Tier 2 (basic_text = hardcoded password obfuscation).

| Backend value | Tier | Behavior |
|---|---|---|
| `keychain`, `dpapi`, `gnome_libsecret`, `kwallet*` | 1 | Proceed |
| `basic_text` | 2 | Proceed + warn log |
| `isEncryptionAvailable() === false` | 3 | Refuse |

**Alternative considered:** Probing via environment heuristics (check for `DBUS_SESSION_BUS_ADDRESS`, `GNOME_KEYRING_CONTROL`, etc.). Rejected — fragile, duplicates what Electron already knows, and would need per-distro maintenance.

### Decision 3: Feature flag semantics

**Chosen: `credentialStorageRequireEncryption: false` in `FLAG_DEFAULTS`**

When `true`, Tier 2 (basic_text backend) escalates to Tier 3 behavior (hard refusal). This gives enterprise operators a way to enforce "real encryption or nothing" without code changes.

The flag follows the existing `feature-flags.ts` pattern — `getFlag("credentialStorageRequireEncryption")` returns `boolean`, overridable via the `feature_flag_overrides` table or the `feature-flags` tRPC router.

### Decision 4: Public API shape

```typescript
// src/main/lib/credential-store.ts

/** Detected at startup, immutable for the process lifetime */
export type CredentialTier = 1 | 2 | 3;

/** Returns the detected tier (cached after first call) */
export function getCredentialTier(): CredentialTier;

/** Encrypt a plaintext credential. Throws CredentialStorageRefusedError on Tier 3. */
export function encryptCredential(plaintext: string): string;

/** Decrypt an encrypted credential. Throws on tampered data. */
export function decryptCredential(encrypted: string): string;

/** Error class for Tier 3 refusal (or Tier 2 + enterprise flag) */
export class CredentialStorageRefusedError extends Error {
  tier: CredentialTier;
  actionableMessage: string; // e.g., "Install gnome-keyring: sudo apt install gnome-keyring"
}
```

The `CredentialStorageRefusedError` carries an actionable message so callers can surface it to users without interpreting the tier themselves.

### Decision 5: Startup logging

At app startup (in `src/main/index.ts`, after `app.whenReady()`), call `getCredentialTier()` and log:

```
[CredentialStore] Storage tier: 1 (backend: gnome_libsecret)
```

or:

```
[CredentialStore] Storage tier: 2 (backend: basic_text) — WARNING: tokens obfuscated, not encrypted
```

This is a single log line — no telemetry, no external reporting. Operators can grep for it in logs.

### Decision 6: Refactoring the three callers

| Caller | Current | After |
|---|---|---|
| `auth-store.ts` | Inline `safeStorage.encryptString/decryptString` + file fallback | Calls `encryptCredential/decryptCredential`. File-vs-DB choice unchanged (file-based pattern preserved). Plaintext `.json` fallback path **removed** — Tier 3 refuses instead. |
| `anthropic-accounts.ts` | Inline `encryptToken/decryptToken` with base64 fallback | Deletes local functions, imports from `credential-store.ts`. Base64 fallback path **removed**. |
| `claude-code.ts` | Calls `anthropic-accounts.ts` functions indirectly via `storeOAuthToken` | No direct changes needed — inherits fix through `anthropic-accounts.ts`. |

## Risks / Trade-offs

**[Risk: `getSelectedStorageBackend()` unavailable in older Electron]** → Mitigated: We target Electron 39+ (current pin is 39.8.7), and this API was added in Electron 33. If the return value is unexpected, fall back to treating `isEncryptionAvailable() === true` as Tier 1 (conservative — better to over-trust than to wrongly refuse).

**[Risk: Breaking Linux users who currently rely on silent base64 fallback]** → Mitigated: Tier 2 still allows storage (just with a warning). Only enterprise operators who explicitly enable `credentialStorageRequireEncryption` get hard refusal. Default behavior is **more visible** but not more restrictive.

**[Risk: Tier detection at import time vs. runtime]** → The tier is detected lazily on first call to `getCredentialTier()` and cached. This avoids issues with `safeStorage` not being ready before `app.whenReady()`. The startup log in `index.ts` triggers the detection after the app is ready.

**[Trade-off: No UI banner for Tier 2]** → Startup log is sufficient for the operator persona. A UI banner requires renderer changes and design decisions (dismissibility, persistence) that would expand scope. Can be added in a follow-up change.

**[Trade-off: No MSAL-extensions integration]** → `@azure/msal-node-extensions` provides its own platform-native persistence. When Phase 1 lands, it will either use `credential-store.ts` for raw token bytes or bring its own persistence layer. The API is designed to accommodate both — `encryptCredential`/`decryptCredential` work on opaque strings.
