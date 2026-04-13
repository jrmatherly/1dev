---
title: Login Button Restoration — Findings & Recommendations
icon: key-round
---

# Login Button Restoration — Findings & Recommendations

**Status:** Investigation complete — ready for `/opsx:explore` thinking-partner round, then `/opsx:propose`
**Created:** 2026-04-13
**Symptom:** Running `bun run dev` **without** `MAIN_VITE_DEV_BYPASS_AUTH=true` shows the login screen, but clicking **Sign in** opens a browser to `https://apollosai.dev/auth/desktop?auto=true` — a page that does not exist. The upstream SaaS (`apollosai.dev` / formerly `1code.dev`) is dead, and no self-hosted replacement is yet wired to the button.
**Scope:** This document covers the Electron **login-screen "Sign in" button** only (the pre-app-open auth gate). It does **not** address downstream CLI spawn-env auth (`applyEnterpriseAuth()` in `claude/env.ts`), which is already wired and tested.

---

## 1. Executive summary

The fork is **one flag flip away** from a working login button, modulo three missing pieces:

1. **Entra app registration for the desktop client** — the MSAL code path reads `process.env.ENTRA_CLIENT_ID` and `process.env.ENTRA_TENANT_ID` at runtime ([`src/main/lib/enterprise-auth.ts:240-259`](../../src/main/lib/enterprise-auth.ts)). Both are mandatory; missing either throws at sign-in time. No Entra app registration for `1code` (desktop/native public client) has been created yet.
2. **Renderer-side UX for the "no flag, no bypass" case** — [`src/renderer/login.html`](../../src/renderer/login.html) currently calls `window.desktopApi.startAuthFlow()` unconditionally, and the main process falls through to the dead upstream URL when `enterpriseAuthEnabled = false`. Either the button should be disabled in that state with a clear message, or the flag should default to on for non-packaged builds.
3. **`getCurrentUser()` shape gap already surfaced** — `AuthUser.id` is documented in `docs/enterprise/auth-strategy.md §5.3.1` Step C as needing migration (`oid` vs `id`) but the `adaptEnterpriseUser()` shim at [`auth-manager.ts:45-55`](../../src/main/auth-manager.ts) already solved it. Informational only — no new work here.

**Verdict:** This is **not** a missing-feature problem; Phase 1 wiring is already done. It is a **rollout gap** — the Strangler Fig flag defaults to `false`, no Entra app registration yet exists, and the login screen has no UX for the "flag is off, and neither dev-bypass nor legacy SaaS are viable" state that every developer hits today.

**Recommended restoration path:** see §7 below. Short version: **Option B** — make `enterpriseAuthEnabled` the default for unpackaged dev builds **after** an Entra public-client app registration is added to the existing tenant (`f505346f-…`, per `project_cluster_facts.md`), and **gate the legacy SaaS branch behind a "force-legacy" escape hatch** that we will delete in Phase 2 per the restoration theme.

---

## 2. Evidence — exact call chain

### 2.1 The dead URL

```
src/main/auth-manager.ts:368
    let authUrl = `${this.getApiUrl()}/auth/desktop?auto=true`;
```

`getApiUrl()` resolves to `import.meta.env.MAIN_VITE_API_URL || "https://apollosai.dev"` ([`auth-manager.ts:9-14`](../../src/main/auth-manager.ts)). In unpackaged dev this can be overridden by `.env`, but the default resolves to the dead upstream host.

### 2.2 The click → dead-URL chain

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
        enterpriseAuth.acquireTokenInteractive() // ← MSAL path (working)
        return;
      }
      // Falls through to DEAD SaaS URL when flag is false:
      safeOpenExternal(`${getApiUrl()}/auth/desktop?auto=true`);
    }
```

### 2.3 Flag state

```
src/main/lib/feature-flags.ts:64
    enterpriseAuthEnabled: false,   ← ships as default-off
