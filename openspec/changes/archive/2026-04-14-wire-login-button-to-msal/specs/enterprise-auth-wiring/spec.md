## ADDED Requirements

### Requirement: Sign-in click MUST NOT fall through to legacy SaaS URL

The `startAuthFlow()` method on `src/main/auth-manager.ts` SHALL NOT, under any condition, open `${apiUrl}/auth/desktop?auto=true` (the dead upstream URL) via `safeOpenExternal` or any other browser-handoff mechanism. When `enterpriseAuthEnabled` is `true` AND MSAL initialization succeeded, the method SHALL call `acquireTokenInteractive()` (existing behavior). In all other cases (flag off, MSAL init failed, missing config), the method SHALL throw a typed `AuthError` (see "Auth error IPC payload is a typed discriminated union" requirement below).

The `auth:start-flow` IPC handler in `src/main/windows/main.ts` SHALL `await getAuthManager().ensureReady()` before evaluating MSAL initialization status to eliminate the race condition where a fast click occurs before the asynchronous `initEnterprise()` call resolves.

#### Scenario: Sign-in click with flag off — no dead-URL fallthrough

- **WHEN** `getFlag("enterpriseAuthEnabled")` returns `false`
- **AND** `MAIN_VITE_DEV_BYPASS_AUTH` is not `"true"`
- **AND** the renderer invokes `auth:start-flow` (the user clicks the **Sign in** button)
- **AND** the IPC handler has awaited `ensureReady()`
- **THEN** `startAuthFlow()` SHALL throw an `AuthError` with `kind: "flag-off"`
- **AND** SHALL NOT call `safeOpenExternal` with any URL containing `/auth/desktop?auto=true`
- **AND** the `windows/main.ts` IPC handler SHALL catch the rejection, run it through `formatAuthError(err, app.isPackaged)`, and emit an `auth:error` event to the originating WebContents via `event.sender.send` (NOT a broadcast)

#### Scenario: Sign-in click with flag on but MSAL init failed

- **WHEN** `getFlag("enterpriseAuthEnabled")` returns `true`
- **AND** `enterprise-auth.ts` initialization failed (e.g., `MAIN_VITE_ENTRA_CLIENT_ID` or `MAIN_VITE_ENTRA_TENANT_ID` is unset)
- **AND** the renderer invokes `auth:start-flow`
- **AND** the IPC handler has awaited `ensureReady()`
- **THEN** `startAuthFlow()` SHALL throw an `AuthError` with `kind: "config-missing"` (when env vars unset) OR `kind: "init-failed"` (when MSAL init threw for other reasons)
- **AND** the renderer SHALL render the error text in a visible toast

#### Scenario: ensureReady awaited before evaluating null

- **WHEN** the user clicks **Sign in** before `initEnterprise()` has resolved
- **THEN** the `auth:start-flow` IPC handler SHALL await `ensureReady()` before checking `enterpriseAuth === null`
- **AND** SHALL therefore distinguish "init pending" from "init failed"

### Requirement: Startup configuration warning when MSAL init fails

When the app starts with `enterpriseAuthEnabled = true` but MSAL initialization fails because `MAIN_VITE_ENTRA_CLIENT_ID` or `MAIN_VITE_ENTRA_TENANT_ID` is unset, the system SHALL emit a `console.warn` line at startup naming the missing environment variables. The warning SHALL be in addition to the existing `console.error` from the catch block in `initEnterprise()`. The warning SHALL appear once per app launch.

The system SHALL also log the resolved source of `enterpriseAuthEnabled` once at startup (`"env"` / `"db"` / `"default"`) so a developer can quickly answer "why is enterprise auth on?" without grepping the database.

#### Scenario: Startup warning when env vars missing

- **WHEN** the app starts with `enterpriseAuthEnabled = true`
- **AND** `enterprise-auth.ts` initialization fails because `MAIN_VITE_ENTRA_CLIENT_ID` or `MAIN_VITE_ENTRA_TENANT_ID` is unset
- **THEN** the system SHALL emit a `console.warn` at startup naming the missing env vars
- **AND** the warning SHALL be in addition to the existing `console.error` log line

