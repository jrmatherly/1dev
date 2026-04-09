## ADDED Requirements

### Requirement: Strangler Fig adapter in auth-manager.ts

`src/main/auth-manager.ts` SHALL branch on the `enterpriseAuthEnabled` feature flag in its constructor. When the flag is `true`, all public methods (`isAuthenticated`, `getCurrentUser`, `refresh`, `signOut`, `getToken`, `setOnTokenRefresh`, `dispose`) SHALL delegate to the `EnterpriseAuth` instance from `enterprise-auth.ts`. When the flag is `false`, the existing 21st.dev/apollosai.dev behavior SHALL be preserved unchanged.

The `getAuthManager()` singleton accessor SHALL continue to work identically — callers do NOT need to know which backend is active.

#### Scenario: Enterprise auth disabled — legacy behavior preserved

- **WHEN** `getFlag("enterpriseAuthEnabled")` returns `false`
- **THEN** `auth-manager.ts` initializes with the existing 21st.dev OAuth flow
- **AND** all 20+ call sites to `getAuthManager()` work exactly as before

#### Scenario: Enterprise auth enabled — delegates to EnterpriseAuth

- **WHEN** `getFlag("enterpriseAuthEnabled")` returns `true`
- **AND** `ENTRA_CLIENT_ID` environment variable is set
- **THEN** `auth-manager.ts` creates an `EnterpriseAuth` instance
- **AND** `getAuthManager().isAuthenticated()` delegates to `EnterpriseAuth.isAuthenticated()`
- **AND** `getAuthManager().getCurrentUser()` returns an `EnterpriseUser` (with `oid` as the identity key)

### Requirement: Token injection via 0600 tmpfile in buildClaudeEnv

`src/main/lib/claude/env.ts` SHALL export an `applyEnterpriseAuth()` function that:
1. Checks `enterpriseAuthEnabled` flag — returns unchanged env if disabled
2. Acquires a valid token via `acquireTokenSilent()` with minimum 10-minute lifetime
3. Writes the token to a 0600-permission tmpfile named `1code-token-<uuid>.txt`
4. Returns `{ env: { ...env, ANTHROPIC_AUTH_TOKEN_FILE, ANTHROPIC_BASE_URL }, tokenFile }`

The existing `buildClaudeEnv()` function SHALL call `applyEnterpriseAuth()` at the END of its environment construction pipeline, after the `STRIPPED_ENV_KEYS` pass. Its return type SHALL gain an optional `tokenFile?: string` field.

The `ANTHROPIC_AUTH_TOKEN` env var SHALL NOT be set when `useTokenFile` is `true` (default).

#### Scenario: Enterprise auth off — env unchanged

- **WHEN** `applyEnterpriseAuth(env)` is called
- **AND** `enterpriseAuthEnabled` is `false`
- **THEN** the returned env is identical to the input env
- **AND** no `tokenFile` is returned

#### Scenario: Enterprise auth on — token written to 0600 file

- **WHEN** `applyEnterpriseAuth(env)` is called
- **AND** `enterpriseAuthEnabled` is `true`
- **THEN** a file is created at `os.tmpdir()/1code-token-<uuid>.txt`
- **AND** the file has permissions `0o600`
- **AND** the file contains the access token string
- **AND** `env.ANTHROPIC_AUTH_TOKEN_FILE` points to the file
- **AND** `env.ANTHROPIC_AUTH_TOKEN` is NOT set
- **AND** `env.ANTHROPIC_BASE_URL` is set to the LiteLLM proxy URL

#### Scenario: Token never appears in logs

- **WHEN** enterprise auth token injection occurs
- **THEN** the token value does NOT appear in any `console.log`, `console.warn`, or `console.error` output
- **AND** only the file path is logged (if any logging occurs)

### Requirement: Call-site cleanup for tokenFile

All 5 call sites of `buildClaudeEnv()` in `claude.ts` and `claude-code.ts` SHALL handle the new `tokenFile` field by unlinking the tmpfile after the spawned subprocess has had time to read it. A `cleanupTokenFile(tokenFile?: string)` helper in `claude/env.ts` SHALL be provided for this purpose.

#### Scenario: Token file is cleaned up after spawn

- **WHEN** a CLI subprocess is spawned with `ANTHROPIC_AUTH_TOKEN_FILE`
- **THEN** the caller invokes `cleanupTokenFile(result.tokenFile)` after spawn
- **AND** the tmpfile is deleted from disk

#### Scenario: Cleanup is safe when no tokenFile

- **WHEN** `cleanupTokenFile(undefined)` is called
- **THEN** no error is thrown and no filesystem operation occurs

### Requirement: Enterprise auth tRPC router

A new tRPC router at `src/main/lib/trpc/routers/enterprise-auth.ts` SHALL expose:
- `signIn` mutation — triggers `acquireTokenInteractive()`, returns `EnterpriseAuthResult`
- `signOut` mutation — triggers `EnterpriseAuth.signOut()`
- `getStatus` query — returns `{ isAuthenticated, user: EnterpriseUser | null }`
- `refreshToken` mutation — triggers `acquireTokenSilent()`, returns `EnterpriseAuthResult`

All procedures SHALL check `enterpriseAuthEnabled` and throw `TRPCError` with code `PRECONDITION_FAILED` if the flag is disabled.

The router SHALL be registered in `createAppRouter` (total count: 22).

#### Scenario: Sign in when enterprise auth is enabled

- **WHEN** the renderer calls `trpc.enterpriseAuth.signIn.mutate()`
- **AND** `enterpriseAuthEnabled` is `true`
- **THEN** `acquireTokenInteractive()` is called
- **AND** the browser opens to the Entra sign-in page
- **AND** on success, `EnterpriseAuthResult` is returned

#### Scenario: Sign in when enterprise auth is disabled

- **WHEN** the renderer calls `trpc.enterpriseAuth.signIn.mutate()`
- **AND** `enterpriseAuthEnabled` is `false`
- **THEN** a `TRPCError` with code `PRECONDITION_FAILED` is thrown

### Requirement: Isolation guard updated for wiring

The `enterprise-auth-module.test.ts` regression guard SHALL have its "auth-manager.ts does NOT import enterprise-auth" assertion REMOVED. All other assertions (module exports, CP1 config, types, package.json deps) SHALL be preserved.

A new `enterprise-auth-wiring.test.ts` regression guard SHALL verify:
1. `applyEnterpriseAuth` is exported from `claude/env.ts`
2. The function uses `ANTHROPIC_AUTH_TOKEN_FILE` (not `ANTHROPIC_AUTH_TOKEN` as default)
3. The 0600 permission pattern exists in the code
4. `auth-manager.ts` imports from `enterprise-auth`
5. `enterprise-auth` tRPC router is registered in `createAppRouter`

#### Scenario: Wiring guard passes on compliant codebase

- **WHEN** `bun test tests/regression/enterprise-auth-wiring.test.ts` runs
- **THEN** all assertions pass
