## Context

The enterprise auth modules exist but are isolated. This change wires them into the app. A 4-agent team review (2026-04-09) identified critical issues in the original design that are now addressed:

1. **`ANTHROPIC_AUTH_TOKEN_FILE` does not exist** in Claude CLI 2.1.96. The CLI supports `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (FD-based inheritance) instead.
2. **`buildClaudeEnv()` has 1 call site** (not 5 as the auth strategy claimed). `claude-code.ts` calls `getClaudeShellEnvironment()` directly.
3. **Auth strategy migration table has drifted** — actual methods are `getUser`/`logout` (not `getCurrentUser`/`dispose`).
4. **CP1 removed** from `enterprise-auth.ts` — LiteLLM is not CAE-enabled.

## Goals / Non-Goals

**Goals:**
- Wire `EnterpriseAuth` into `auth-manager.ts` via Strangler Fig with lazy async init
- Inject enterprise token into Claude spawn env via `ANTHROPIC_AUTH_TOKEN` env var (the only mechanism the pinned CLI supports)
- Add `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_AUTH_TOKEN_FILE` to `STRIPPED_ENV_KEYS_BASE` to prevent shell leaks
- Add `enterprise-auth` tRPC router for renderer sign-in/out
- Add regression guard for wiring invariants

**Non-Goals:**
- File descriptor (`CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR`) injection — documented as a future improvement when CLI pin is bumped, but not blocking for initial wiring
- Settings UI (change #3), cluster config (change #4)
- `getCurrentUser()` OID migration (can be a follow-up)
- Deleting legacy code (Step D — requires production soak)

## Decisions

### Decision 1: Token injection via `ANTHROPIC_AUTH_TOKEN` env var (revised)

**Chosen: Env var injection with mitigations**

The original design mandated `ANTHROPIC_AUTH_TOKEN_FILE` (0600 tmpfile), but Claude CLI 2.1.96 doesn't support it. The CLI supports:
- `ANTHROPIC_AUTH_TOKEN` (env var) — for Bearer header injection
- `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (FD number) — for secure FD-based token passing

We use `ANTHROPIC_AUTH_TOKEN` for the initial implementation with these mitigations:
1. Add `ANTHROPIC_AUTH_TOKEN` to `STRIPPED_ENV_KEYS_BASE` so shell-inherited values don't persist
2. Entra access tokens expire in 60-90 minutes by default, limiting the exposure window
3. Document `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` as the upgrade path when CLI pin is bumped
4. The token is acquired fresh via `acquireTokenSilent()` before each spawn — no long-lived cached value in env

**Future improvement:** When the Claude CLI pin is bumped, implement FD-based injection: open a pipe, write the token, pass the FD number via `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR`. This eliminates env-var exposure entirely.

### Decision 2: Lazy async initialization with `ensureReady()`

**Chosen: Sync constructor + lazy `ensureReady()` Promise**

`initAuthManager()` remains synchronous (preserving the 20+ call site contract). When `enterpriseAuthEnabled` is true, the constructor stores a `readyPromise` that resolves when `EnterpriseAuth.create()` completes. An `ensureReady(): Promise<void>` method is added. The app startup in `index.ts` awaits it after `app.whenReady()`:

```typescript
const authManager = initAuthManager(IS_DEV);
await authManager.ensureReady(); // No-op when enterprise flag is off
```

Before MSAL is ready, `isAuthenticated()` returns `false` and `getUser()` returns the dev bypass user (if enabled) or `null`. This is safe because the startup sequence awaits `ensureReady()` before checking auth state.

### Decision 3: Full adapter with stubs (Option 2, confirmed by all agents)

| `AuthManager` method | Enterprise behavior |
|---|---|
| `isAuthenticated()` | Delegates to `EnterpriseAuth.isAuthenticated()` (+ dev bypass) |
| `getUser()` | Returns `EnterpriseUser` adapted to `AuthUser` shape |
| `getAuth()` | Returns adapted `AuthData` from cached MSAL result |
| `getValidToken()` | Calls `acquireTokenSilent()`, returns access token |
| `refresh()` | Calls `acquireTokenSilent({ forceRefresh: true })` |
| `logout()` | Calls `EnterpriseAuth.signOut()` |
| `exchangeCode()` | Throws "Not available in enterprise mode" |
| `startAuthFlow()` | Calls `acquireTokenInteractive()` (opens Entra sign-in) |
| `updateUser()` | Throws "Not available in enterprise mode" (no upstream) |
| `fetchUserPlan()` | Returns `null` (no subscription in enterprise) |
| `setOnTokenRefresh()` | Stores callback, invoked after silent refresh |
| `scheduleRefresh()` | No-op — MSAL handles refresh on-demand via `acquireTokenSilent()` |

### Decision 4: Skip `AuthStore` in enterprise mode

When `enterpriseAuthEnabled` is true, the constructor does NOT create `new AuthStore()`. MSAL's `enterprise-store.ts` cache plugin handles persistence. This prevents orphaned `auth.dat` files.

### Decision 5: User shape adaptation at the boundary

`getUser()` in enterprise mode returns an adapted `AuthUser`:
```typescript
{
  id: enterpriseUser.oid,      // oid → id
  email: enterpriseUser.email,
  name: enterpriseUser.displayName,
  imageUrl: null,              // No avatar in Entra basic claims
  username: enterpriseUser.email,
}
```

The dev bypass user in enterprise mode uses synthetic `oid`/`tid` values.

### Decision 6: 1 call site, not 5

`buildClaudeEnv()` is called at exactly 1 location: `claude.ts:1142`. The `applyEnterpriseAuth()` integration modifies this single call site. Cleanup goes in the `finally` block at line 2778 and the unsubscribe callback at line 2784 (idempotent).

## Risks / Trade-offs

**[Risk: Env-var token exposure via `/proc/environ`]** → Mitigated by short-lived tokens (60-90 min), `STRIPPED_ENV_KEYS` cleanup, and documented upgrade path to FD-based injection.

**[Risk: MSAL not ready before auth check at startup]** → Mitigated by `ensureReady()` awaited in `index.ts` after `app.whenReady()`.

**[Risk: User shape mismatch breaks renderer components]** → Mitigated by adapting `EnterpriseUser` to `AuthUser` shape at the boundary. Full union type is a follow-up.

**[Trade-off: No FD-based injection in initial release]** → Acceptable. The env-var path is the only mechanism the pinned CLI supports. FD-based injection is documented as the upgrade path.