#### Scenario: Startup logs resolved flag source

- **WHEN** the app starts and resolves `getFlag("enterpriseAuthEnabled")`
- **THEN** the system SHALL emit a single log line at INFO level with the resolved source: one of `"env"`, `"db"`, `"default"`

### Requirement: Auth error IPC payload is a typed discriminated union

The `auth:error` IPC event payload SHALL be a typed discriminated union, NOT a bare `Error` object or plain string. The type SHALL be declared in `src/preload/index.d.ts` as:

```typescript
export type AuthError =
  | { kind: "flag-off"; message: string }
  | { kind: "config-missing"; message: string }
  | { kind: "init-failed"; message: string }
  | { kind: "msal-error"; message: string };
```

The main-process `windows/main.ts` IPC handler SHALL run the caught error through a sanitizer helper (`formatAuthError(err: unknown, isPackaged: boolean): AuthError`) that:
1. Maps known error patterns to `kind` values.
2. Strips filesystem paths, correlation IDs, and partial token artifacts from the `message` field.
3. For packaged builds (`isPackaged === true`), SHALL replace dev-facing text (env-var instructions) with end-user text (e.g., "Enterprise sign-in isn't configured for this build. Contact your administrator.").
4. For unknown errors, SHALL fall through to `{ kind: "msal-error", message: "Sign-in failed. Check logs for details." }`.

The renderer SHALL access only `payload.message` for display and MUST use safe text-only DOM mutation (the `textContent` property), never an HTML-parsing assignment, when rendering it.

#### Scenario: Sanitizer maps known error to kind

- **WHEN** `formatAuthError` receives an error from `getEnterpriseAuthConfig()` that includes the substring "MAIN_VITE_ENTRA_CLIENT_ID environment variable is required"
- **THEN** the returned object SHALL have `kind: "config-missing"`
- **AND** the message SHALL include actionable instructions appropriate to the build mode

#### Scenario: Sanitizer strips filesystem paths

- **WHEN** `formatAuthError` receives an error message containing an absolute filesystem path (e.g., `/Users/x/Library/.../msal-cache.json`)
- **THEN** the returned `message` SHALL replace the path with a placeholder like `<msal-cache>` OR the path SHALL be omitted

#### Scenario: Packaged build receives end-user wording

- **WHEN** `formatAuthError(err, true)` is called with a `kind: "config-missing"` error
- **THEN** the returned `message` SHALL NOT mention `MAIN_VITE_ENTRA_CLIENT_ID` or `.env`
- **AND** SHALL use end-user-appropriate wording

### Requirement: Successful sign-in reloads the window and emits auth:success

When `AuthManager.startAuthFlow()` resolves (MSAL `acquireTokenInteractive()` succeeded), the `auth:start-flow` IPC handler in `src/main/windows/main.ts` SHALL signal the renderer that auth is complete so the login page is replaced by the app surface. Concretely, the handler MUST:

1. Read the current user via `authManager.getUser()`.
2. Call the shared `completeAuthSuccess(user)` helper exported from `src/main/index.ts`. The helper iterates every non-destroyed `BrowserWindow` returned by `getAllWindows()`, sends `auth:success` with the user payload, and reloads each renderer so it re-evaluates `isAuthenticated()` and loads the app shell.
3. If `authManager.getUser()` returns `null` unexpectedly after a successful resolve, emit a sanitized `auth:error` payload to the validated sender so the user sees a visible failure rather than a silent stall.

The `completeAuthSuccess` helper SHALL be extracted from the legacy `handleAuthCode` function. `handleAuthCode` SHALL delegate to the shared helper so the 21st.dev deep-link path and the MSAL loopback path share the same window-reload plumbing.

Rationale: MSAL's interactive flow resolves in-process when its loopback server receives the authorization code — there is no deep-link event, so the legacy `handleAuthCode` hook never fires for MSAL sign-ins. Without this requirement, the browser shows "Authentication complete" but the Electron app remains stuck on "Waiting for browser sign-in…" indefinitely.

