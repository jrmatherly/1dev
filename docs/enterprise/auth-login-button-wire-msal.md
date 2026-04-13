---
title: Wire the Login Button to Entra ID Sign-In — Findings & Recommendations
icon: key-round
---

# Wire the Login Button to Entra ID Sign-In — Findings & Recommendations

**Status:** Investigation complete — ready for `/opsx:explore` thinking-partner round, then `/opsx:propose`.
**Created:** 2026-04-13
**Symptom:** Running `bun run dev` **without** `MAIN_VITE_DEV_BYPASS_AUTH=true` renders the login screen with a **Sign in** button. The button is clickable, but when clicked it opens `https://apollosai.dev/auth/desktop?auto=true` — a dead SaaS URL (upstream was retired). The button itself exists and is not missing; it just invokes the wrong code path.
**Goal:** Activate the already-implemented MSAL (Entra ID) sign-in path so **Sign in** acquires an Entra token via MSAL Node instead of opening a dead web URL. No new Entra work, no new code modules — this is a flag flip + configuration + dead-branch removal.

---

## Scope of this change

**In scope:**
- Desktop app login button on `src/renderer/login.html` calling `desktopApi.startAuthFlow()` → `auth-manager.startAuthFlow()` → MSAL `acquireTokenInteractive()`
- Feature flag `enterpriseAuthEnabled` behavior in unpackaged dev vs packaged builds
- `.env.example` documentation of `MAIN_VITE_ENTRA_CLIENT_ID` / `MAIN_VITE_ENTRA_TENANT_ID`
- Removal of the dead `apollosai.dev/auth/desktop` fallthrough branch in `auth-manager.ts`
- Regression guard asserting the dead URL cannot be reintroduced

**Explicitly out of scope (separate tracks):**
- LiteLLM proxy auth — uses **master key** (`LITELLM_MASTER_KEY`), a shared bearer token. OSS free tier. No JWT, no Entra, no Envoy OIDC for LiteLLM. The `enable_jwt_auth` setting is Enterprise-gated and would raise `ValueError("JWT Auth is an enterprise only feature.")` at startup. See the `project_litellm_feature_boundary.md` memory.
- LiteLLM admin UI login — OSS password-based login (≤5 users), not routed through Envoy Gateway OIDC.
- Graph client app registration — `LLMOps - 1Code API Graph Client` is for the 1code-api backend's `client_credentials` flow, only active when `PROVISIONING_ENABLED=true` (deferred per `docs/operations/roadmap.md`).
- `1code-api` SecurityPolicy targetRefs on the HTTPRoute — tracked separately in `docs/operations/roadmap.md` P1.
- Settings UI for flag toggles — deferred as change #3 from `wire-enterprise-auth`, tracked for a P2 follow-up after this lands.
- Cluster-side changes in `/Users/jason/dev/ai-k8s/talos-ai-cluster/` — none required for this change; cluster manifests already reference `${MAIN_VITE_ENTRA_CLIENT_ID}` / `${MAIN_VITE_ENTRA_TENANT_ID}` via Flux substitution and the 1code-api is already deployed.

---

## 1. Executive summary

The sign-in flow is **one flag flip plus two env vars away from working.** All three pieces already exist:

1. **Entra app registrations exist and are correctly configured.** Verified against the portal manifests:
   - **`LLMOps - 1Code API`** — `appId: 52d25f5d-688a-46fe-8356-305cec17f375`
     - `accessTokenAcceptedVersion: 2` ✅
     - `allowPublicClient: true` ✅
     - `replyUrlsWithType`: `http://localhost` (InstalledClient — used by MSAL Node) **and** `https://onecode-api.aarons.com/oauth2/callback` (Web — reserved for Envoy OIDC on the 1code-api HTTPRoute)
     - `signInAudience: AzureADMyOrg` (single-tenant) ✅
     - 5 delegated Graph scopes: `openid`, `profile`, `email`, `offline_access`, `User.Read` ✅ — exactly matches `DEFAULT_SCOPES` at [`enterprise-auth.ts:40`](../../src/main/lib/enterprise-auth.ts)
     - Valid client secret ending 2028-04-09 (used by the Web platform only; the desktop app is a public client and does NOT use the secret)
   - **`LLMOps - 1Code API Graph Client`** — `appId: 0065f604-ec75-410c-96ea-a64fee12b0d1`
     - Confidential client, no redirect URIs, `GroupMember.Read.All` Application permission requested
     - Used by the 1code-api backend pod for `client_credentials` → Microsoft Graph (group lookup for LiteLLM provisioning)
     - Not exercised by the login button — remains dormant until `PROVISIONING_ENABLED=true`
