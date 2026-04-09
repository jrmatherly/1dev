## 1. Dependencies

- [x] 1.1 Install `@azure/msal-node@^5` — installed v5.1.2
- [x] 1.2 Install `@azure/msal-node-extensions` — installed v5.1.2 (lockstep with msal-node)
- [x] 1.3 Install `jose` — installed v6.2.2 (latest stable, no breaking changes for JWT decoding)
- [x] 1.4 N/A — `msal-node-extensions` ships pre-built .node binaries (no binding.gyp), electron-rebuild not needed
- [x] 1.5 All three packages resolve successfully via `require.resolve()`
- [x] 1.6 N/A — no native rebuild needed (pre-built binaries)
- [x] 1.7 `bun audit` — 57 pre-existing vulnerabilities, no new advisories from MSAL packages

## 2. Type Definitions

- [x] 2.1 Create `src/main/lib/enterprise-types.ts` with `EnterpriseAuthConfig`, `EnterpriseUser`, and `EnterpriseAuthResult` type exports per the spec

## 3. Token Cache Persistence

- [x] 3.1 Create `src/main/lib/enterprise-store.ts` implementing MSAL `ICachePlugin` interface
- [x] 3.2 Integrate with `credential-store.ts` tier detection — Tier 1: platform-native via `PersistenceCreator`, Tier 2: file-based with `usePlaintextFileOnLinux` + warning, Tier 3: in-memory only + warning
- [x] 3.3 Handle enterprise flag override — when `credentialStorageRequireEncryption` is true and tier is 2, use in-memory only
- [x] 3.4 Export `createEnterpriseCachePlugin()` async factory returning configured `ICachePlugin`

## 4. Enterprise Auth Module

- [x] 4.1 Create `src/main/lib/enterprise-auth.ts` with `createEnterpriseAuth(config)` async factory
- [x] 4.2 Configure MSAL `PublicClientApplication` with `clientCapabilities` (NOTE: CP1 deferred — see design note below), tenant-specific authority, loopback redirect
- [x] 4.3 Implement `acquireTokenInteractive()` with shell.openExternal for browser launch, success/error templates
- [x] 4.4 Implement `acquireTokenSilent()` with automatic account resolution from cache
- [x] 4.5 Implement `signOut()` — clears active account from MSAL cache
- [x] 4.6 Implement `getAccount()` — extracts `EnterpriseUser` from MSAL idTokenClaims (jose imported for future use)
- [x] 4.7 Implement `isAuthenticated()` — checks cachedAccount presence
- [x] 4.8 Wire `enterprise-store.ts` cache plugin into MSAL config via `createEnterpriseCachePlugin()`

## 5. Regression Guard

- [x] 5.1 Create `tests/regression/enterprise-auth-module.test.ts` — 9 assertions: exports, CP1 config, store tier integration, types, oid identity key, isolation boundary, deps, positive controls
- [x] 5.2 Run `bun test` — 45 tests across 11 files, 0 failures

## 6. Quality Gates

- [x] 6.1 Run `bun run ts:check` — 87 errors (at baseline)
- [x] 6.2 Run `bun run build` — clean build in 41s
- [x] 6.3 Run `bun test` — 45 tests across 11 files, 0 failures
- [x] 6.4 Run `bun audit` — 57 pre-existing, no new advisories
- [x] 6.5 Updated CLAUDE.md: architecture diagram (3 new modules), guard count (11/45), guard list, MSAL dependency versions, removed stale msal version mismatch warning
