## 1. Remove Isolation Guard

- [ ] 1.1 Remove the "auth-manager.ts does NOT import enterprise-auth" assertion from `tests/regression/enterprise-auth-module.test.ts` (keep all other assertions)
- [ ] 1.2 Run `bun test` to verify the modified guard still passes

## 2. Strangler Fig Adapter

- [ ] 2.1 Read `src/main/auth-manager.ts` fully to understand the current constructor, public methods, and the `getAuthManager()` singleton
- [ ] 2.2 Add `enterpriseAuthEnabled` feature flag branch in the `AuthManager` constructor — when `true`, create `EnterpriseAuth` instance
- [ ] 2.3 Delegate `isAuthenticated()`, `getToken()`, `refresh()`, `signOut()`, `getCurrentUser()`, `setOnTokenRefresh()`, `dispose()` to `EnterpriseAuth` when enterprise mode is active
- [ ] 2.4 Ensure `getAuthManager()` singleton accessor works identically for both paths
- [ ] 2.5 Run `bun run ts:check` — no new errors above baseline

## 3. Token Injection

- [ ] 3.1 Read `src/main/lib/claude/env.ts` fully to understand `buildClaudeEnv()` structure and the 5 call sites
- [ ] 3.2 Add `applyEnterpriseAuth(env, options?)` function to `claude/env.ts` per the spec — 0600 tmpfile pattern, `ANTHROPIC_AUTH_TOKEN_FILE` + `ANTHROPIC_BASE_URL` injection
- [ ] 3.3 Add `cleanupTokenFile(tokenFile?: string)` helper to `claude/env.ts`
- [ ] 3.4 Modify `buildClaudeEnv()` to call `applyEnterpriseAuth()` at the end, add `tokenFile` to return type
- [ ] 3.5 Update call site 1: `claude.ts` custom-config branch (~line 1168) — add `cleanupTokenFile()` after spawn
- [ ] 3.6 Update call site 2: `claude.ts` existing-CLI-config branch (~line 1448-1494) — add `cleanupTokenFile()` after spawn
- [ ] 3.7 Update call site 3: `claude.ts` final spawn (~line 1629-1634) — add `cleanupTokenFile()` after spawn
- [ ] 3.8 Update call site 4: `claude-code.ts` config detection (~line 119-127) — add `cleanupTokenFile()` after spawn
- [ ] 3.9 Update call site 5: `claude-code.ts` env merge (~line 125) — add `cleanupTokenFile()` after spawn
- [ ] 3.10 Run `bun run ts:check` — no new errors above baseline

## 4. Enterprise Auth tRPC Router

- [ ] 4.1 Create `src/main/lib/trpc/routers/enterprise-auth.ts` with `signIn`, `signOut`, `getStatus`, `refreshToken` procedures
- [ ] 4.2 All procedures check `enterpriseAuthEnabled` flag and throw `PRECONDITION_FAILED` if disabled
- [ ] 4.3 Register the router in `src/main/lib/trpc/routers/index.ts` (`createAppRouter`) — count goes 21 → 22
- [ ] 4.4 Run `bun run ts:check` — no new errors above baseline

## 5. Regression Guard

- [ ] 5.1 Create `tests/regression/enterprise-auth-wiring.test.ts` per the spec — `applyEnterpriseAuth` export, `ANTHROPIC_AUTH_TOKEN_FILE` pattern, 0600 permissions, auth-manager imports enterprise-auth, router registered
- [ ] 5.2 Run `bun test` — all guards pass (existing + new)

## 6. Quality Gates

- [ ] 6.1 Run `bun run ts:check` — no new errors above baseline (87)
- [ ] 6.2 Run `bun run build` — clean build
- [ ] 6.3 Run `bun test` — all regression guards pass
- [ ] 6.4 Run `bun audit` — no new advisories
- [ ] 6.5 Update CLAUDE.md: tRPC router count 21 → 22, add enterprise-auth router to diagram, increment regression guard count, add `applyEnterpriseAuth` to the auth security section
