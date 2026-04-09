## Why

Phase 1 of the enterprise auth migration (docs/enterprise/auth-strategy.md v2.1) requires the 1Code desktop app to acquire Entra ID tokens via MSAL Node, cache them securely, and make them available for injection into spawned CLI subprocesses. Today the app has no MSAL dependency and no code path for Entra authentication. This change adds the foundation — the MSAL library, the token acquisition module, and the cross-platform token cache — as isolated, feature-flagged modules that are NOT yet wired into the app's auth flow. Wiring is change #2 (`wire-enterprise-auth`).

This is Step A from auth-strategy §5.3.1: "Add `enterprise-auth.ts` and `enterprise-store.ts` as new files, NOT yet wired to anything."

## What Changes

- **Install `@azure/msal-node` v5, `@azure/msal-node-extensions` (latest compatible), and `jose` v5** as production dependencies. Update `postinstall` to add `@azure/msal-node-extensions` to the `electron-rebuild` target list.
- **New `src/main/lib/enterprise-auth.ts`** — MSAL `PublicClientApplication` configuration with `clientCapabilities: ["CP1"]`, tenant-specific authority URL, loopback redirect URI. Exports `acquireTokenInteractive()` (triggers browser auth code flow with PKCE) and `acquireTokenSilent()` (uses cached refresh token). Reads Entra config (client ID, tenant ID) from feature flags or environment.
- **New `src/main/lib/enterprise-store.ts`** — wraps `@azure/msal-node-extensions` `PersistenceCreator` for cross-platform token cache. Integrates with `credential-store.ts` tier detection: Tier 1 uses the platform-native persistence (Keychain/DPAPI/libsecret), Tier 2 uses file-based persistence with a warning, Tier 3 refuses (in-memory only with clear warning). Implements the `ICachePlugin` interface that MSAL Node expects.
- **New `src/main/lib/enterprise-types.ts`** — shared TypeScript types for enterprise auth (`EnterpriseUser`, `EnterpriseAuthConfig`, `EnterpriseAuthResult`)
- **New `tests/regression/enterprise-auth-module.test.ts`** — regression guard verifying module exports, config shape, and isolation (not wired into auth-manager.ts)
- **No wiring** — `auth-manager.ts`, `buildClaudeEnv()`, and the renderer are NOT modified. The `enterpriseAuthEnabled` feature flag already exists but is not checked by any new code path yet.

## Capabilities

### New Capabilities
- `enterprise-auth`: Defines the MSAL Node integration contract — config shape, token acquisition API, cache persistence strategy, and tier-aware storage policy

### Modified Capabilities
_(none — `credential-storage` is consumed but not modified; `feature-flags` infrastructure is unchanged)_

## Impact

- **New dependencies**: `@azure/msal-node` (~v5.x), `@azure/msal-node-extensions` (~v5.x), `jose` (~v5.x). All three are well-maintained Microsoft/auth0 packages. `msal-node-extensions` requires `electron-rebuild` for native keychain bindings on Linux.
- **Affected files**: 4 new files in `src/main/lib/`, 1 new regression guard, `package.json` + `postinstall` script
- **No existing code modified** — this is purely additive
- **No F1-F10 upstream dependency impact** — all changes are new enterprise auth code
- **No database schema changes**
- **Sequence**: This is change **#1 of 4** in the Phase 1 enterprise auth sequence. Change #2 (`wire-enterprise-auth`) depends on this. Change #4 (`setup-cluster-dual-auth`) can proceed in parallel.
