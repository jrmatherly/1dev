## Context

The `wire-enterprise-auth` change (archived 2026-04-09) implemented the Strangler Fig adapter in `src/main/auth-manager.ts` and the MSAL token-acquisition module in `src/main/lib/enterprise-auth.ts`. Both Entra app registrations exist in the `aaronsinc.com` tenant: `LLMOps - 1Code API` (`appId: 52d25f5d-688a-46fe-8356-305cec17f375`, public+web platforms, single registration covering desktop loopback **and** Envoy OIDC) and `LLMOps - 1Code API Graph Client` (`appId: 0065f604-ec75-410c-96ea-a64fee12b0d1`, confidential client for `client_credentials` → Microsoft Graph). The cluster manifests in `deploy/kubernetes/` substitute these from `cluster.yaml` (`entra_tenant_id: f505346f-75cf-458b-baeb-10708d41967d`, `onecode_api_entra_client_id: 52d25f5d-...`), Flux is reconciling them, and the 1code-api pod is live (`onecode_api_enabled: true`).

Despite all this, running `bun run dev` without `MAIN_VITE_DEV_BYPASS_AUTH=true` produces a broken **Sign in** button. The current call chain is `login.html:127 → desktopApi.startAuthFlow() → IPC auth:start-flow → AuthManager.startAuthFlow()`, and the `else` branch at `auth-manager.ts:368` opens `${apiUrl}/auth/desktop?auto=true` against the dead upstream host. Even with `enterpriseAuthEnabled = true`, if `MAIN_VITE_ENTRA_CLIENT_ID` / `MAIN_VITE_ENTRA_TENANT_ID` are unset, `getEnterpriseAuthConfig()` throws inside `initEnterprise()`, the catch swallows it, and the click becomes a silent no-op (`enterpriseAuth` stays `null`, `console.error` only).

The investigation findings live at `docs/enterprise/auth-login-button-wire-msal.md`. This change implements the recommendations from that doc, the `/opsx:explore` round, and the corrections from the 2026-04-13 five-reviewer audit (architect / security / test / UX-a11y / docs).

The `enterprise-auth-wiring` capability spec already requires `startAuthFlow()` to call `acquireTokenInteractive()` when the flag is on (Scenario "Enterprise auth enabled — delegates to EnterpriseAuth"). It does not currently require what happens when the flag is off, which is why the dead-URL fallthrough was never spec-violating. This change adds new requirements — additively, preserving the baseline scenarios verbatim — to tighten the OFF-branch behavior and add the supporting UX/IPC/branding pieces.

## Goals / Non-Goals

**Goals:**
- Make the **Sign in** button on `login.html` invoke MSAL `acquireTokenInteractive()` end-to-end on a fresh `bun run dev` checkout once `.env` carries the documented values.
- Eliminate the silent dead-URL UX foot-gun: any sign-in attempt that cannot complete (flag off, config missing, MSAL init failed) MUST surface a visible, actionable, accessible error in the login window — never a silent failure or a redirect to a 404.
- Establish a `!app.isPackaged`-gated env-var override path for the `enterpriseAuthEnabled` feature flag, mirroring the existing `MAIN_VITE_DEV_BYPASS_AUTH` pattern.
- Replace the legacy 21st.dev SVG geometry in `login.html` with the canonical 1Code mark sourced from `src/renderer/components/ui/logo.tsx` and bring it into compliance with the existing `accessibility-labels-reflect-current-brand` brand-identity requirement.
- Lock the new behavior in via a regression guard (`tests/regression/login-flow-uses-msal.test.ts`) that asserts the dead URL cannot be reintroduced, the login.html SVG geometry cannot drift back to upstream, the toast is XSS-safe, and the supporting wiring (IPC + preload exposure) is present.

