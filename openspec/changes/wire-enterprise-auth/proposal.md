## Why

Change #1 (`add-enterprise-auth-module`) installed MSAL Node and created `enterprise-auth.ts`, `enterprise-store.ts`, and `enterprise-types.ts` as isolated modules. They can acquire and cache Entra tokens, but nothing in the app calls them. This change wires them into the running application via the Strangler Fig adapter pattern (auth-strategy §5.3.1 Steps B-C): `auth-manager.ts` gains a feature-flagged branch that delegates to `EnterpriseAuth`, and `buildClaudeEnv()` gains an `applyEnterpriseAuth()` call that injects the Bearer token into spawned CLI subprocesses via a 0600 tmpfile.

## What Changes

- **Modify `src/main/auth-manager.ts`** — Strangler Fig adapter: when `enterpriseAuthEnabled` flag is `true`, constructor initializes `EnterpriseAuth` and all public methods delegate to it. When `false`, existing 21st.dev/apollosai.dev behavior is preserved unchanged. (auth-strategy §5.3.1 Step B)
- **Add `applyEnterpriseAuth()` to `src/main/lib/claude/env.ts`** — called at the end of `buildClaudeEnv()` when enterprise auth is enabled. Writes token to 0600 tmpfile, injects `ANTHROPIC_AUTH_TOKEN_FILE` + `ANTHROPIC_BASE_URL` into the spawn env. Caller cleanup helper included. (auth-strategy §5.4)
- **New `src/main/lib/trpc/routers/enterprise-auth.ts` tRPC router** — sign in/out/status procedures for renderer-initiated auth flows, reading from `EnterpriseAuth` instance via `getAuthManager()`
- **Remove isolation guard from `enterprise-auth-module.test.ts`** — the "auth-manager.ts must not import enterprise-auth" assertion is intentionally deleted since wiring is the whole point of this change
- **Add regression guard `tests/regression/enterprise-auth-wiring.test.ts`** — verifies `applyEnterpriseAuth` exists in `env.ts`, token is passed via file (not env var by default), `ANTHROPIC_AUTH_TOKEN` is NOT set when `useTokenFile=true`, and the 0600 permission pattern is present
- **Modify 5 `buildClaudeEnv()` call sites** in `claude.ts` and `claude-code.ts` to handle the new `tokenFile` cleanup field

## Capabilities

### New Capabilities
- `enterprise-auth-wiring`: Defines the Strangler Fig adapter contract, `applyEnterpriseAuth()` API, token file injection pattern, and call-site cleanup requirements

### Modified Capabilities
- `enterprise-auth`: Update isolation boundary — wiring is now permitted. Remove the regression guard assertion that blocked `auth-manager.ts` imports.

## Impact

- **Affected tRPC routers**: New `enterprise-auth` router (sign in/out/status). Existing `claude`, `claude-code` routers (call site changes for tokenFile cleanup)
- **Affected main-process modules**: `auth-manager.ts` (Strangler Fig adapter), `claude/env.ts` (applyEnterpriseAuth), `index.ts` (router registration)
- **Database**: No schema changes
- **Router count**: 21 → 22 (new enterprise-auth router)
- **No F1-F10 upstream dependency impact** — legacy path is preserved when flag is off
- **Sequence**: Phase 1 change **#2 of 4**. Depends on #1 (done). Change #3 (`add-litellm-settings-ui`) depends on this. Change #4 (`setup-cluster-dual-auth`) can parallel.