#### Scenario: MSAL sign-in reloads the window

- **WHEN** the user clicks **Sign in** with the flag on and valid config
- **AND** MSAL's `acquireTokenInteractive()` resolves successfully
- **AND** `authManager.getUser()` returns a non-null `AuthUser`
- **THEN** the IPC handler SHALL invoke `completeAuthSuccess(user)`
- **AND** every non-destroyed `BrowserWindow` SHALL receive an `auth:success` event via `webContents.send` with the user payload
- **AND** every non-destroyed `BrowserWindow` SHALL be reloaded (via `loadURL` in dev or `loadFile` in production) so the renderer re-evaluates auth state

#### Scenario: MSAL resolve with missing user emits auth:error

- **WHEN** `AuthManager.startAuthFlow()` resolves but `authManager.getUser()` returns `null`
- **THEN** the IPC handler SHALL NOT invoke `completeAuthSuccess`
- **AND** SHALL emit a sanitized `auth:error` payload with `kind: "msal-error"` to `event.sender`
- **AND** the renderer SHALL display the error in the `#authError` toast

#### Scenario: handleAuthCode delegates to the shared helper

- **WHEN** `handleAuthCode(code)` completes `authManager.exchangeCode(code)` successfully
- **THEN** it SHALL invoke `completeAuthSuccess(authData.user)` instead of duplicating the reload loop
- **AND** the legacy deep-link path and the MSAL path SHALL produce identical window-reload side effects

### Requirement: Login screen renders error via accessible DOM-resident toast

The login window at `src/renderer/login.html` SHALL contain a DOM-resident `<div id="authError">` element present at page load (NOT injected on error) with attributes `role="alert"`, `aria-live="assertive"`, and `aria-atomic="true"`. The element SHALL be initially hidden via the `hidden` attribute and live inside the existing `.container` element so it inherits `-webkit-app-region: no-drag`.

When the renderer receives an `auth:error` IPC event, it SHALL:
1. Set the inner `.toast-message` element's `textContent` (using the safe text-only DOM property) to the sanitized message. The implementation MUST NOT use any HTML-parsing assignment for the message text.
2. Remove the `hidden` attribute.
3. Start an 8-second auto-dismiss timer (replace-in-place if a new error arrives — reset the timer rather than stacking toasts).

The toast SHALL be dismissable by:
- Clicking the in-toast `.toast-dismiss` button (with `aria-label="Dismiss error"`).
- Pressing Esc on the document.
- Auto-dismiss timer expiry.

On dismissal, focus SHALL return to the Sign-in button.

The toast SHALL NOT steal focus on appearance (the assertive live region announces).

The Sign-in button SHALL show a loading state while the MSAL handoff is in flight: `disabled = true`, label text swapped to "Waiting for browser sign-in…", `aria-busy="true"`. The state SHALL be reset on `auth:error` OR after a 90-second timeout.

The Sign-in button SHALL be auto-focused on page load (`autofocus` attribute) so Enter immediately submits without a Tab keystroke.

#### Scenario: Toast element exists at page load

- **WHEN** the login window renders for the first time
- **THEN** the DOM SHALL contain `#authError` with `role="alert"`, `aria-live="assertive"`, `aria-atomic="true"`, and `hidden` attribute set
- **AND** the element SHALL be inside the `.container` element

#### Scenario: Sign-in click triggers `auth:error` when config missing

- **WHEN** the user clicks **Sign in** on the login window
- **AND** `startAuthFlow()` rejects with a typed `AuthError`
- **THEN** the `auth:start-flow` IPC handler SHALL emit `auth:error` to the originating WebContents with the sanitized payload
- **AND** the login window SHALL render the `message` text in the `#authError` toast via the safe text-only DOM property (`textContent`)
- **AND** the toast SHALL self-dismiss after 8 seconds OR remain dismissable by Esc/click

#### Scenario: Toast uses safe text-only DOM mutation (XSS safety)