**Non-Goals:**
- LiteLLM proxy or admin UI authentication. LiteLLM uses OSS master-key + password login per the cluster's OSS-only constraint (`enable_jwt_auth` is Enterprise-gated). The `auth-strategy.md` §3 OIDC block targeting `${LITELLM_HOSTNAME}` is a design aspiration not exercised by this change.
- The Microsoft Graph `client_credentials` flow via App Registration #2. Only activates under `PROVISIONING_ENABLED=true`, deferred per `docs/operations/roadmap.md`.
- Settings UI to toggle the flag at runtime. Deferred as the original change #3 from `wire-enterprise-auth`; tracked for a P2 follow-up.
- Full retirement of the legacy `auth-manager.ts` SaaS branch (Step D from `auth-strategy.md` §5.3.1). Deferred to a separate change after this has been live in dev for 2+ weeks; tracked in roadmap.
- Brand asset replacement beyond `login.html` (e.g., `build/icon.{png,ico,icns}`, DMG backgrounds). Tracked in roadmap.
- Cluster repo (`/Users/jason/dev/ai-k8s/talos-ai-cluster/`) changes. Manifests already substitute the correct GUIDs.
- Click-target size on the Sign-in button (32px → 44px+ for WCAG 2.5.5 AAA). Cosmetic; out of scope.
- Loading splash polish beyond a `aria-busy`/disabled button + label swap.

## Decisions

### Decision 1 — Env-var override name: `MAIN_VITE_ENTERPRISE_AUTH_ENABLED` (Vite-prefixed), main-process only via `import.meta.env`
*(resolves explore Q1; corrected post-smoke-test 2026-04-13 after the original `process.env.*` design proved non-functional in dev)*

Reads `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED`. The `MAIN_VITE_` prefix is load-bearing — electron-vite loads `.env` through Vite's env system, which only bundles variables whose names start with `MAIN_VITE_` (main process) or `VITE_` (renderer). Unprefixed vars do NOT propagate from `.env` to `process.env` in the main process at dev time.

Matches the existing convention in the repo: `MAIN_VITE_DEV_BYPASS_AUTH`, `MAIN_VITE_API_URL`, `MAIN_VITE_OPENAI_API_KEY`, `MAIN_VITE_POSTHOG_KEY`, `MAIN_VITE_SENTRY_DSN` — all dev-time knobs use this prefix and `import.meta.env` reads.

The value is substituted by Vite at build time (dev rebuilds on file change, so this is equivalent to a runtime flag for dev purposes). Packaged builds have `undefined` at this position — they correctly fall through to the database `feature_flag_overrides` table, which is the intended production path.

**Alternatives considered:**
- Original plan: unprefixed `ENTERPRISE_AUTH_ENABLED` via `process.env.*`. Rejected after the 2026-04-13 smoke test showed the value never reached runtime (`[AuthManager] enterpriseAuthEnabled=false (source: default)` despite `.env` having `ENTERPRISE_AUTH_ENABLED=true`). electron-vite does not propagate unprefixed env vars to the main process at dev time.
- Generic `FEATURE_FLAG_<NAME>` resolver — too speculative for a single use case. If a second flag needs the same treatment, refactor at that point.
- Load `.env` via `dotenv` at main-process startup before any `getFlag()` call. Rejected: adds a runtime dependency, mutates `process.env` as a side effect, and diverges from the established `MAIN_VITE_*` convention.

### Decision 2 — Override gated by `!app.isPackaged` (dev-only), with behavioral assertion
*(resolves explore Q5)*

The override is read inside `getFlag()` only when the app is unpackaged. Packaged builds rely exclusively on the database `feature_flag_overrides` table (and the future Settings UI). Mirrors `MAIN_VITE_DEV_BYPASS_AUTH` semantics. Prevents the foot-gun where a user's shell environment leaks into the packaged app.

The spec scenario asserts the **behavior** ("env not consulted in packaged builds"), not just the result, so a future refactor moving the gate is detected. Concretely: the resolver function is structured `if (!app.isPackaged) { ... }` so that the env read is statically inside the gate; a regression guard asserts the call appears inside the conditional via regex extraction.

**Risk acknowledged:** developers shipping debug builds externally would expose the env knob. Mitigation: documented in §Risks below.

**Alternative considered:** Make the override work in any mode. Rejected: packaged builds are single-user local installs with no equivalent of a sysadmin pushing env via systemd. The risk of accidental leak from a developer's shell outweighs the benefit.

### Decision 3 — Throw at click time + log warning at startup + log resolved flag source
*(resolves explore Q2)*