2. **Cluster-side config is wired.** `cluster.yaml` in the Talos cluster repo holds the values; Flux substitutes them into `deploy/kubernetes/envoy-auth-policy/app/securitypolicy.yaml` and `deploy/kubernetes/1code-api/app/helmrelease.yaml`:
   - `entra_tenant_id: f505346f-75cf-458b-baeb-10708d41967d`
   - `onecode_api_entra_client_id: 52d25f5d-688a-46fe-8356-305cec17f375`
   - `onecode_api_hostname: onecode-api` (joined with cluster base domain → `onecode-api.aarons.com`)
   - `onecode_api_enabled: true`
3. **Desktop-side code is wired.** [`src/main/lib/enterprise-auth.ts`](../../src/main/lib/enterprise-auth.ts), [`src/main/lib/trpc/routers/enterprise-auth.ts`](../../src/main/lib/trpc/routers/enterprise-auth.ts), and the Strangler Fig adapter at [`src/main/auth-manager.ts:67-98`](../../src/main/auth-manager.ts) were delivered by the archived OpenSpec change `openspec/changes/archive/2026-04-09-wire-enterprise-auth/`. They call `acquireTokenInteractive()` correctly when the flag is on.

**What is missing** — exactly three things:

1. The `enterpriseAuthEnabled` flag is `false` by default ([`feature-flags.ts:64`](../../src/main/lib/feature-flags.ts)). Until flipped, `auth-manager.startAuthFlow()` falls through to the legacy `else` branch that opens `apollosai.dev/auth/desktop`.
2. `.env.example` does not document `MAIN_VITE_ENTRA_CLIENT_ID` or `MAIN_VITE_ENTRA_TENANT_ID` — devs cannot set them without reading code.
3. The dead-URL `else` branch at [`auth-manager.ts:368`](../../src/main/auth-manager.ts) still exists. Even after the flag flip, any future regression that toggles the flag back to `false` would reintroduce the symptom.

**Recommended resolution — "activate + harden" (§7 below).**

---

## 2. Evidence — exact call chain

### 2.1 The click → dead URL chain (current, broken)

```
src/renderer/login.html:127
    window.desktopApi.startAuthFlow();
        ↓
src/preload/index.ts:193
    startAuthFlow: () => ipcRenderer.invoke("auth:start-flow")
        ↓
src/main/windows/main.ts:403
    ipcMain.handle("auth:start-flow", ...) → getAuthManager().startAuthFlow(win)
        ↓
src/main/auth-manager.ts:353
    async startAuthFlow(mainWindow) {
      if (this.isEnterprise) {                    // ← flag check
        enterpriseAuth.acquireTokenInteractive()  // ← MSAL path (already working, dormant)
        return;
      }
      // FALLS THROUGH to DEAD SaaS URL when flag is false:
      safeOpenExternal(`${getApiUrl()}/auth/desktop?auto=true`);
    }
```

### 2.2 Flag state

```
src/main/lib/feature-flags.ts:64
    enterpriseAuthEnabled: false,   ← ships as default-off
```

No DB override row exists on a fresh install → `this.isEnterprise = false` → the `if` branch is skipped → the `else` opens the dead URL.

### 2.3 The MSAL path — already wired, ready to activate

