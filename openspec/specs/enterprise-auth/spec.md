# enterprise-auth Specification

## Purpose

MSAL Node enterprise authentication module for Entra ID token acquisition, with tier-aware cache persistence.
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

**New constraint (add-dual-mode-llm-routing):** The Entra access token obtained by `acquireTokenSilent()` or `acquireTokenInteractive()` SHALL NOT be written into `ANTHROPIC_AUTH_TOKEN` or any other Claude CLI environment variable. The token is used only for (a) identifying the app session in the renderer, and (b) extracting the `oid` claim for use as the `x-litellm-customer-id` audit header via `ANTHROPIC_CUSTOM_HEADERS`. The `applyEnterpriseAuth()` function in `src/main/lib/claude/env.ts` SHALL NOT contain any assignment to `env.ANTHROPIC_AUTH_TOKEN`.

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

#### Scenario: applyEnterpriseAuth never writes ANTHROPIC_AUTH_TOKEN

- **WHEN** `src/main/lib/claude/env.ts` is scanned
- **AND** the body of `applyEnterpriseAuth` is extracted
- **THEN** no line in that body matches `env.ANTHROPIC_AUTH_TOKEN =` or equivalent assignment syntax
- **AND** the regression guard `tests/regression/no-entra-in-anthropic-auth-token.test.ts` passes

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

### Requirement: User.Read delegated scope for Microsoft Graph profile access

The MSAL `PublicClientApplication` in `src/main/lib/enterprise-auth.ts` SHALL include `"User.Read"` as a delegated scope in its `DEFAULT_SCOPES` constant, so that `acquireTokenSilent` and `acquireTokenInteractive` can return tokens usable against `graph.microsoft.com/v1.0/me` endpoints.

The scope SHALL be added alongside the existing `["openid", "profile", "email", "offline_access"]` set, not in place of them. Admin consent for `User.Read` on the desktop app registration is a one-time tenant-admin operation documented in the Entra setup guide under `docs/enterprise/`. Existing refresh tokens remain valid for the scopes they already cover; incremental consent handles the new scope on next interactive sign-in or on-demand via `acquireTokenForGraph`.