`getEnterpriseAuthConfig()` continues to throw inside `initEnterprise()` (current behavior). The new additions are:
1. **At app startup**, after `initEnterprise()` resolves, if `enterpriseAuthEnabled` is `true` but `enterpriseAuth` is `null` (initialization failed), log a `console.warn` with actionable text identifying the missing env vars.
2. **At app startup**, log the resolved source of `enterpriseAuthEnabled` once (`"env"` / `"db"` / `"default"`) — answers "why is this on?" in one log line.
3. **At sign-in click**, the IPC handler `await getAuthManager().ensureReady()` BEFORE branching on `enterpriseAuth === null` to eliminate the race. If `enterpriseAuth` is `null` (init failed) OR the flag is off, throw a typed `AuthError` (see Decision 8). The IPC handler catches it and emits an `auth:error` event to the renderer.

Combines fast-feedback for developers (startup warning) with end-user-actionable error at the moment of action (click). Does not block dev-bypass users (whose flag is off and who never check it).

**Alternatives considered:**
- Throw at startup, block app launch — breaks dev-bypass workflow.
- Throw lazily at first `getFlag()` read — too noisy; `getFlag` is called from many places.
- Disable the button visually when config is missing — defers to a follow-up; `login.html` is plain HTML and the button-disabling UX is a polish item not blocking this change.

### Decision 4 — Surgical dead-URL removal only
*(resolves explore Q3)*

Delete only the `else` fallthrough at `auth-manager.ts:368`. Add a null-guard throw at the top of the `if (this.isEnterprise)` branch to handle the init-failed case (this is the half of Decision 3 that lives in `auth-manager.ts`). Leave `exchangeCode()`, the legacy `refresh()` fallback, `updateUser()`, `fetchUserPlan()`, and `getApiUrl()` in place — they already throw or short-circuit when the flag is on and are part of the Strangler Fig contract preserved until Step D. Doing a broader cleanup now would break the rollback guarantee that the flag-off path "still works."

The full Phase D cleanup is filed as a roadmap entry to land 2+ weeks after this change is stable, per `auth-strategy.md` §5.3.1 Step D. The roadmap entry explicitly notes that **new regression guards will be required** when Phase D lands, because this change's regression guard scope is intentionally narrow to the dead-URL fallthrough.

**Alternatives considered:**
- Targeted removal of all five legacy fetch sites — broader diff, harder to revert.
- Aggressive Phase D retirement now — explicitly out of order per the strategy doc; rollback risk high.

### Decision 5 — Login button uses canonical 1Code SVG inline (with full a11y compliance)
*(resolves explore Q4 — branding portion)*

`login.html` is a plain HTML file rendered before the React bundle loads. It cannot import the `<Logo>` component from `src/renderer/components/ui/logo.tsx`. Replace the existing `<svg viewBox="0 0 560 560">...<path d="M560 560H0V0...">` block with the canonical 1Code geometry: `<svg viewBox="0 0 400 400">...<path d="M358.333 0...">`. The path is copied verbatim from `logo.tsx`; the inline pattern matches the existing inline 1Code SVG in `src/renderer/index.html:88-101`.

The new `<svg>` MUST include `aria-label="1Code logo"` and `role="img"` to comply with the existing `accessibility-labels-reflect-current-brand` requirement in baseline `brand-identity` spec — the current `login.html` SVG has neither. The inner `<path>` MUST keep `class="logo-path"` so that `.logo .logo-path { fill: var(--text-logo); }` continues to apply across dark/light themes; without that class, theme fill silently breaks.

The CSS in `login.html` already styles `.logo` (height/width 72px) and uses `var(--text-logo)` for fill; no CSS changes required.

**Alternatives considered:**
- Inline `<img src="logo.svg">` — needs a build asset; current `login.html` has no asset references.
- Embed React just for the logo — defers to React-conversion follow-up; out of scope.

### Decision 6 — DOM-resident accessible toast in `login.html` for `auth:error`
*(resolves explore Q4 — error UX portion)*

Add a `desktopApi.onAuthError(callback)` in the preload bridge. Add a `<div id="authError" class="toast" role="alert" aria-live="assertive" aria-atomic="true" hidden>...</div>` element **present in the DOM at page load** (not injected on error) inside `.container` — many screen readers ignore live-region attributes added after initial parse. Hidden via `hidden` attribute until populated.

**Markup pattern** (matches `index.html` inline JS conventions):
```
<div id="authError" class="toast" role="alert" aria-live="assertive"
     aria-atomic="true" hidden>
  <span class="toast-icon" aria-hidden="true">⚠</span>
  <span class="toast-message"></span>
  <button class="toast-dismiss" type="button" aria-label="Dismiss error">×</button>
</div>
```