- [`src/main/lib/enterprise-auth.ts:40`](../../src/main/lib/enterprise-auth.ts) — `DEFAULT_SCOPES = ["openid", "profile", "email", "offline_access"]`
- [`src/main/lib/enterprise-auth.ts:116`](../../src/main/lib/enterprise-auth.ts) — `acquireTokenInteractive()` uses `safeOpenExternal` to open the browser to Entra's login page
- [`src/main/lib/enterprise-auth.ts:240-259`](../../src/main/lib/enterprise-auth.ts) — `getEnterpriseAuthConfig()` reads `import.meta.env.MAIN_VITE_ENTRA_CLIENT_ID` + `import.meta.env.MAIN_VITE_ENTRA_TENANT_ID`, throws descriptively if either is missing
- [`src/main/lib/enterprise-store.ts`](../../src/main/lib/enterprise-store.ts) — MSAL cache plugin delegating to `credential-store.ts` (3-tier, `.claude/rules/credential-storage.md` compliant)
- [`src/main/lib/trpc/routers/enterprise-auth.ts`](../../src/main/lib/trpc/routers/enterprise-auth.ts) — `signIn` / `signOut` / `getStatus` / `refreshToken` procedures, all assert the flag is on

### 2.4 Dev-bypass escape hatch (current workaround)

```typescript
// src/main/auth-manager.ts:18-22
function isDevAuthBypassed(): boolean {
  return !app.isPackaged && import.meta.env.MAIN_VITE_DEV_BYPASS_AUTH === "true";
}
```

This is the current documented workaround. It short-circuits `isAuthenticated()` to return `true` and returns a synthetic `DEV_BYPASS_USER` — useful for running the app without any auth backend, but it does not exercise the real MSAL path.

---

## 3. Cross-reference map

