# enterprise-auth-wiring Specification

## Purpose

Strangler Fig adapter wiring enterprise MSAL auth into auth-manager.ts, token injection via applyEnterpriseAuth(), and enterprise-auth tRPC router.

## Requirements

### Requirement: Strangler Fig adapter in auth-manager.ts

`src/main/auth-manager.ts` SHALL branch on the `enterpriseAuthEnabled` feature flag. When `true`, all public methods delegate to `EnterpriseAuth`. When `false`, existing behavior is preserved unchanged.

The constructor SHALL remain synchronous. MSAL initialization SHALL happen lazily via a stored `readyPromise`. An `ensureReady(): Promise<void>` method SHALL be added and awaited at app startup.

When `enterpriseAuthEnabled` is `true`, `AuthStore` SHALL NOT be instantiated (MSAL's `enterprise-store.ts` handles persistence).

#### Scenario: Enterprise auth disabled — legacy behavior preserved

- **WHEN** `getFlag("enterpriseAuthEnabled")` returns `false`
- **THEN** `auth-manager.ts` initializes with existing behavior
- **AND** `AuthStore` is created and used for credential persistence

#### Scenario: Enterprise auth enabled — delegates to EnterpriseAuth

- **WHEN** `getFlag("enterpriseAuthEnabled")` returns `true`
- **AND** `ensureReady()` has been awaited
- **THEN** `isAuthenticated()`, `getUser()`, `getValidToken()`, `refresh()`, `logout()` delegate to `EnterpriseAuth`
- **AND** `startAuthFlow()` calls `acquireTokenInteractive()`
- **AND** `exchangeCode()` throws "Not available in enterprise mode"
- **AND** `updateUser()` throws "Not available in enterprise mode"
- **AND** `fetchUserPlan()` returns `null`

#### Scenario: User shape adaptation

- **WHEN** `getUser()` is called in enterprise mode
- **THEN** `EnterpriseUser` is adapted to `AuthUser` shape: `oid→id`, `displayName→name`, `email→email`, `null→imageUrl`

### Requirement: Token injection via ANTHROPIC_AUTH_TOKEN in buildClaudeEnv

`src/main/lib/claude/env.ts` SHALL export an `applyEnterpriseAuth()` function that injects `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` into the spawn environment when enterprise auth is enabled.

`ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_AUTH_TOKEN_FILE` SHALL be in `STRIPPED_ENV_KEYS_BASE` so that only `applyEnterpriseAuth()` can set them authoritatively (preventing shell-inherited leaks).

The function SHALL call `acquireTokenSilent()` to get a fresh token before each spawn.

**Note:** `ANTHROPIC_AUTH_TOKEN_FILE` is NOT supported by Claude CLI 2.1.96. The env-var path is the only available mechanism. `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (FD-based) is documented as the upgrade path for future CLI versions.

#### Scenario: Enterprise auth off — env unchanged

- **WHEN** `applyEnterpriseAuth(env)` is called with enterprise auth disabled
- **THEN** the returned env is identical to the input

#### Scenario: Enterprise auth on — token injected via env var

- **WHEN** `applyEnterpriseAuth(env)` is called with enterprise auth enabled
- **THEN** `env.ANTHROPIC_AUTH_TOKEN` contains the fresh access token
- **AND** `env.ANTHROPIC_BASE_URL` points to the LiteLLM proxy URL
- **AND** no tmpfile is created (env-var injection is the only CLI-supported path)

#### Scenario: Shell-inherited ANTHROPIC_AUTH_TOKEN is stripped

- **WHEN** the user's shell has `ANTHROPIC_AUTH_TOKEN` set
- **THEN** the strip pass removes it before `applyEnterpriseAuth()` sets the authoritative value

### Requirement: Enterprise auth tRPC router

A router at `src/main/lib/trpc/routers/enterprise-auth.ts` SHALL expose `signIn`, `signOut`, `getStatus`, `refreshToken` procedures. All check `enterpriseAuthEnabled` and throw `PRECONDITION_FAILED` if disabled. Router count: 22 (21 feature + 1 git).

#### Scenario: Sign in triggers acquireTokenInteractive

- **WHEN** `trpc.enterpriseAuth.signIn.mutate()` is called with flag enabled
- **THEN** `acquireTokenInteractive()` opens browser to Entra sign-in

### Requirement: Regression guard for wiring

`tests/regression/enterprise-auth-wiring.test.ts` SHALL verify:
1. `applyEnterpriseAuth` exported from `claude/env.ts`
2. `ANTHROPIC_AUTH_TOKEN` in `STRIPPED_ENV_KEYS`
3. `auth-manager.ts` imports from `enterprise-auth`
4. `enterprise-auth` router registered in `createAppRouter`
5. No `ANTHROPIC_AUTH_TOKEN_FILE` injection code (CLI doesn't support it)

#### Scenario: Guard passes on compliant codebase

- **WHEN** `bun test tests/regression/enterprise-auth-wiring.test.ts` runs
- **THEN** all assertions pass