The module SHALL export a new helper `acquireTokenForGraph(): Promise<string>` that wraps `acquireTokenSilent({ scopes: ["User.Read"], account: cachedAccount })` and returns the access token string for use by the Graph profile fetcher. The returned token is short-lived and in-memory; it MUST NOT be routed through `src/main/lib/credential-store.ts` (that tier is for persisted credentials; Graph access tokens are not persisted — MSAL's own cache handles refresh).

#### Scenario: DEFAULT_SCOPES contains User.Read

- **WHEN** `src/main/lib/enterprise-auth.ts` is scanned
- **THEN** the `DEFAULT_SCOPES` constant includes `"User.Read"` alongside the existing OIDC scopes
- **AND** the string appears exactly once (not duplicated)

#### Scenario: acquireTokenForGraph returns a Graph-scoped access token silently

- **WHEN** `acquireTokenForGraph()` is called
- **AND** the MSAL cache holds a valid refresh token for the signed-in account
- **AND** admin consent for `User.Read` has been granted on the desktop app registration
- **THEN** the function returns a string access token
- **AND** no interactive sign-in prompt is surfaced
- **AND** no network call other than the MSAL silent-renewal round trip is made

#### Scenario: acquireTokenForGraph surfaces a consent prompt when User.Read is not yet granted

- **WHEN** `acquireTokenForGraph()` is called
- **AND** admin consent for `User.Read` has NOT been granted AND the user has not individually consented
- **THEN** MSAL throws an `InteractionRequiredAuthError`
- **AND** the caller may respond by triggering `acquireTokenInteractive` with the Graph scope to surface the incremental consent dialog

#### Scenario: Graph access token does not flow through credential-store.ts

- **WHEN** `src/main/lib/enterprise-auth.ts` is scanned
- **THEN** the body of `acquireTokenForGraph` contains no call to `encryptCredential`, `decryptCredential`, or any other `credential-store` export
- **AND** the regression guard `tests/regression/credential-storage-tier.test.ts` does NOT add the Graph access token to its allowlist of persisted credential-bearing channels

### Requirement: Graph profile retrieval with avatar fallback

The system SHALL provide a main-process helper at `src/main/lib/graph-profile.ts` exporting `fetchGraphProfile(token: string): Promise<GraphProfile>`, where `GraphProfile = { displayName: string, mail: string | null, jobTitle: string | null, department: string | null, officeLocation: string | null, avatarDataUrl: string | null }`. The helper makes two parallel Graph calls:

1. `GET https://graph.microsoft.com/v1.0/me?$select=displayName,mail,jobTitle,department,officeLocation` with `Authorization: Bearer <token>`.
2. `GET https://graph.microsoft.com/v1.0/me/photo/$value` with `Authorization: Bearer <token>`.

On photo-endpoint 404 or 403 (no photo set, tenant policy hides photos), `avatarDataUrl` SHALL be `null`. On photo-endpoint success, the blob SHALL be converted to a `data:image/<mime>;base64,<base64>` URL suitable for direct `<img src>` consumption. On profile-endpoint failure, the helper SHALL throw a typed error that the tRPC layer translates into a user-facing fallback; partial success (profile text + null avatar) is explicitly valid.

A renderer-side tRPC procedure `enterpriseAuth.getGraphProfile` SHALL wrap the helper. The procedure uses React Query `staleTime: 1h` to avoid re-fetches on every Account tab open within a session.

A reusable React component `src/renderer/components/ui/avatar-with-initials.tsx` SHALL render `<img>` when `avatarDataUrl` is a non-null string, or a circle containing the user's initials on a deterministic pastel background derived from a hash of the user's `oid` claim when `avatarDataUrl` is null. Initials are the first character of the first two whitespace-separated tokens of `displayName`; if `displayName` is empty, fall back to the email local part; if both are unavailable, render "?".

#### Scenario: Profile with photo returns full GraphProfile including avatarDataUrl

- **GIVEN** the signed-in user has a profile photo set in their Microsoft 365 account
- **WHEN** `fetchGraphProfile(token)` is called with a valid User.Read-scoped token
- **THEN** both Graph calls succeed
- **AND** the returned `GraphProfile.avatarDataUrl` starts with the literal prefix `data:image/` followed by a mime subtype, `;base64,`, and at least one base64 character
- **AND** the returned object includes `displayName`, `mail`, `jobTitle`, `department`, `officeLocation` populated from the `/me?$select=...` response

#### Scenario: No photo set — 404 response leads to null avatar with text fields intact

- **GIVEN** the signed-in user has NOT set a profile photo
- **WHEN** `fetchGraphProfile(token)` is called
- **THEN** the photo-endpoint returns 404
- **AND** the returned `GraphProfile.avatarDataUrl` is `null`
- **AND** the text fields (`displayName`, `mail`, etc.) are still populated from the successful `/me?$select=...` call

#### Scenario: Tenant policy hides photos — 403 response leads to null avatar

- **GIVEN** the tenant has configured a Graph policy that prevents photo reads
- **WHEN** `fetchGraphProfile(token)` is called
- **THEN** the photo-endpoint returns 403
- **AND** the returned `GraphProfile.avatarDataUrl` is `null`
- **AND** the helper does NOT throw (403 on the photo endpoint is a valid "no photo available" signal, not a fatal error)

#### Scenario: Renderer avatar component renders initials on a deterministic color when avatarDataUrl is null

- **GIVEN** the current user has `displayName = "Jason Matherly"` and `oid = "11111111-2222-3333-4444-555555555555"`
- **AND** `avatarDataUrl` is `null` (from any of the fallback scenarios above)
- **WHEN** `<AvatarWithInitials>` renders
- **THEN** the rendered output contains the text "JM" (first letter of each of the first two whitespace tokens of displayName)
- **AND** the background color is a pastel HSL value deterministically derived from the `oid` hash
- **AND** re-rendering the same component for the same user produces the same background color (no randomization)

#### Scenario: Empty displayName falls back to email local-part initials

- **GIVEN** the current user has `displayName = ""` and `mail = "jason.matherly@example.com"`
- **AND** `avatarDataUrl` is `null`
- **WHEN** `<AvatarWithInitials>` renders
- **THEN** the rendered output contains "JM" (first two letters of the email local-part before the `@` sign, uppercased)

#### Scenario: Account tab surfaces Graph profile fields

- **GIVEN** the user has an active enterprise-auth session
- **AND** the tenant has granted `User.Read` delegated consent
- **WHEN** the user navigates to Settings → Account
- **THEN** `trpc.enterpriseAuth.getGraphProfile` fires once (React Query staleTime 1h)
- **AND** the tab renders the avatar (or initials fallback) at the top of the card
- **AND** the tab renders read-only rows for Department, Job Title, and Office Location when those fields are non-null
- **AND** the existing Full Name and Email rows continue to render as they do today