- **WHEN** the renderer's `auth:error` handler populates the toast
- **THEN** the implementation SHALL use the safe text-only DOM property to set the message
- **AND** SHALL NOT use any HTML-parsing assignment (the unsafe HTML-set property) anywhere in the `auth:error` code path

#### Scenario: Sign-in button shows loading state

- **WHEN** the user clicks **Sign in** and the click handler invokes `desktopApi.startAuthFlow()`
- **THEN** the button SHALL set `disabled = true`, swap label text to "Waiting for browser sign-in…", and set `aria-busy="true"`
- **AND** the state SHALL be reset on receipt of `auth:error` OR after 90 seconds

#### Scenario: Sender validation preserved on `auth:start-flow`

- **WHEN** the `auth:start-flow` IPC handler receives an event
- **THEN** the handler SHALL call `validateSender(event)` before invoking `AuthManager.startAuthFlow()`
- **AND** SHALL return early if validation fails
- **AND** the `auth:error` emit SHALL target `event.sender.send(...)` (validated sender) NOT a broadcast across all windows

### Requirement: Login-flow regression guard

A second regression guard at `tests/regression/login-flow-uses-msal.test.ts` SHALL verify (in addition to the existing `tests/regression/enterprise-auth-wiring.test.ts`):

**Positive controls (prevent invalid-red per the TDD red-state rule):**
1. `src/renderer/login.html` length > 500 characters (file is readable + non-trivial).
2. `src/main/auth-manager.ts` length > 5000 characters.

**Behavioral assertions:**
3. No literal `"/auth/desktop?auto=true"` substring in any file under `src/main/` (scoped narrowly so the intentionally-preserved `/api/auth/desktop/exchange` and `/api/auth/desktop/refresh` lines do not false-positive).
4. `src/main/auth-manager.ts:startAuthFlow()` body, regex-scoped via the function-body extraction pattern from `tests/regression/enterprise-auth-wiring.test.ts`, contains `throw new ` AND does NOT call `safeOpenExternal(`.
5. `src/main/lib/feature-flags.ts:getFlag()` body references both `import.meta.env.MAIN_VITE_ENTERPRISE_AUTH_ENABLED` AND `app.isPackaged`. The `process.env` reference appears INSIDE the `!app.isPackaged` conditional gate (regex-scoped extraction).
6. `src/main/windows/main.ts` source for the `auth:start-flow` IPC handler calls `validateSender(event)` AND uses `event.sender.send("auth:error", ...)` (validated-sender-targeted, not broadcast).
7. `.env.example` contains the substrings `MAIN_VITE_ENTRA_CLIENT_ID`, `MAIN_VITE_ENTRA_TENANT_ID`, AND `MAIN_VITE_ENTERPRISE_AUTH_ENABLED` within 10 lines of each other (coherent block).
8. `src/renderer/login.html` contains: `viewBox="0 0 400 400"`, a path beginning `"M358.333"`, `aria-label="1Code logo"`, `class="logo-path"`, `id="authError"`, `role="alert"`, `aria-live="assertive"`. Does NOT contain: `viewBox="0 0 560 560"`, path beginning `"M560 560H0V0"`, OR the unsafe HTML-set property name (XSS-safety assertion within the file).
9. `src/preload/index.ts` contains `onAuthError`. `src/preload/index.d.ts` contains `onAuthError` AND an `AuthError` discriminated union type declaration.

#### Scenario: Login-flow guard passes on compliant codebase

- **WHEN** `bun test tests/regression/login-flow-uses-msal.test.ts` runs against the compliant codebase
- **THEN** all 9 assertions pass

#### Scenario: Reintroduction of dead URL is rejected

- **WHEN** a contributor adds back a literal `"/auth/desktop?auto=true"` substring anywhere in `src/main/`
- **THEN** assertion 3 SHALL fail with the offending file path

#### Scenario: Reintroduction of legacy SVG geometry is rejected

- **WHEN** a contributor reintroduces `viewBox="0 0 560 560"` or a path beginning `"M560 560H0V0"` in `src/renderer/login.html`
- **THEN** assertion 8 SHALL fail with the offending substring identified