**Behavior contract:**
- **Show:** `toastMessage.textContent = msg` (NEVER `innerHTML` — XSS-safe per Decision 8 sanitization), remove `hidden`, start 8s timer.
- **Dismiss triggers:** click `.toast-dismiss`, Esc keydown on `document`, timer expiry, replace-in-place on repeat error (reset timer).
- **Drag region:** `#authError { -webkit-app-region: no-drag; }` since `body { -webkit-app-region: drag }` would otherwise capture clicks inside the toast.
- **Focus management:** do NOT steal focus on show (assertive live region announces); on dismiss, return focus to the Sign-in button.
- **Reduced motion:** any slide-in animation gated by `@media (prefers-reduced-motion: no-preference)`.
- **Theme contrast:** light mode `bg #FEE2E2 / fg #991B1B / border #F87171` (≥7:1); dark mode `bg #7F1D1D / fg #FEE2E2 / border #F87171` (≥8:1). Warning glyph (⚠) is `aria-hidden="true"`.

**Sign-in button loading state** (concurrent UX): on click, set `signinBtn.disabled = true`, swap label text to "Waiting for browser sign-in…", set `aria-busy="true"`. On `auth:error` OR after a timeout, restore. Prevents double-clicks (which would cause loopback port collisions).

**Autofocus:** `<button autofocus>` so Enter immediately submits without Tab.

**Alternatives considered:**
- Convert `login.html` to a React micro-bundle — over-engineering for a single button.
- `dialog.showErrorBox` from main process — native modal is jarring and breaks design.
- Silent throw, console-only — no user-facing feedback; defeats the goal.

### Decision 7 — Regression guard scope: 9 assertions (2 positive controls + 7 behavioral)

The new `tests/regression/login-flow-uses-msal.test.ts` asserts:

**Positive controls (prevent invalid-red per TDD red-state rule):**
1. `src/renderer/login.html` length > 500 (file readable + non-trivial).
2. `src/main/auth-manager.ts` length > 5000 (file readable + non-trivial).

**Behavioral:**
3. **No literal `"/auth/desktop?auto=true"` substring** (NOT the broader `/auth/desktop` — the intentionally-preserved `/api/auth/desktop/exchange` and `/api/auth/desktop/refresh` would false-positive that) in any file under `src/main/`.
4. **`auth-manager.ts:startAuthFlow()` body, regex-scoped** via `/\bstartAuthFlow\s*\([^)]*\)\s*[:\w<>,\s|?]*\{[\s\S]*?(?=^\s{2}\b)/m` (matches the existing pattern from `enterprise-auth-wiring.test.ts` line 35), contains `throw new ` AND does NOT call `safeOpenExternal(`.
5. **`feature-flags.ts:getFlag()` body** references both `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED` AND `app.isPackaged`. Additionally, the `process.env` reference appears INSIDE the `!app.isPackaged` conditional (regex-scoped to the gate body).
6. **`windows/main.ts` `auth:start-flow` IPC handler** calls `validateSender(event)` AND uses `event.sender.send("auth:error", ...)` (validated-sender-targeted, not broadcast).
7. **`.env.example`** contains `MAIN_VITE_ENTRA_CLIENT_ID`, `MAIN_VITE_ENTRA_TENANT_ID`, AND `MAIN_VITE_ENTERPRISE_AUTH_ENABLED` within 10 lines of each other (coherent block, not scattered).
8. **`src/renderer/login.html`** contains all of: `viewBox="0 0 400 400"`, a path beginning `"M358.333"`, `aria-label="1Code logo"`, `class="logo-path"`, `id="authError"`, `role="alert"`, `aria-live="assertive"`. Does NOT contain: `viewBox="0 0 560 560"`, path beginning `"M560 560H0V0"`, or `innerHTML` (XSS-safety assertion).
9. **`src/preload/index.ts`** contains `onAuthError`. **`src/preload/index.d.ts`** contains `onAuthError` AND an `AuthError` type union declaration.

Assertions 3 (narrowed) and 8 (visual brand) close gaps the existing `brand-sweep-complete.test.ts` cannot — it catches text but not SVG geometry drift. Assertions 4 and 5 use regex-scoped body extraction (matches existing pattern in `enterprise-auth-wiring.test.ts`) so unrelated `throw` statements elsewhere in the file don't trigger false-passes. Assertion 8's `innerHTML` ban is the XSS guard.

