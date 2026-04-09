## Requirements

### Requirement: MSAL Node dependencies installed and configured for Electron rebuild

The project SHALL include `@azure/msal-node` (v5.x), `@azure/msal-node-extensions` (latest compatible with msal-node v5), and `jose` (v5.x) as production dependencies in `package.json`. The `postinstall` script SHALL include `@azure/msal-node-extensions` in the `electron-rebuild` target list alongside `better-sqlite3` and `node-pty`.

#### Scenario: Dependencies are installed and resolvable

- **WHEN** `bun install` completes
- **THEN** `require.resolve("@azure/msal-node")` succeeds
- **AND** `require.resolve("@azure/msal-node-extensions")` succeeds
- **AND** `require.resolve("jose")` succeeds

#### Scenario: Native module rebuilds for Electron

- **WHEN** `bun run postinstall` runs
- **THEN** `@azure/msal-node-extensions` is included in the electron-rebuild targets
- **AND** the rebuild completes without errors on the current platform

### Requirement: Enterprise auth module with MSAL PublicClientApplication

The system SHALL provide `src/main/lib/enterprise-auth.ts` exporting functions for Entra ID token acquisition using MSAL Node's `PublicClientApplication`. The module is wired into `auth-manager.ts` via a Strangler Fig adapter gated by `enterpriseAuthEnabled` (change #2, wire-enterprise-auth).

The module SHALL export:

- `createEnterpriseAuth(config: EnterpriseAuthConfig): EnterpriseAuth` — factory that creates a configured MSAL client instance
- `EnterpriseAuth` class/interface with:
  - `acquireTokenInteractive(): Promise<EnterpriseAuthResult>` — triggers browser-based Entra sign-in with PKCE via loopback redirect
  - `acquireTokenSilent(): Promise<EnterpriseAuthResult>` — uses cached refresh token for silent renewal
  - `signOut(): Promise<void>` — clears cached account from MSAL and persistence
  - `getAccount(): EnterpriseUser | null` — returns the cached user without network calls
  - `isAuthenticated(): boolean` — returns whether a non-expired cached account exists

The MSAL configuration SHALL include:
- Authority URL: `https://login.microsoftonline.com/{tenantId}/v2.0`
- Loopback redirect URI: `http://localhost` (MSAL auto-selects an available port)
- `clientCapabilities` SHALL NOT include `"CP1"` — LiteLLM is not a CAE-enabled resource; CP1 would cause Entra to issue 28-hour tokens without revocation capability, degrading security posture versus the default 1-hour lifetime

#### Scenario: Creating an enterprise auth instance with valid config

- **WHEN** `createEnterpriseAuth({ clientId: "abc", tenantId: "xyz" })` is called
- **THEN** a configured `EnterpriseAuth` instance is returned
- **AND** the underlying MSAL `PublicClientApplication` does NOT have `clientCapabilities: ["CP1"]`
- **AND** the authority is `https://login.microsoftonline.com/xyz/v2.0`

#### Scenario: acquireTokenSilent returns cached token when valid

- **WHEN** `acquireTokenSilent()` is called
- **AND** the MSAL cache contains a non-expired access token for the active account
- **THEN** the function returns an `EnterpriseAuthResult` with the cached token
- **AND** no network call is made

#### Scenario: acquireTokenSilent triggers refresh when token is expired

- **WHEN** `acquireTokenSilent()` is called
- **AND** the access token is expired but the refresh token is valid
- **THEN** MSAL Node performs a silent token refresh via the Entra token endpoint
- **AND** the function returns an `EnterpriseAuthResult` with the new token

#### Scenario: Module is wired into auth-manager via Strangler Fig adapter

- **WHEN** `src/main/auth-manager.ts` is scanned
- **THEN** it imports from `./lib/enterprise-auth`
- **AND** all public methods branch on `enterpriseAuthEnabled` feature flag

### Requirement: Enterprise auth types

The system SHALL provide `src/main/lib/enterprise-types.ts` exporting:

- `EnterpriseAuthConfig` — `{ clientId: string, tenantId: string, authority?: string, redirectUri?: string }`
- `EnterpriseUser` — `{ oid: string, tid: string, displayName: string, email: string | null }`
- `EnterpriseAuthResult` — `{ accessToken: string, expiresOn: Date, account: EnterpriseUser }`

These types SHALL be the contract that change #2 uses when wiring into `auth-manager.ts`.

#### Scenario: EnterpriseUser has oid as the identity key

- **WHEN** a successful authentication completes
- **THEN** the `EnterpriseUser.oid` field contains the Entra object ID (GUID)
- **AND** it is NOT the `preferred_username` or `email` (which are mutable and unsuitable for authorization per Microsoft docs)

### Requirement: Tier-aware token cache persistence

The system SHALL provide `src/main/lib/enterprise-store.ts` implementing MSAL Node's `ICachePlugin` interface with platform-appropriate persistence that integrates with `credential-store.ts` tier detection.

| Credential Tier | Persistence Behavior |
|---|---|
| Tier 1 (OS keystore) | `@azure/msal-node-extensions` PersistenceCreator with platform-native encryption (Keychain/DPAPI/libsecret) |
| Tier 2 (basic_text) | `@azure/msal-node-extensions` file-based fallback + warning log at creation time |
| Tier 3 (none) | In-memory cache only (no disk persistence). Warning logged. Tokens survive the session but not app restart. |

When `credentialStorageRequireEncryption` is `true` and the tier is 2, the behavior SHALL match Tier 3 (in-memory only).

#### Scenario: Tier 1 system uses platform-native persistence

- **WHEN** `enterprise-store.ts` initializes on a Tier 1 system (macOS/Windows, or Linux with libsecret)
- **THEN** the MSAL cache plugin uses `@azure/msal-node-extensions` with platform-native encryption
- **AND** tokens persist across app restarts

#### Scenario: Tier 3 system uses in-memory cache

- **WHEN** `enterprise-store.ts` initializes on a Tier 3 system
- **THEN** the MSAL cache plugin uses in-memory storage only
- **AND** a warning is logged: `[EnterpriseStore] No secure storage available — MSAL tokens will not persist across restarts`
- **AND** tokens do NOT persist across app restarts

#### Scenario: Enterprise flag escalates Tier 2 to in-memory

- **WHEN** `credentialStorageRequireEncryption` is `true`
- **AND** the system is Tier 2 (basic_text)
- **THEN** the MSAL cache plugin uses in-memory storage only (same as Tier 3)

### Requirement: Regression guard for module exports

A regression test at `tests/regression/enterprise-auth-module.test.ts` SHALL verify:

1. `enterprise-auth.ts` exists and exports `createEnterpriseAuth`
2. `enterprise-store.ts` exists and exports the cache plugin factory
3. `enterprise-types.ts` exists and exports `EnterpriseAuthConfig`, `EnterpriseUser`, `EnterpriseAuthResult`
4. `package.json` includes `@azure/msal-node`, `@azure/msal-node-extensions`, and `jose`

Note: The isolation boundary assertion (auth-manager does NOT import enterprise-auth) was removed in change #2 (wire-enterprise-auth). Wiring invariants are validated by `enterprise-auth-wiring.test.ts`.

#### Scenario: Regression guard passes on compliant codebase

- **WHEN** `bun test tests/regression/enterprise-auth-module.test.ts` runs
- **THEN** all assertions pass

#### Scenario: Wiring is validated by the enterprise-auth-wiring guard

- **WHEN** `bun test tests/regression/enterprise-auth-wiring.test.ts` runs
- **THEN** all wiring assertions pass