| Source | What it says | Relevance |
|---|---|---|
| `docs/enterprise/fork-posture.md` (restoration theme, locked 2026-04-08) | Upstream SaaS features are **reverse-engineered and self-hosted**, not dropped | The dead `apollosai.dev/auth/desktop` URL must go — not be preserved as legacy |
| `docs/enterprise/auth-strategy.md` v2.1 | Envoy Gateway dual-auth (OIDC + JWT) + MSAL-in-Electron. Empirically validated 2026-04-08 | The chosen architecture; Phase 1 wiring done. **Note**: the §3 `oidc` block in the strategy doc targets `${LITELLM_HOSTNAME}` for the LiteLLM admin flow — that is a design aspiration, NOT the current deployment. LiteLLM admin UI still uses its own password login per OSS constraints. |
| `docs/enterprise/entra-app-registration-1code-api.md` | Operational runbook for the Entra app registrations | **Both registrations it describes are provisioned** (confirmed against the Entra portal; runbook lists the expected manifest fields per registration) |
| `docs/enterprise/auth-fallback.md` v5 | MSAL-in-Electron-only alternative strategy | Fallback, not deployed. Same MSAL flow pattern as what's already wired |
| `docs/enterprise/phase-0-gates.md` | Phase 0 is **15/15 complete** | This change sits in Phase 1 territory |
| `openspec/changes/archive/2026-04-09-wire-enterprise-auth/` | Delivered Strangler Fig + MSAL module + `applyEnterpriseAuth()` | Already landed; deferred Settings UI (#3) and cluster config (#4) |
| `openspec/changes/archive/2026-04-09-remove-upstream-sandbox-oauth/` | Closed the sandbox-based OAuth redirect path | Separate earlier cleanup; did not touch the login-screen button |
| `docs/operations/roadmap.md` P1 "Extend Envoy SecurityPolicy to cover `1code-api` HTTPRoute" | Cluster-side JWT validation for 1code-api traffic | Affects what happens **after** sign-in succeeds, not the sign-in click itself |
| auto-memory `project_litellm_feature_boundary.md` | Cluster runs LiteLLM OSS only; JWT auth is Enterprise-gated | **Locks LiteLLM out of scope for this change** |
| auto-memory `project_cluster_facts.md` | `entra_tenant_id` lives in `cluster.yaml`; look it up there | Authoritative source for the tenant ID placed in `.env` |
| `CLAUDE.md:33` | "Phase 1 enterprise auth wiring is complete ... Settings UI (change #3) and cluster config (change #4) are deferred" | Matches the gap this change plugs |

---

## 4. Corrections applied from the earlier draft

This doc was previously titled `auth-login-button-restoration.md` with an "Option B: Create Entra public-client app registration" recommendation. Corrections after reviewing the Entra portal manifests for both app registrations (per the runbook in `docs/enterprise/entra-app-registration-1code-api.md`) and `cluster.yaml` in the cluster repo:

| Previous claim | Corrected claim |
|---|---|
| "No Entra app registration for the desktop client exists yet" | **Both app registrations exist.** App reg #1 serves the desktop client via its `InstalledClient http://localhost` platform config. |
| "Must be a public client (native / no confidential secret)" | App reg #1 already has `allowPublicClient: true` and `http://localhost` InstalledClient redirect. No new registration needed. |
| "Create Entra app registration for desktop client" | No Entra portal work required for this change. |
| "Option B cost: ~0.5 day dev + 1-2 hour Entra provisioning" | **~2-3 hours dev, zero external Entra work.** |
| Title "Login Button Restoration" | Retitled "Wire the Login Button to Entra ID Sign-In" — the button is not missing; it exists and renders correctly but calls the wrong path. |
| "LiteLLM admin UI uses Envoy OIDC" (implicit in strategy doc wording) | LiteLLM admin uses its **own master-key + password login** (OSS free tier ≤5 users). **JWT auth in LiteLLM is Enterprise-gated** and not deployed. Envoy OIDC on LiteLLM is aspirational design, not current deployment. |

---

## 5. What's missing, ordered by blast radius

### 5.1 Flag default (primary cause, in-repo)

`enterpriseAuthEnabled: false` at `feature-flags.ts:64`. Three ways to fix:

- **(a) Flip default to `true` for unpackaged builds** — conditional default in `FLAG_DEFAULTS` or in the `getFlag` resolver.
- **(b) Add env-var override** — e.g., `MAIN_VITE_ENTERPRISE_AUTH_ENABLED=true` in `.env` consulted by `getFlag` before falling back to the DB/default. Symmetrical with `MAIN_VITE_DEV_BYPASS_AUTH`.
- **(c) Leave default `false`, require manual `setFlag` via DB/CLI** — most explicit, least ergonomic.

Preferred: **(b)** — explicit, reversible, consistent with existing `MAIN_VITE_DEV_BYPASS_AUTH` pattern, does not change the "production default is off" invariant.

### 5.2 `.env.example` documentation (secondary cause)

`.env.example` currently documents `MAIN_VITE_DEV_BYPASS_AUTH=true` but not the Entra env vars. Need a documented block:

```bash
# -- Enterprise Entra ID auth (activates MSAL sign-in in the desktop app)
# Required to use "Sign in" on the login screen without MAIN_VITE_DEV_BYPASS_AUTH.
# Values come from cluster.yaml in the Talos cluster repo.
# MAIN_VITE_ENTRA_CLIENT_ID=52d25f5d-688a-46fe-8356-305cec17f375
# MAIN_VITE_ENTRA_TENANT_ID=f505346f-75cf-458b-baeb-10708d41967d
# MAIN_VITE_ENTERPRISE_AUTH_ENABLED=true    # if §5.1(b) is chosen
```

### 5.3 Dead-URL fallthrough (hardening)

`auth-manager.ts:368` unconditionally constructs `${apiUrl}/auth/desktop?auto=true`. Delete the `else` branch and replace with a thrown error that surfaces via the renderer's `auth:error` IPC channel (or shown as a toast on the login page). Rationale — restoration theme: the legacy SaaS URL is terminal; there is no scenario where opening it succeeds. Fail fast rather than silently.

### 5.4 Regression guard (should-have)

`tests/regression/login-flow-uses-msal.test.ts` asserting:

- No literal `"/auth/desktop"` or `"apollosai.dev/auth/desktop"` string remains in `src/main/auth-manager.ts` or anywhere in `src/main/`.
- `startAuthFlow` calls `acquireTokenInteractive` when the flag is on.
- The IPC `auth:start-flow` handler validates the sender.

### 5.5 Documentation sync

- `CLAUDE.md:33` mentions "Settings UI (change #3) and cluster config (change #4) are deferred." The change #3 deferral is still accurate (no Settings UI in this change); the #4 cluster config is already deployed (`1code-api` is live). Update the line to reflect the current state.
- `docs/architecture/codebase-layout.md` line 56 describes the Strangler Fig adapter; no update needed.

---

## 6. Architecture (post-change)

```
┌───────────────────────────────┐
│ src/renderer/login.html       │
│ [Sign in] button              │
└─────────────┬─────────────────┘
              │ desktopApi.startAuthFlow()
              ▼
┌───────────────────────────────┐
│ src/main/windows/main.ts      │
│ ipcMain "auth:start-flow"     │
│ validateSender + delegate     │
└─────────────┬─────────────────┘
              ▼
┌───────────────────────────────┐
│ src/main/auth-manager.ts      │
│ startAuthFlow()               │
│ enterpriseAuthEnabled?        │
└─────────────┬─────────────────┘
              │ YES (flag on)         │ NO (flag off, not in dev bypass)
              ▼                       ▼
┌─────────────────────────┐  ┌──────────────────────────┐
│ enterprise-auth.ts      │  │ Throw "enterprise auth   │
│ acquireTokenInteractive │  │ not configured — set     │
│ via MSAL Node           │  │ MAIN_VITE_ENTRA_CLIENT_ID + flag"  │
└─────────────┬───────────┘  └──────────────────────────┘
              │                       │
              ▼                       ▼
login.microsoftonline.com       auth:error IPC event
└── localhost loopback          ▼
              ▼             toast shown in login.html
              ▼
┌───────────────────────────────┐
│ enterprise-store.ts           │
│ MSAL cache → SQLite via       │
│ credential-store.ts (3-tier)  │
└─────────────┬─────────────────┘
              ▼
     app unlocks; user signed in
```

No new modules, no renaming. This is activation + cleanup of already-shipped code.

---

## 7. Recommended resolution

**"Activate + harden"** — five atomic tasks:

1. **Env-var override for `enterpriseAuthEnabled`** (§5.1 option b). Consulted by `getFlag()` before DB/default; reads `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED === "true"`. Keep DB-level override still functional. Keep the `false` DB default for packaged builds.
2. **Document `MAIN_VITE_ENTRA_CLIENT_ID`, `MAIN_VITE_ENTRA_TENANT_ID`, `MAIN_VITE_ENTERPRISE_AUTH_ENABLED` in `.env.example`** with the concrete values and a link to this doc.
3. **Remove the dead SaaS URL fallthrough in `auth-manager.startAuthFlow()`.** Replace with a thrown error. Consumer (`auth:start-flow` IPC handler at `windows/main.ts:403`) catches and emits `auth:error` — `login.html` can listen and render the error (optional UX polish).
4. **Add regression guard `tests/regression/login-flow-uses-msal.test.ts`** per §5.4.
5. **Update `CLAUDE.md:33`** to reflect the current state (cluster config now deployed; Settings UI deferral stands).

Optional sixth task (polish, suggest for `/opsx:explore`):
6. Render an error banner in `login.html` when `auth:error` fires — currently the page has no error UI.

**Effort:** ~2-3 hours end-to-end. No external (Entra portal, cluster, SOPS) work.

---

## 8. Security considerations

- **No token in env vars for subprocess spawn** — this change does not touch `applyEnterpriseAuth()` in `src/main/lib/claude/env.ts`. The `.claude/rules/auth-env-vars.md` HARD RULE is not triggered. The `ENTRA_*` env vars documented here are **configuration** (app registration GUIDs), not bearer tokens.
- **Public client PKCE** — MSAL Node handles this automatically. No `ENTRA_CLIENT_SECRET` is ever set in the desktop app.
- **`safeOpenExternal`** — already used by `enterprise-auth.ts:132`, scheme-validated via `src/main/lib/safe-external.ts`.
- **`validateSender`** — `auth:start-flow` IPC handler at `windows/main.ts:403` already calls it. No new IPC surface introduced.
- **Credential storage** — MSAL cache writes via `enterprise-store.ts` → `credential-store.ts` (3-tier). `.claude/rules/credential-storage.md` compliant; no new `safeStorage.*` calls.
- **Flag override precedence** — env-var override must be read carefully. If `MAIN_VITE_ENTERPRISE_AUTH_ENABLED=true` but `MAIN_VITE_ENTRA_CLIENT_ID` is unset, `getEnterpriseAuthConfig()` throws. That error surfaces at sign-in time (correct behavior) rather than at app startup (which would block dev-bypass users). Explore question: should we fail at startup instead to surface misconfiguration sooner?

---

## 9. What `/opsx:explore` should probe

1. **Env-override mechanism** — which name? Options:
   - `MAIN_VITE_ENTERPRISE_AUTH_ENABLED` (matches the `auth-strategy.md` internal name)
   - `MAIN_VITE_ENTERPRISE_AUTH_ENABLED` (Vite convention — auto-exposed via `import.meta.env`)
   - Reused `enterpriseAuthEnabled` via a generic `FEATURE_FLAG_*` pattern (most extensible; touches more files)

2. **When should `getEnterpriseAuthConfig()` throw?** At construction time (app startup) or at sign-in click time (current behavior)? Trade-off: startup-fail is a clearer signal but blocks dev-bypass users who don't care about enterprise auth.

3. **Dead-URL removal granularity** — delete only the `else` branch in `startAuthFlow`, or also delete the stale `exchangeCode()`, `refresh()` (legacy path), `updateUser()`, `fetchUserPlan()` methods that still POST to `${apiUrl}/api/...`? All four are unreachable when the flag is on; removing them aligns with the restoration theme but broadens the diff.

4. **Error UX in `login.html`** — plain HTML file (no React). Options: (a) plain JS + toast, (b) load a React micro-bundle, (c) use only the main-process `dialog.showErrorBox`, (d) leave the button click as a silent throw (console-only). Lowest-effort: (a).

5. **Regression-guard scope** — should the guard also assert that `MAIN_VITE_ENTERPRISE_AUTH_ENABLED` being an env-override does not leak into packaged builds? (`!app.isPackaged` is already a gate for dev-bypass; should the enterprise env override be similarly gated? Arguably yes — env vars should only matter at dev time; packaged builds should use DB override.)

---

## 10. Files the `/opsx:propose` change will touch

**Modified:**
- `src/main/lib/feature-flags.ts` — add env-var override in `getFlag()` resolver
- `src/main/auth-manager.ts` — delete `else` fallthrough in `startAuthFlow()`; optional Phase-2 cleanup of `exchangeCode`/`refresh`/`updateUser`/`fetchUserPlan` per §9 question 3
- `src/main/windows/main.ts` — error propagation via `auth:error` event (if §9 question 4 option a chosen)
- `src/renderer/login.html` — error-banner UX (if §9 question 4 option a chosen)
- `.env.example` — document `MAIN_VITE_ENTRA_CLIENT_ID`, `MAIN_VITE_ENTRA_TENANT_ID`, `MAIN_VITE_ENTERPRISE_AUTH_ENABLED`
- `CLAUDE.md:33` — update status wording
- `docs/conventions/regression-guards.md` — register new guard

**New:**
- `tests/regression/login-flow-uses-msal.test.ts`

**Unchanged but verified:**
- `src/main/lib/enterprise-auth.ts` — already correct
- `src/main/lib/enterprise-store.ts` — already correct
- `src/main/lib/trpc/routers/enterprise-auth.ts` — already correct
- `deploy/kubernetes/**` — already correct (cluster deployed with real values)

**Capability spec:**
- Extend `openspec/specs/enterprise-auth-wiring/spec.md` with a MODIFIED Requirement covering the dead-URL removal and env-override behavior. No new capability spec.

---

## 11. What `/opsx:propose` should scope

**Minimum viable scope:**

- Capability delta: `enterprise-auth-wiring` (MODIFIED)
- Tasks: 5-6 atomic items (see §10)
- Prereqs: none external (Entra provisioned, cluster deployed, desktop code wired)
- Regression guard: 1 new test file
- Docs touched: 3 (`.env.example`, `CLAUDE.md`, `docs/conventions/regression-guards.md`)
- TS baseline impact: expected 0 (no new types introduced)
- Estimated effort: ~2-3 hours implementation + ~1 hour review

**Out of scope (tracked separately):**

- Settings UI (original change #3 from `wire-enterprise-auth`) — P2 follow-up
- `1code-api` SecurityPolicy targetRefs — P1 roadmap entry
- F2/F3 upstream restoration (automations, remote chats) — P1 roadmap entries
- LiteLLM admin UI auth — OSS password login; no change needed
- Graph `client_credentials` path (App reg #2) — only activates under `PROVISIONING_ENABLED=true`