### Decision 8 — Typed `AuthError` discriminated union + main-process sanitization

To prevent IPC error leaks (filesystem paths from MSAL cache plugin, correlation IDs, stack traces), define in `src/preload/index.d.ts`:

```typescript
export type AuthError =
  | { kind: "flag-off"; message: string }
  | { kind: "config-missing"; message: string }
  | { kind: "init-failed"; message: string }
  | { kind: "msal-error"; message: string };
```

The main-process `auth:start-flow` IPC handler in `windows/main.ts` catches the rejection from `AuthManager.startAuthFlow()` and runs the error through a sanitizer (in a new helper `formatAuthError(err: unknown, isPackaged: boolean): AuthError`):
- Maps known error patterns (config-missing, init-failed, MSAL error codes) to `kind` values.
- Replaces filesystem paths and correlation IDs with placeholders.
- For packaged builds, replaces dev-facing text (env-var instructions) with end-user text ("Enterprise sign-in isn't configured for this build. Contact your administrator.").
- Falls through to `{ kind: "msal-error", message: "Sign-in failed. Check logs for details." }` for unknown errors.

The `event.sender.send("auth:error", sanitized)` then ships the typed object to the renderer. The renderer's toast handler uses `sanitized.message` via `textContent` — never `innerHTML`.

**Why it matters:** baseline error messages from MSAL Node can include `app.getPath('userData')` paths and partial token artifacts. Without sanitization these would render directly into the toast.

### Decision 9 — MSAL success propagation via shared helper extracted from `handleAuthCode`
*(added 2026-04-13 post-smoke-test)*

The first smoke test revealed that `AuthManager.startAuthFlow()` resolves cleanly after MSAL's loopback callback, but **no code path signals the renderer or reloads the window**. The browser correctly shows "Authentication complete" (MSAL's `successTemplate`), but the Electron app stays on "Waiting for browser sign-in…" indefinitely because the transition was implicitly tied to the legacy deep-link path (`handleAuthCode` in `src/main/index.ts`) which only fires when the custom-protocol URL is received.

**Fix**: extract the window-reload + `auth:success` emission loop from `handleAuthCode` into a reusable `completeAuthSuccess(user: AuthUser): void` helper exported from `src/main/index.ts`. Both paths — legacy `handleAuthCode` (deep-link) and the new `auth:start-flow` IPC handler (MSAL) — call it. The helper is pure plumbing (iterate windows, send event, reload renderer); it does NOT perform analytics, plan-fetch, or cookie-set, which remain caller-local.

**Alternatives considered:**
- Emit `auth:success` from `AuthManager.startAuthFlow` directly. Rejected: `AuthManager` is a domain object and should not import `BrowserWindow` / `session` / `loadURL`.
- Keep two separate reload loops (duplicate in `windows/main.ts` and `handleAuthCode`). Rejected: guaranteed drift; the reload pattern is intricate enough (dev vs. production URL resolution, `windowManager.getStableId`, destroyed-window guards) that duplication is a bug magnet.

**Test coverage:** Regression guard asserts (a) `src/main/index.ts` exports `completeAuthSuccess`, (b) `handleAuthCode` delegates to it, (c) the `auth:start-flow` handler block references both `completeAuthSuccess` and `authManager.getUser()`.

**Why this wasn't caught earlier:** The 5-reviewer team audit focused on the OFF-branch + error-path behavior. Neither the test reviewer nor the architect flagged the missing success-path signaling because the spec implicitly assumed MSAL resolution would "just work" the same way the deep-link flow did — but they have different wakeup mechanisms. The smoke test caught it on the first real sign-in attempt.

## Risks / Trade-offs

- **[Risk] Removing the dead-URL fallthrough means the OFF-branch of `enterpriseAuthEnabled` is now non-functional for sign-in.** → **Mitigation:** This is intentional and consistent with the restoration theme (no SaaS endpoint exists to hit). The OFF-branch was already broken in practice; removing it surfaces the breakage instead of hiding it. Dev-bypass remains the documented workaround for "no auth backend yet."

- **[Risk] Env override consulted before DB override changes the precedence ordering for one flag.** → **Mitigation:** Document explicitly in the spec scenarios (env > DB > default). Limited to `enterpriseAuthEnabled` for now. If a second flag adopts the same pattern later, the precedence becomes a property of the resolver, not per-flag.