```

No database override exists on a fresh install. Therefore `this.isEnterprise = false`, the `if` branch is skipped, and every click of **Sign in** opens the dead URL.

### 2.4 The MSAL side — already wired, just dormant

- [`src/main/lib/enterprise-auth.ts`](../../src/main/lib/enterprise-auth.ts) — `EnterpriseAuth.create()` + `acquireTokenInteractive()` + `acquireTokenSilent()` + MSAL cache plugin
- [`src/main/lib/enterprise-store.ts`](../../src/main/lib/enterprise-store.ts) — MSAL cache plugin (Drizzle + `safeStorage`, 3-tier)
- [`src/main/lib/trpc/routers/enterprise-auth.ts`](../../src/main/lib/trpc/routers/enterprise-auth.ts) — `signIn` / `signOut` / `getStatus` / `refreshToken` procedures (all assert the flag is on)
- [`src/main/auth-manager.ts:86-98`](../../src/main/auth-manager.ts) — `initEnterprise()` calls `EnterpriseAuth.create(getEnterpriseAuthConfig())` when the flag is on

### 2.5 Dev-bypass escape hatch

[`auth-manager.ts:18-22`](../../src/main/auth-manager.ts):
```typescript
function isDevAuthBypassed(): boolean {
  return !app.isPackaged && import.meta.env.MAIN_VITE_DEV_BYPASS_AUTH === "true";
}
```

This is what the user sets today (`MAIN_VITE_DEV_BYPASS_AUTH=true`). It skips auth entirely and returns a synthetic `DEV_BYPASS_USER`. Never runs in packaged builds. This is not a fix — it's the documented workaround until real auth is wired.

---

## 3. Cross-reference map

| Source | What it says |
|---|---|
| `docs/enterprise/fork-posture.md` (restoration theme, locked 2026-04-08) | Upstream SaaS features are **reverse-engineered and self-hosted**, not dropped. Login button falls into this. |
| `docs/enterprise/upstream-features.md` | **F1 "Cloud Sandbox Background Agents"** — the upstream OAuth flow originally used a CodeSandbox-hosted redirect (`src/main/lib/trpc/routers/claude-code.ts:178-220`). That was resolved (Phase 0 gate #8, archived via `openspec/changes/archive/2026-04-09-remove-upstream-sandbox-oauth/`). **The current login-button issue is a separate, still-open dependency on the `apollosai.dev/auth/desktop` web flow** — not in the F1-F10 catalog yet. See §9 below. |
| `docs/enterprise/auth-strategy.md v2.1` | **Chosen architecture** — Envoy Gateway dual-auth (OIDC + JWT) + MSAL-in-Electron for token acquisition. Empirically validated 2026-04-08. §5.3.1 Step B describes the Strangler Fig adapter that is now implemented. |
| `docs/enterprise/auth-fallback.md v5` | Companion MSAL-in-Electron alternative strategy. Not the chosen one, but documents the same `acquireTokenInteractive` pattern we use. |
| `docs/enterprise/phase-0-gates.md` | Phase 0 is **15/15 complete**. The login-button fix sits in Phase 1 territory (UI + cluster config). |
| `openspec/changes/archive/2026-04-09-wire-enterprise-auth/proposal.md` | The change that delivered the `auth-manager.ts` Strangler Fig adapter + the enterprise-auth tRPC router. Explicitly **deferred** Settings UI (change #3) and cluster config (change #4). |
| `openspec/changes/archive/2026-04-09-remove-upstream-sandbox-oauth/` | Closed the sandbox-based OAuth redirect path. Did **not** touch the login-screen → `auth-manager.startAuthFlow()` path. |
| `CLAUDE.md:33` | *"Phase 1 enterprise auth wiring is complete ... Settings UI (change #3) and cluster config (change #4) are deferred to future OpenSpec proposals."* Exactly the gap we are plugging. |
| `docs/operations/roadmap.md` P1 entry | **"Extend Envoy SecurityPolicy to cover `1code-api` HTTPRoute"** — cluster-side JWT validation. Related but not a blocker for renderer sign-in (MSAL only hits Entra ID, not the cluster). |
| `.claude/rules/auth-env-vars.md` | HARD RULE — CLI subprocess token injection only goes through `applyEnterpriseAuth()`. **Not affected** by this work; the login button sets up an MSAL session but does not touch subprocess env. |

---

## 4. What's missing, ordered by blast radius

### 4.1 Entra app registration (blocker, external)

[`src/main/lib/enterprise-auth.ts:240-259`](../../src/main/lib/enterprise-auth.ts) requires both `ENTRA_CLIENT_ID` and `ENTRA_TENANT_ID` at runtime. No app registration yet exists for the `1code` desktop client.

Must be a **public client** (native / no confidential secret) with:
- Redirect URI `http://localhost` (MSAL Node's loopback flow — `acquireTokenInteractive` picks a free port)
- Delegated scopes `openid`, `profile`, `email`, `offline_access` (already hardcoded in `DEFAULT_SCOPES` at `enterprise-auth.ts:40`)
- Tenant: the existing `f505346f-...` tenant (per `project_cluster_facts.md`)

