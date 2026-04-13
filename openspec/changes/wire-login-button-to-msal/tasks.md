## 1. Feature-flag env override (Decision 1 + 2)

- [x] 1.1 In `src/main/lib/feature-flags.ts`, modify `getFlag()` so that when called with key `"enterpriseAuthEnabled"` AND `app.isPackaged === false`, it consults `process.env.ENTERPRISE_AUTH_ENABLED` first. Structure as `if (!app.isPackaged) { const envVal = process.env.ENTERPRISE_AUTH_ENABLED; if (envVal === "true") return true; if (envVal === "false") return false; }` so the env read is statically inside the gate (verifiable by regex-scoped regression assertion 5).
- [x] 1.2 The literal `"true"` resolves to `true`, `"false"` resolves to `false`, anything else (including unset) falls through to existing DB / default lookup.
- [x] 1.3 No effect on any other flag key — env read is hardcoded to the `enterpriseAuthEnabled` branch only.

## 2. AuthManager hardening — remove dead URL fallthrough + add ON-branch null-guard (Decision 3 + 4)

- [x] 2.1 In `src/main/auth-manager.ts`, delete the `else` branch in `startAuthFlow()` (lines ~366-379) that constructs `${this.getApiUrl()}/auth/desktop?auto=true` and calls `safeOpenExternal`.
- [x] 2.2a Replace the deleted branch with a typed throw: `throw createAuthError("flag-off")`. Add a small `createAuthError(kind: AuthError["kind"]): Error & { authKind: AuthError["kind"] }` helper in `auth-manager.ts` that produces `Error` objects with a discriminated `authKind` field for the IPC sanitizer to switch on.
- [x] 2.2b Add a null-guard at the top of the `if (this.isEnterprise)` branch: if `this.enterpriseAuth === null`, throw `createAuthError("init-failed")` (or `"config-missing"` if a separate flag/check distinguishes the two). This handles the case where `initEnterprise()` failed.
- [x] 2.3 In `src/main/auth-manager.ts`, after `initEnterprise()` completes (in the constructor's promise chain), if `enterpriseAuthEnabled` is `true` AND `enterpriseAuth` is `null`, log a `console.warn` line: `[AuthManager] enterpriseAuthEnabled=true but MSAL init failed. Check ENTRA_CLIENT_ID and ENTRA_TENANT_ID env vars.` Once per app launch.
- [x] 2.4 Add a startup log emitting the resolved source of `enterpriseAuthEnabled` (`"env"` / `"db"` / `"default"`). Implement by extending `feature-flags.ts` with a `getFlagWithSource(key)` helper called once at startup.

## 3. IPC error propagation (Decision 8)

- [x] 3.1 In `src/main/windows/main.ts`, modify the `auth:start-flow` IPC handler at line ~403 to wrap the `getAuthManager().startAuthFlow(win)` call in try/catch. Before the call, `await getAuthManager().ensureReady()` to eliminate the init-race (Decision 3 / spec ensureReady scenario).
- [x] 3.1b Add a `formatAuthError(err: unknown, isPackaged: boolean): AuthError` sanitizer helper (in `windows/main.ts` or a new `src/main/lib/auth-error.ts` if the helper grows). It (a) maps known error patterns to `kind`, (b) strips filesystem paths and correlation IDs from `message`, (c) for packaged builds replaces dev-facing text with end-user wording. Falls through to `{ kind: "msal-error", message: "Sign-in failed. Check logs for details." }` for unknown errors.
- [x] 3.1c On rejection, send `event.sender.send("auth:error", formatAuthError(err, app.isPackaged))` — NOT a broadcast across all windows. Add a code comment cross-referencing the existing parallel emitter at `src/main/index.ts:198`.
- [x] 3.2 In `src/preload/index.ts`, add `onAuthError(callback: (payload: AuthError) => void): () => void` to the `desktopApi` bridge. Pattern matches the existing `onAuthSuccess` listener.
- [x] 3.3 In `src/preload/index.d.ts`, add the `AuthError` discriminated union type (per Decision 8 spec block) and the `onAuthError` type signature on the `DesktopApi` interface.

## 4. Login window UX — error toast (Decision 6)

- [x] 4.1 In `src/renderer/login.html`, add inside `.container` (so it inherits `-webkit-app-region: no-drag`) a DOM-resident `<div id="authError" class="toast" role="alert" aria-live="assertive" aria-atomic="true" hidden>` with children: `<span class="toast-icon" aria-hidden="true">⚠</span>`, `<span class="toast-message"></span>`, `<button class="toast-dismiss" type="button" aria-label="Dismiss error">×</button>`.
- [x] 4.2 Add CSS: `.toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); -webkit-app-region: no-drag; padding: 12px 16px; border-radius: 8px; display: flex; align-items: center; gap: 8px; max-width: 480px; }`. Light-mode tokens: `bg #FEE2E2 / fg #991B1B / border 1px solid #F87171`. Dark-mode (via `prefers-color-scheme: dark`): `bg #7F1D1D / fg #FEE2E2 / border 1px solid #F87171`. Both ≥4.5:1 contrast. Animation slide-in gated by `@media (prefers-reduced-motion: no-preference)`.
- [x] 4.3 Add a vanilla JS handler that calls `window.desktopApi.onAuthError((payload) => { ... })` to: (a) `toastMessage.textContent = payload.message` (use the safe text-only DOM property — never the HTML-parsing assignment), (b) `toast.removeAttribute("hidden")`, (c) start an 8s auto-dismiss timer (clear and reset on repeat).
- [x] 4.4 Add dismiss handlers: click on `.toast-dismiss`, Esc keydown on document, timer expiry. On dismiss: `toast.setAttribute("hidden", "")`, return focus to `#signinBtn`.
- [x] 4.5 The toast SHALL NOT steal focus on appearance — relies on the assertive live region for screen-reader announcement.

## 5. Login window UX — Sign-in button loading state + autofocus (Decision 6)

- [x] 5.1 In `src/renderer/login.html`, give the existing button `id="signinBtn"` and add the `autofocus` attribute so Enter immediately submits.
- [x] 5.2 In the existing click handler, before invoking `desktopApi.startAuthFlow()`, set `signinBtn.disabled = true`, `signinBtn.textContent = "Waiting for browser sign-in…"`, `signinBtn.setAttribute("aria-busy", "true")`. Save the original label text in a closure variable for restore.
- [x] 5.3 Restore the button state when `auth:error` fires OR after a 90-second timeout (whichever comes first).

## 6. Login window branding — replace 21st.dev SVG with canonical 1Code mark (Decision 5)

- [x] 6.1 In `src/renderer/login.html`, replace the existing `<svg class="logo" viewBox="0 0 560 560" ...>` block (lines 91-103) with the canonical 1Code SVG: `viewBox="0 0 400 400"` with the path `d="M358.333 0..."` from `src/renderer/components/ui/logo.tsx`. Match the inline pattern from `src/renderer/index.html:88-101`.
- [x] 6.2 Add `aria-label="1Code logo"` and `role="img"` to the new `<svg>` element (compliance with `accessibility-labels-reflect-current-brand` baseline requirement).
- [x] 6.3 Preserve `class="logo-path"` on the inner `<path>` element so the existing CSS rule `.logo .logo-path { fill: var(--text-logo); }` continues to apply across themes.
- [x] 6.4 Verify the existing CSS rules `.logo { height: 72px; width: 72px; }` and `.logo .logo-path { fill: var(--text-logo); }` continue to apply unchanged.
- [x] 6.5 Verify the `<title>` element still says `1Code - Login` (no other text changes needed).

## 7. Documentation — `.env.example`, `CLAUDE.md`, `AGENTS.md`, `docs.json` nav

- [x] 7.1 In `.env.example`, add a documented block under the existing config sections:
      ```bash
      # -- Enterprise Entra ID auth (activates MSAL sign-in in the desktop app)
      # Required to use "Sign in" on the login screen without MAIN_VITE_DEV_BYPASS_AUTH.
      # Values come from cluster.yaml in the Talos cluster repo. See:
      # docs/enterprise/entra-app-registration-1code-api.md
      # NOTE: Client/tenant IDs are public OAuth2 identifiers, not secrets.
      # ENTRA_CLIENT_ID=52d25f5d-688a-46fe-8356-305cec17f375
      # ENTRA_TENANT_ID=f505346f-75cf-458b-baeb-10708d41967d
      # ENTERPRISE_AUTH_ENABLED=true
      ```
      All three vars MUST appear within 10 lines of each other (regression assertion 7 enforces a coherent block).
- [x] 7.2 Update `CLAUDE.md` line 33 to drop the "cluster config (change #4) is deferred" claim. Keep the Settings UI (change #3) deferral note. Suggested wording: `"Phase 1 enterprise auth wiring is complete and login flow is wired (see docs/enterprise/auth-login-button-wire-msal.md). Settings UI for runtime flag toggles (change #3) is deferred to a future OpenSpec proposal."`
- [x] 7.3 Update `AGENTS.md` line 37 to mirror the new `CLAUDE.md:33` wording (parallel update — both files carry the same claim and must stay in sync per the Documentation Maintenance section of `CLAUDE.md`).
- [x] 7.4 Add `"enterprise/auth-login-button-wire-msal"` to the enterprise pages array in `docs/docs.json` (currently between `"enterprise/entra-app-registration-1code-api"` and `"enterprise/1code-api-provisioning"`) so the findings doc is reachable from xyd-js navigation. **This task is COMPLETE as of the change drafting; verify in PR review.**

## 8. Regression guard (Decision 7 — 9 assertions)

- [x] 8.1 Create `tests/regression/login-flow-uses-msal.test.ts` with the 9 assertions from design.md Decision 7. Use `bun:test` (no new deps). Read source files via `node:fs/promises`. Pattern matches existing guards under `tests/regression/`.
- [x] 8.1a Include 2 positive controls at the top: `expect(loginHtml.length).toBeGreaterThan(500)` and `expect(authManagerTs.length).toBeGreaterThan(5000)` so wrong-path `readFileSync` errors don't masquerade as invalid red.
- [x] 8.1b Use the regex-scoped function-body extraction pattern from `tests/regression/enterprise-auth-wiring.test.ts` (the `STRIPPED_ENV_KEYS_BASE` extraction at line ~35) for assertions 4 and 5. Adapt as `/\bstartAuthFlow\s*\([^)]*\)\s*[:\w<>,\s|?]*\{[\s\S]*?(?=^\s{2}\b)/m` and similar for `getFlag`.
- [x] 8.2 Register the new guard in `docs/conventions/regression-guards.md`. Add a row matching the existing guard catalog format.

## 9. Roadmap entries — track deferred follow-on cleanup

- [x] 9.1 Add a `[Deferred]` entry to `docs/operations/roadmap.md` under P2: **"auth-manager.ts Phase D — full Strangler Fig retirement"** per the wording in `docs/enterprise/auth-login-button-wire-msal.md` Q3 follow-up. Include date 2026-04-13, prereq "wire-login-button-to-msal landed and stable in dev for 2+ weeks", canonical reference to `auth-strategy.md` §5.3.1 Step D. **Explicitly note**: "New regression guards will be required when Phase D lands — the current `login-flow-uses-msal.test.ts` guard's scope is intentionally narrow to the dead-URL fallthrough; it does NOT cover the legacy `exchangeCode`/`refresh`-fallback/`updateUser`/`fetchUserPlan` fetch sites that Phase D will remove."
- [x] 9.2 Add a `[Cleanup]` entry to `docs/operations/roadmap.md` under P3: **"Replace remaining 21st.dev brand assets"** covering `build/icon.{png,ico,icns}`, DMG backgrounds, `build/background.svg`, `build/dmg-background.svg`, and any other build/* artifacts carrying upstream branding. Include date 2026-04-13, prereq "apollosai.dev brand asset finalized", canonical reference to `docs/conventions/brand-taxonomy.md`.

## 10. Quality gates

- [x] 10.1 Run `bun run ts:check` — confirm no new TypeScript errors against `.claude/.tscheck-baseline`.
- [x] 10.2 Run `bun test tests/regression/login-flow-uses-msal.test.ts` — all 9 assertions pass.
- [x] 10.3 Run `bun test` — full regression suite passes (existing guards still pass, no regressions).
- [x] 10.4 Run `bun run build` — Electron-vite packaging validation succeeds.
- [x] 10.5 Run `bun audit` — no new advisories.
- [x] 10.6 Run `cd docs && bun run build` — xyd-js docs site build succeeds; the new findings doc renders with the canonical icon and is reachable from nav.
- [x] 10.7 Run `bun run lint` — local lint advisory clean (or no new findings).

## 11. Manual smoke test (negative paths included)

- [ ] 11.1 In a fresh `.env`, set `ENTRA_CLIENT_ID=52d25f5d-688a-46fe-8356-305cec17f375`, `ENTRA_TENANT_ID=f505346f-75cf-458b-baeb-10708d41967d`, `ENTERPRISE_AUTH_ENABLED=true`. Ensure `MAIN_VITE_DEV_BYPASS_AUTH` is unset.
- [ ] 11.2 Run `bun run dev`. Login screen renders with the **canonical 1Code logo** (not the 21st.dev geometry). Sign-in button is auto-focused.
- [ ] 11.3 Click **Sign in**. Button shows `"Waiting for browser sign-in…"` and `aria-busy="true"`. Default browser opens to `login.microsoftonline.com`. Complete sign-in with a tenant user.
- [ ] 11.4 Browser redirects to `http://localhost:<port>/` (MSAL loopback). The Electron app receives the auth and unlocks. Signed-in user appears in the app.
- [ ] 11.5 Negative path A — config missing: with `ENTERPRISE_AUTH_ENABLED=true` but `ENTRA_CLIENT_ID` unset, run `bun run dev`. Observe startup `console.warn`. Click **Sign in**. Observe error toast in the login window with actionable text. Verify Esc dismisses; verify focus returns to button.
- [ ] 11.6 Negative path B — flag off (and dev-bypass off): with `ENTERPRISE_AUTH_ENABLED` unset and `MAIN_VITE_DEV_BYPASS_AUTH` unset, run `bun run dev`. Click **Sign in**. Observe error toast (NOT a redirect to `apollosai.dev/auth/desktop`). Verify the toast text is dev-facing (not the end-user wording).
- [ ] 11.7 Negative path C — flag explicitly false: with `ENTERPRISE_AUTH_ENABLED=false`, run `bun run dev`. Click **Sign in**. Same expected behavior as 11.6 — typed throw, toast appears.
- [ ] 11.8 Negative path D — invalid env value: with `ENTERPRISE_AUTH_ENABLED=yes` (per feature-flags spec scenario "Invalid env value falls through"), run `bun run dev`. Verify behavior is identical to flag unset (falls through to DB / default).
- [ ] 11.9 Rollback test: `git revert` the change, run `bun run dev`. Verify the dead URL behavior returns (proves the rollback strategy in design.md).
- [ ] 11.10 **Packaged-build env-override-ignored test:** `bun run package:mac` (or `:win`/`:linux`). Launch the packaged app from a shell that has `ENTERPRISE_AUTH_ENABLED=true` set. Verify the env override is IGNORED (per feature-flags scenario "Env override behaviorally not consulted in packaged build"). This is the most load-bearing negative because it is the only scenario that cannot be validated in dev.

## 12. OpenSpec verification + archive

- [x] 12.1 Run `openspec validate wire-login-button-to-msal --strict` — no validation errors.
- [x] 12.2 Run `/opsx:verify` — implementation matches change artifacts. ✅ 2026-04-13: 7/7 requirements have code evidence, all 8 design decisions implemented, 3 warnings (all acceptable for ship), 0 critical issues.
- [ ] 12.3 After PR review and merge, run `/opsx:archive wire-login-button-to-msal` — promotes spec deltas to `openspec/specs/` and moves the change to `openspec/changes/archive/`.
- [ ] 12.4 Run `/session-sync` post-archive to update `.serena/memories/`, `.claude/PROJECT_INDEX.md`, and rebuild the code-review graph.
