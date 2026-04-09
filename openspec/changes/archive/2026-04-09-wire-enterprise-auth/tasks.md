## 1. Remove Isolation Guard

- [x] 1.1 Remove isolation assertion from `enterprise-auth-module.test.ts` (8 tests remain, 0 failures)
- [x] 1.2 Verified modified guard passes — 8 pass, 20 expect() calls

## 2. STRIPPED_ENV_KEYS Update

- [x] 2.1 Add `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_AUTH_TOKEN_FILE` to `STRIPPED_ENV_KEYS_BASE` in `src/main/lib/claude/env.ts` — prevents shell-inherited tokens from leaking into spawned processes
- [x] 2.2 Run `bun run ts:check` — no new errors above baseline

## 3. Strangler Fig Adapter

- [x] 3.1 Read `src/main/auth-manager.ts` — understand all 11 public/private methods and the singleton pattern
- [x] 3.2 Add `enterpriseAuthEnabled` feature flag branch in constructor — skip `AuthStore` creation when `true`, store `readyPromise` for lazy MSAL init
- [x] 3.3 Add `ensureReady(): Promise<void>` method that resolves when `EnterpriseAuth.create()` completes (no-op when flag is off)
- [x] 3.4 Delegate `isAuthenticated()` — check `EnterpriseAuth.isAuthenticated()` (preserve dev bypass)
- [x] 3.5 Delegate `getUser()` — adapt `EnterpriseUser` to `AuthUser` shape (`oid→id`, `displayName→name`, `null→imageUrl`)
- [x] 3.6 Delegate `getValidToken()` — call `acquireTokenSilent()`, return access token string
- [x] 3.7 Delegate `refresh()` — call `acquireTokenSilent({ forceRefresh: true })`
- [x] 3.8 Delegate `logout()` — call `EnterpriseAuth.signOut()`
- [x] 3.9 Stub `startAuthFlow()` — call `acquireTokenInteractive()` instead of opening apollosai.dev
- [x] 3.10 Stub `exchangeCode()` — throw "Not available in enterprise mode"
- [x] 3.11 Stub `updateUser()` — throw "Not available in enterprise mode"
- [x] 3.12 Stub `fetchUserPlan()` — return `null`
- [x] 3.13 Stub `scheduleRefresh()` — no-op in enterprise mode (MSAL handles refresh on-demand)
- [x] 3.14 Dev bypass: synthetic user should use `oid`/`tid` fields when enterprise flag is on
- [x] 3.15 Add `ensureReady()` call in `src/main/index.ts` after `app.whenReady()` and after `initAuthManager()`
- [x] 3.16 Run `bun run ts:check` — no new errors above baseline

## 4. Token Injection (Single Call Site)

- [x] 4.1 Add `applyEnterpriseAuth(env)` function to `src/main/lib/claude/env.ts` — calls `acquireTokenSilent()`, sets `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`
- [x] 4.2 Modify `buildClaudeEnv()` to call `applyEnterpriseAuth()` at the end of the pipeline (after STRIPPED_ENV_KEYS pass)
- [x] 4.3 Make `buildClaudeEnv()` async (return type changes to `Promise<Record<string, string>>`)
- [x] 4.4 Update the single call site at `claude.ts:1142` to `await buildClaudeEnv()`
- [x] 4.5 Run `bun run ts:check` — no new errors above baseline

## 5. Enterprise Auth tRPC Router

- [x] 5.1 Create `src/main/lib/trpc/routers/enterprise-auth.ts` with `signIn`, `signOut`, `getStatus`, `refreshToken` procedures
- [x] 5.2 All procedures check `enterpriseAuthEnabled` flag and throw `PRECONDITION_FAILED` if disabled
- [x] 5.3 Register router in `createAppRouter` (21 → 22 routers)
- [x] 5.4 Run `bun run ts:check` — no new errors above baseline

## 6. Regression Guard

- [x] 6.1 Create `tests/regression/enterprise-auth-wiring.test.ts` — `applyEnterpriseAuth` export, `STRIPPED_ENV_KEYS` includes `ANTHROPIC_AUTH_TOKEN`, auth-manager imports enterprise-auth, router registered, no `ANTHROPIC_AUTH_TOKEN_FILE` injection code
- [x] 6.2 Run `bun test` — all guards pass

## 7. Quality Gates

- [x] 7.1 Run `bun run ts:check` — no new errors above baseline (86)
- [x] 7.2 Run `bun run build` — clean build (42.85s)
- [x] 7.3 Run `bun test` — 53 pass, 0 fail, 13 files
- [x] 7.4 Run `bun audit` — 58 pre-existing, no new advisories
- [x] 7.5 Update CLAUDE.md: router count 21→22, enterprise-auth router in key files, guard count 12→13, enterprise Entra auth in features