An existing `docs/enterprise/entra-app-registration-1code-api.md` covers the `1code-api` **backend** app registration; that one is for the cluster-side JWT audience and is **not** the same app as the desktop client.

### 4.2 Flag-off UX gap (blocker, in-repo)

When `enterpriseAuthEnabled=false` and `MAIN_VITE_DEV_BYPASS_AUTH` is not set, `startAuthFlow()` silently opens the dead URL and the user is stuck. There are three viable fixes:

- **(a) Default the flag to `true` for unpackaged builds** — cleanest; the restoration theme says the SaaS path is terminal, so the default should reflect that.
- **(b) Add explicit error UI** — when the button is clicked in legacy mode, show a disabled state + message ("Enterprise auth not yet configured — see `.env.example`") instead of silently opening the dead URL.
- **(c) Remove the legacy branch entirely** — delete the `else` fallthrough in `startAuthFlow()` that constructs the upstream URL, and fail fast. Aligned with the restoration theme but may need a graceful "set up Entra" wizard first.

### 4.3 `.env.example` documentation (minor)

[`.env.example`](../../.env.example) currently documents `MAIN_VITE_DEV_BYPASS_AUTH=true` as the workaround but does **not** document `ENTRA_CLIENT_ID` / `ENTRA_TENANT_ID`. Once §4.1 is resolved these need an `.env.example` block.

### 4.4 Regression guard (minor, should-have)

No test currently asserts that **clicking Sign in with the flag on invokes MSAL**, nor that **the dead URL fallback is gone** (once removed in §4.2.c). The `tests/regression/` catalog has `enterprise-auth-wiring.test.ts` which covers spawn-env injection, not the sign-in UI path.

### 4.5 Not blockers for this login button — tracked separately

- **Cluster-side SecurityPolicy for `1code-api`** — P1 roadmap item, required before tRPC calls go to `1code-api` behind Envoy. The **login button itself** only hits Entra ID directly; it does not traverse Envoy.
- **`1code-api` self-hosted backend** — `services/1code-api/` already scaffolded. Needed for F2/F3 restoration but not for the sign-in click.
- **Settings UI to toggle the flag at runtime** — deferred as change #3 from `wire-enterprise-auth`. A `setFlag()` CLI or manual DB edit suffices for the first rollout.

---

## 5. Architecture of the minimally-working login flow (post-fix)

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
└─────────────┬─────────────────┘
              │
              ▼
┌───────────────────────────────┐
│ src/main/auth-manager.ts      │
│ startAuthFlow()               │
│ isEnterprise?                 │
└─────────────┬─────────────────┘
              │ YES (flag on)
              ▼
