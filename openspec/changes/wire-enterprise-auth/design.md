## Context

The enterprise auth modules (`enterprise-auth.ts`, `enterprise-store.ts`, `enterprise-types.ts`) exist but are isolated — nothing calls them. The `enterpriseAuthEnabled` feature flag exists in `FLAG_DEFAULTS` (default `false`). `auth-manager.ts` currently hard-codes the 21st.dev/apollosai.dev OAuth flow (exchange code, refresh, sign out against the upstream backend).

The Envoy Gateway dual-auth pattern (empirically validated 2026-04-08) requires CLI subprocesses to pass a Bearer token via `ANTHROPIC_AUTH_TOKEN_FILE` (0600 tmpfile), NOT as an env var (auth-strategy §4.9 — local privilege escalation surface). The existing `buildClaudeEnv()` in `claude/env.ts` constructs the spawn environment and is called from 5 sites.

## Goals / Non-Goals

**Goals:**
- Wire `EnterpriseAuth` into `auth-manager.ts` via Strangler Fig (feature-flagged branch)
- Add `applyEnterpriseAuth()` to `claude/env.ts` for 0600 tmpfile token injection
- Add `enterprise-auth` tRPC router for renderer sign-in/out/status
- Modify the 5 `buildClaudeEnv()` call sites for tokenFile cleanup
- Remove the isolation guard assertion from the change #1 regression test
- Add a new regression guard for the wiring invariants

**Non-Goals:**
- Settings UI for LiteLLM proxy URL (change #3)
- Cluster SecurityPolicy/CiliumNetworkPolicy (change #4)
- `getCurrentUser()` OID migration (Step C from §5.3.1 — can be a separate cleanup)
- CAE claims challenge handler
- Deleting the legacy 21st.dev code path (Step D — requires 2+ weeks of flag-on production)

## Decisions

### Decision 1: Strangler Fig adapter pattern

**Chosen: Feature-flag branch in `auth-manager.ts` constructor**

When `getFlag("enterpriseAuthEnabled")` is `true`, the constructor creates an `EnterpriseAuth` instance (via `createEnterpriseAuth()`) and all public methods delegate to it. When `false`, the existing constructor body runs unchanged. This means the 20+ call sites to `getAuthManager()` throughout the app don't change — they get the same `AuthManager` interface regardless of which backend is active.

```typescript
// Simplified view of the adapter pattern:
constructor(isDev: boolean) {
  if (getFlag("enterpriseAuthEnabled")) {
    this.enterpriseAuth = await createEnterpriseAuth(getEnterpriseAuthConfig());
    // All methods delegate to this.enterpriseAuth
  } else {
    // Existing 21st.dev initialization
  }
}
```

### Decision 2: Token injection via 0600 tmpfile (not env var)

**Chosen: `ANTHROPIC_AUTH_TOKEN_FILE` as the default path**

Auth-strategy §4.9 explicitly forbids env-var injection (`ANTHROPIC_AUTH_TOKEN`) as default because co-resident processes can read `/proc/<pid>/environ` (Linux), `ps eww` (macOS). The token is written to a tmpfile with 0600 permissions and the path is passed via `ANTHROPIC_AUTH_TOKEN_FILE`. The caller must unlink the file after the subprocess confirms read.

A fallback to `ANTHROPIC_AUTH_TOKEN` env var exists for CLI binaries that don't support the file form, gated by `useTokenFile: false`.

### Decision 3: `applyEnterpriseAuth()` placement

**Chosen: Add to existing `src/main/lib/claude/env.ts`**

The strategy doc (§5.4) explicitly states: "modify the existing function in place, not introduce a new one." `applyEnterpriseAuth()` is called at the END of `buildClaudeEnv()` after the `STRIPPED_ENV_KEYS` pass, so the enterprise token survives the strip. The function's return type gains an optional `tokenFile?: string` field.

### Decision 4: tRPC router for renderer integration

**Chosen: New `src/main/lib/trpc/routers/enterprise-auth.ts`**

Procedures: `signIn` (triggers `acquireTokenInteractive`), `signOut`, `getStatus` (returns auth state + user info), `refreshToken` (triggers `acquireTokenSilent`). All procedures check `enterpriseAuthEnabled` flag and throw if disabled. Router count goes from 21 → 22.

### Decision 5: Isolation guard removal

**Chosen: Remove the "auth-manager must not import enterprise-auth" assertion**

The `enterprise-auth-module.test.ts` regression guard currently blocks wiring. This change intentionally removes that specific assertion (not the whole test file — other assertions about exports and CP1 config remain). The removed assertion is replaced by the new `enterprise-auth-wiring.test.ts` guard that validates the wiring is correct.

## Risks / Trade-offs

**[Risk: `buildClaudeEnv()` becomes async]** → Currently it's sync. Adding `applyEnterpriseAuth()` (which calls `acquireTokenSilent`) makes it async. The 5 call sites already run in async tRPC procedures, so the `await` propagation is straightforward.

**[Risk: Token file left behind on crash]** → If the Electron process crashes between writing the tmpfile and the subprocess reading it, the 0600 file persists in `os.tmpdir()`. Mitigated: files are named `1code-token-<uuid>.txt` — a periodic cleanup of stale files (older than 5 min) can be added as a future enhancement. The OS typically cleans `/tmp` on reboot.

**[Risk: ANTHROPIC_AUTH_TOKEN_FILE support in Claude CLI 2.1.96]** → The auth strategy notes this must be verified against the pinned version. If the pinned CLI doesn't support it, the fallback to `ANTHROPIC_AUTH_TOKEN` env var is used with a logged security warning.

**[Trade-off: Router count increases 21→22]** → Acceptable. The new router is thin (4 procedures) and follows the existing pattern. `trpc-router-auditor` will need its count updated.
