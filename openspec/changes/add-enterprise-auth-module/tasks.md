## 1. Dependencies

- [ ] 1.1 Install `@azure/msal-node@^5` as a production dependency via `bun add @azure/msal-node`
- [ ] 1.2 Install `@azure/msal-node-extensions` (latest compatible with msal-node v5) via `bun add @azure/msal-node-extensions`
- [ ] 1.3 Install `jose@^5` as a production dependency via `bun add jose`
- [ ] 1.4 Update `postinstall` script in `package.json` to include `@azure/msal-node-extensions` in the `electron-rebuild` target list
- [ ] 1.5 Run `bun install` and verify all three packages resolve without errors
- [ ] 1.6 Run `bun run postinstall` and verify native module rebuild succeeds for `msal-node-extensions`
- [ ] 1.7 Run `bun audit` — verify no new HIGH/CRITICAL advisories introduced by the new packages

## 2. Type Definitions

- [ ] 2.1 Create `src/main/lib/enterprise-types.ts` with `EnterpriseAuthConfig`, `EnterpriseUser`, and `EnterpriseAuthResult` type exports per the spec

## 3. Token Cache Persistence

- [ ] 3.1 Create `src/main/lib/enterprise-store.ts` implementing MSAL `ICachePlugin` interface
- [ ] 3.2 Integrate with `credential-store.ts` tier detection — Tier 1: platform-native via `PersistenceCreator`, Tier 2: file-based fallback + warning, Tier 3: in-memory only + warning
- [ ] 3.3 Handle enterprise flag override — when `credentialStorageRequireEncryption` is true and tier is 2, use in-memory only
- [ ] 3.4 Export a factory function (e.g., `createEnterpriseCachePlugin()`) that returns the configured `ICachePlugin`

## 4. Enterprise Auth Module

- [ ] 4.1 Create `src/main/lib/enterprise-auth.ts` with `createEnterpriseAuth(config)` factory function
- [ ] 4.2 Configure MSAL `PublicClientApplication` with `clientCapabilities: ["CP1"]`, tenant-specific authority, loopback redirect URI
- [ ] 4.3 Implement `acquireTokenInteractive()` — wraps MSAL's interactive token acquisition with error handling
- [ ] 4.4 Implement `acquireTokenSilent()` — wraps MSAL's silent token acquisition with automatic account selection
- [ ] 4.5 Implement `signOut()` — clears MSAL cache + persistence
- [ ] 4.6 Implement `getAccount()` — extracts `EnterpriseUser` from cached MSAL account claims using `jose` for JWT payload decoding
- [ ] 4.7 Implement `isAuthenticated()` — checks for non-expired cached account
- [ ] 4.8 Wire `enterprise-store.ts` cache plugin into the MSAL configuration

## 5. Regression Guard

- [ ] 5.1 Create `tests/regression/enterprise-auth-module.test.ts` with assertions per spec: module exports exist, auth-manager isolation, package.json dependencies present
- [ ] 5.2 Run `bun test` — all regression guards pass (existing + new)

## 6. Quality Gates

- [ ] 6.1 Run `bun run ts:check` — no new errors above baseline (87)
- [ ] 6.2 Run `bun run build` — clean build (verify new modules bundle correctly)
- [ ] 6.3 Run `bun test` — all regression guards pass
- [ ] 6.4 Run `bun audit` — no new HIGH/CRITICAL advisories
- [ ] 6.5 Update CLAUDE.md: add enterprise-auth.ts and enterprise-store.ts to architecture diagram, increment regression guard count, document the 3 new dependencies