┌───────────────────────────────┐
│ src/main/lib/enterprise-auth  │
│ acquireTokenInteractive()     │──► opens http://login.microsoftonline.com
│   via MSAL Node               │        └── localhost loopback callback
└─────────────┬─────────────────┘
              │ AccountInfo + access_token
              ▼
┌───────────────────────────────┐
│ enterprise-store.ts           │
│ MSAL cache → SQLite via       │
│ credential-store.ts (3-tier)  │
└─────────────┬─────────────────┘
              │
              ▼
   app unlocks; user is signed in
```

Flow is already implemented. Only the **switch on** + **config** are missing.

---

## 6. Security considerations

- **No token in env vars** — the `.claude/rules/auth-env-vars.md` HARD RULE still applies for CLI subprocess spawn. The login-button flow is **orthogonal** to subprocess token injection; this is strictly about establishing an MSAL session in the Electron main process. No env-var tokens are created by this flow.
- **No secrets in the client** — MSAL public-client flow uses PKCE automatically. No `ENTRA_CLIENT_SECRET` is ever needed (or desired) in the desktop app.
- **`safeOpenExternal()`** is already used at [`enterprise-auth.ts:132`](../../src/main/lib/enterprise-auth.ts) for the browser hand-off, validating the scheme per `src/main/lib/safe-external.ts`.
- **Credential storage** — MSAL cache writes via `enterprise-store.ts` which delegates to `credential-store.ts`. Per `.claude/rules/credential-storage.md`, **all encryption goes through `credential-store.ts`**. Verified in the existing code path. No new `safeStorage.*` calls needed.
- **`validateSender()`** — the `auth:start-flow` IPC handler at `windows/main.ts:403` already calls `validateSender(event)`. No new IPC surface introduced by any of the restoration options below.
- **Token lifetime** — Entra access tokens are 60-minute default (CP1 intentionally NOT set per `enterprise-auth.ts:104-107`, deliberate design decision documented there). Silent refresh handled by MSAL on-demand.

---

## 7. Restoration options

### Option A — "Repair-minimal" (do just enough to make the button not open the dead URL)

1. Edit `auth-manager.ts:368` to detect the dead-URL case and throw with a descriptive error.
2. Update `src/renderer/login.html` to surface the error as a toast / banner.
3. Document `MAIN_VITE_DEV_BYPASS_AUTH=true` as the sanctioned dev workaround in README.
4. Keep flag default `false`; no Entra app registration required.

**Cost:** ~1 hour.
**Buys:** Stops the "opens dead URL" footgun.
**Doesn't buy:** A working login. Users still need `MAIN_VITE_DEV_BYPASS_AUTH=true` to actually use the app.
**Restoration-theme posture:** Weak — preserves the dead SaaS branch. Violates "self-host everything."

### Option B — "Flip the flag + wire Entra" (RECOMMENDED) ⭐

1. **Create Entra app registration** for the desktop client (`1code-desktop` or similar) in the existing tenant. Public client, loopback redirect, scopes match `DEFAULT_SCOPES`.
2. **Add `ENTRA_CLIENT_ID` / `ENTRA_TENANT_ID` to `.env.example`** with GUID placeholders and a one-liner link to the provisioning runbook.
3. **Default `enterpriseAuthEnabled` to `true` when `!app.isPackaged`** (or keep it `false` but ship a developer override via `.env` that the `feature-flags.ts` getter honors). Exact mechanism is part of the `/opsx:propose` design round.
4. **Delete the `else` branch in `startAuthFlow()`** that constructs the dead `apollosai.dev/auth/desktop` URL. Replace with a thrown error for the edge case "flag off but not bypassed" to satisfy the restoration theme.
5. **Keep `MAIN_VITE_DEV_BYPASS_AUTH` as the no-backend escape hatch** — documented use case is "run the app without talking to Entra yet."
6. **Add a regression guard** — `tests/regression/login-flow-uses-msal.test.ts`:
   - Asserts `auth-manager.ts` has **no** hardcoded `/auth/desktop` URL anywhere.
   - Asserts `startAuthFlow` calls `acquireTokenInteractive` when flag is on.
   - Asserts the IPC `auth:start-flow` handler is wired through `validateSender`.
7. **Update `docs/enterprise/phase-0-gates.md`** to note that the post-Phase-0 login-button rollout landed under a new OpenSpec proposal (this one).
8. **Document the Entra app registration procedure** in a new `docs/enterprise/entra-app-registration-1code-desktop.md` (or extend the existing `entra-app-registration-1code-api.md`).

**Cost:** ~0.5 day dev + ~1-2 hour Entra provisioning (external).
**Buys:** Working login button, flag-on default for devs, zero dead URLs.
**Restoration-theme posture:** Strong — deletes the SaaS branch, commits to Entra as the truth.
**Dependencies:** Entra app registration is external and must be done first (§4.1).

### Option C — "Full UX — Settings UI + first-run wizard"

Everything in Option B **plus**:
- A Settings tab (`enterprise-auth` settings pane) to view sign-in status, sign out, switch tenants, etc.
- A first-run wizard that fires when `ENTRA_CLIENT_ID` / `ENTRA_TENANT_ID` are missing, guiding the user through Entra provisioning.
- A runtime flag toggle in Settings (calls `setFlag` via the existing `admin-flags` router).

**Cost:** 2-3 day. This is **change #3** from the archived `wire-enterprise-auth` proposal.
**Buys:** Production-ready UX.
**Restoration-theme posture:** Maximal.
**Recommendation:** Defer to a follow-up OpenSpec proposal after Option B lands — B is what unblocks daily development.

---

## 8. Recommended sequence

1. **Now** — write an `/opsx:explore` round on Option B's design details (flag-default mechanics, whether to add a second env-var-driven override, error-UI shape in `login.html`, regression-guard contents).
2. **Then** — `/opsx:propose` a scoped change `restore-login-button-msal` covering **Option B only**. Capability: extend existing `enterprise-auth-wiring` spec (MODIFIED Requirements, per `.claude/rules/openspec.md`). No new capability spec needed.
3. **Coordinate with cluster repo** (`/Users/jason/dev/ai-k8s/talos-ai-cluster/`) for the Entra app registration — external step, no code change to that repo.
4. **Implement** via `/opsx:apply` once the proposal validates.
5. **Verify** the 5 CI-enforced gates (`ts:check`, `build`, `test`, `audit`, `docs-build`) + `bun run lint` advisory.
6. **Archive** via `/opsx:archive` once the regression guard passes on a fresh install with a real Entra tenant.
7. **Roadmap** — add a P2 entry for Option C (Settings UI + first-run wizard), link to `openspec/changes/archive/2026-04-09-wire-enterprise-auth` as the original deferral source.

---

## 9. Open question — should this be an F-entry?

The F1-F10 catalog in `upstream-features.md` covers upstream **SaaS dependencies**, but the login redirect URL is arguably a **hybrid** case: it was the front door to several F-entries at once (F1 sandbox OAuth, F3 remote chats, F8 subscription gating). Three options:

- **(i)** Extend F1's description to explicitly cover the `/auth/desktop` redirect (F1 is already the "OAuth flow extraction" entry). **Risk:** F1 is marked ✅ RESOLVED via the archived `remove-upstream-sandbox-oauth` change; extending it would muddy the archive record.
- **(ii)** Add a new **F11** entry: "Desktop login redirect → upstream `apollosai.dev/auth/desktop`." **Risk:** the F-catalog was declared complete at Phase 0 gate #15. Adding F11 is a semantic expansion that may need a separate OpenSpec note.
- **(iii)** Treat this as **not** an F-entry — the feature (login) still exists, we're just re-pointing the implementation. Instead, handle it entirely via the `enterprise-auth-wiring` capability spec delta.

**Recommendation:** **(iii)** — the login button is a Phase 1 wiring task, not an F-entry restoration. The F-catalog is for SaaS **features** we are replacing; login is a **plumbing** change to an already-chosen auth strategy.

---

## 10. Quick-reference: files the `/opsx:propose` change will touch

Read-only (reference):
- `src/main/lib/enterprise-auth.ts` — already correct
- `src/main/lib/enterprise-store.ts` — already correct
- `src/main/lib/trpc/routers/enterprise-auth.ts` — already correct
- `src/main/lib/feature-flags.ts` — may gain a dev-default override

Modified:
- `src/main/auth-manager.ts` — remove `else` fallthrough to dead URL; harden error path
- `src/renderer/login.html` — optional: add error-state UI (out of scope if Option B picks "throw fast")
- `.env.example` — add `ENTRA_CLIENT_ID` / `ENTRA_TENANT_ID` block
- `docs/conventions/regression-guards.md` — register the new guard

New:
- `tests/regression/login-flow-uses-msal.test.ts`
- `docs/enterprise/entra-app-registration-1code-desktop.md` (or extend the existing `-1code-api` doc into a combined page)

Updated docs:
- `CLAUDE.md:33` — remove the "Settings UI (#3) and cluster config (#4) are deferred" note once #3 is no longer the blocker (#4 remains a separate roadmap item, unchanged)
- `docs/enterprise/upstream-features.md` — no change if §9 option (iii) is chosen
- `docs/operations/roadmap.md` — add "Option C: Settings UI + first-run wizard" as a P2 item

---

## 11. What `/opsx:explore` should probe

1. Should `enterpriseAuthEnabled` default flip to `true` for unpackaged builds, or should there be a third env-var-driven override (e.g. `MAIN_VITE_DEV_ENTERPRISE_AUTH=true`)? Trade-off: flag-default flip is cleaner but invisible to `/phase-0-progress` style audits that grep defaults; env-var override is explicit but adds a second dev bypass mechanism on top of `MAIN_VITE_DEV_BYPASS_AUTH`.
2. What happens when `ENTRA_CLIENT_ID` is missing but flag is on? Fail fast (current behavior — throw at `getEnterpriseAuthConfig`) or degrade gracefully to a "needs setup" screen?
3. Is the `login.html` plain HTML file (no React) the right place to render a "you need to set up Entra" message, or should the first-run wizard be in a proper React surface?
4. Should we keep or delete the remaining `fetch(\`${apiUrl}/api/auth/desktop/exchange\`)` code at `auth-manager.ts:130` and `:220` (legacy paths, only reachable when flag is off)? Deleting them aligns with the restoration theme but may require a one-commit cleanup + test update. Keeping them makes the flag more reversible but preserves dead code.
5. Is there value in preserving the legacy `exchangeCode` code path at all, or can Phase 2 (per auth-strategy §5.3.1 Step D) proceed immediately once the flag defaults on?

---

## 12. What `/opsx:propose` should scope

**Minimum viable scope (Option B, trimmed):**

- Capability delta: `enterprise-auth-wiring` (MODIFIED)
- Tasks: ~6 atomic items (see §10 file list)
- Prereqs: Entra app registration (external, documented as prereq not as a task)
- Regression guard: 1 new test file
- Docs touched: 4 (`.env.example`, `CLAUDE.md`, `docs/enterprise/entra-app-registration-*.md`, `docs/conventions/regression-guards.md`)
- TS baseline impact: expected 0 (no new types introduced)
- Estimated effort: ~0.5 day implementation + ~1 hour review

**Out of scope (tracked separately):**

- Settings UI (original change #3, deferred) — follow-up P2 roadmap entry
- Cluster SecurityPolicy for `1code-api` (original change #4) — already P1 roadmap entry
- F2/F3 restoration (automations, remote chats) — already P1 roadmap entries