- **[Risk] If a developer sets `MAIN_VITE_ENTERPRISE_AUTH_ENABLED=true` but forgets the GUIDs, they get a click-time error.** → **Mitigation:** The startup `console.warn` makes this discoverable before clicking; the `.env.example` block lists all three vars together with a clear comment.

- **[Risk] Dev-built binaries shipped externally would expose the env knob.** → **Mitigation:** Documented as an anti-pattern. `app.isPackaged === true` is true only for `bun run package:*` outputs; debug `bun run dev` artifacts are not for distribution.

- **[Risk] Replacing `login.html` SVG geometry could regress the visual layout if the new path's intrinsic aspect ratio differs.** → **Mitigation:** Both old and new SVGs use `width: 72px; height: 72px;` from CSS, so the rendered size is fixed regardless of viewBox. The path is centered inside the viewBox in both cases.

- **[Risk] Regression guard assertion 4 reads source code patterns rather than runtime behavior — could pass on a syntactically-correct but semantically-broken refactor.** → **Mitigation:** Acceptable for a regression guard; runtime behavior is verified by `bun run dev` + manual click. Future work can layer Playwright E2E if needed. Pattern matches existing project convention (`enterprise-auth-wiring.test.ts`, `no-upstream-sandbox-oauth.test.ts`).

- **[Risk] CSP compatibility for new inline JS in `login.html`.** → **Mitigation:** Existing CSP (`script-src 'self' 'unsafe-inline'`) already permits the inline `onAuthSuccess` listener; adding `onAuthError` is the same shape. Verified before implementation.

- **[Risk] Race between `await initEnterprise()` and a fast Sign-in click.** → **Mitigation:** Decision 3 specifies `await ensureReady()` in the IPC handler before branching on `enterpriseAuth === null`. Spec scenario adds the precondition explicitly.

- **[Trade-off] Surgical dead-URL removal leaves five other dead `fetch(${apiUrl}/...)` call sites alive (in `exchangeCode`, `refresh` legacy, `updateUser`, `fetchUserPlan`).** → **Accepted** for the Strangler Fig rollback guarantee. Tracked in the roadmap entry for Phase D cleanup.

- **[Trade-off] Vanilla JS toast in `login.html` ages poorly as the only React-free renderer surface.** → **Accepted** for now; converting `login.html` to React is its own change and out of scope.

- **[Trade-off] Two `auth:error` emitters now exist (existing one at `src/main/index.ts:198` broadcasts; new one at `windows/main.ts` targets validated sender).** → **Accepted** for backwards compatibility with existing deep-link auth callbacks. Code comment in the new emitter cross-references the existing one to prevent future maintainer confusion.

## Migration Plan

1. **Land this change.** Quality gates pass (5 CI gates + lint advisory).
2. **Manual smoke test** — fresh `bun run dev` with `.env` containing `MAIN_VITE_ENTRA_CLIENT_ID`, `MAIN_VITE_ENTRA_TENANT_ID`, and `MAIN_VITE_ENTERPRISE_AUTH_ENABLED=true`. Click **Sign in**, complete browser sign-in, observe app unlock with the signed-in user. Plus negative paths (config missing, flag off, invalid env value, packaged build).
3. **Stability watch** — leave `enterpriseAuthEnabled` env override `=true` in dev for 2+ weeks. No regressions expected because:
   - Dev-bypass users (`MAIN_VITE_DEV_BYPASS_AUTH=true`) are unaffected (different code path, short-circuits before `startAuthFlow`).
   - Packaged builds are unaffected (env override gated by `!app.isPackaged`).
   - Production users have the flag-off DB default and now see an explicit error toast instead of a dead URL — strictly better.
4. **Roadmap follow-up** — file the Phase D cleanup change (tracked in roadmap as part of this change's deliverables) once stability is confirmed.

**Rollback strategy:** Revert the change. Dead URL returns. No data migration, no state to clean up, no external dependencies to undo. The env override variable would be ignored after revert (the resolver code is gone), so leaving it set in `.env` is harmless. Manual smoke task §10.9 verifies post-revert behavior.

## Open Questions

- (none — all five `/opsx:explore` questions resolved per design decisions above; all five-reviewer audit findings resolved per Tier-1 corrections.)
