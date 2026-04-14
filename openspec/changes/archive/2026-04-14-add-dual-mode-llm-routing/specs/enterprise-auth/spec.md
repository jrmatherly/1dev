## MODIFIED Requirements

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
