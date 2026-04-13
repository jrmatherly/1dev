## ADDED Requirements

### Requirement: signedFetch URL allowlist
The main process `api:signed-fetch` and `api:stream-fetch` IPC handlers SHALL validate the destination URL origin against an allowlist before attaching authentication tokens and executing the fetch. URLs not matching the allowlist SHALL be rejected with an error, not silently dropped.

#### Scenario: Fetch to configured API origin succeeds
- **WHEN** renderer calls signedFetch with a URL whose origin matches `getApiUrl()`
- **THEN** the fetch proceeds with the auth token attached and returns the response

#### Scenario: Fetch to unauthorized origin is blocked
- **WHEN** renderer calls signedFetch with a URL whose origin does NOT match the allowlist
- **THEN** the handler throws an error with a message identifying the blocked origin
- **THEN** no auth token is sent to the unauthorized origin

#### Scenario: Custom API URL is respected
- **WHEN** `MAIN_VITE_API_URL` is set to a custom origin (e.g., `https://internal.example.com`)
- **THEN** the allowlist includes the custom origin instead of the default `https://apollosai.dev`

#### Scenario: Regression guard enforces allowlist
- **WHEN** `tests/regression/signed-fetch-allowlist.test.ts` runs
- **THEN** it verifies that the signedFetch IPC handler contains URL origin validation before the fetch call

### Requirement: shell.openExternal scheme validation
All `shell.openExternal()` calls SHALL use a centralized `safeOpenExternal()` utility that restricts URL schemes to `https:`, `http:`, and `mailto:`. Direct calls to `shell.openExternal()` outside the utility module SHALL be forbidden.

#### Scenario: HTTPS URL opens successfully
- **WHEN** `safeOpenExternal("https://example.com")` is called
- **THEN** the URL opens in the default browser

#### Scenario: Dangerous scheme is blocked
- **WHEN** `safeOpenExternal("file:///etc/passwd")` is called
- **THEN** an error is thrown with a message identifying the blocked scheme

#### Scenario: Custom protocol is blocked
- **WHEN** `safeOpenExternal("myapp://callback")` is called
- **THEN** an error is thrown

#### Scenario: No direct shell.openExternal calls
- **WHEN** `tests/regression/open-external-scheme.test.ts` runs
- **THEN** it verifies that no file in `src/main/` imports `shell.openExternal` except `safe-external.ts`

### Requirement: CSP unsafe-eval removal
The Content Security Policy SHALL NOT include `'unsafe-eval'` when PostHog analytics are not configured (no `VITE_POSTHOG_KEY` env var). When PostHog is configured, `'unsafe-eval'` MAY be included only for the PostHog script sources.

#### Scenario: No PostHog — strict CSP
- **WHEN** `VITE_POSTHOG_KEY` is not set
- **THEN** the CSP `script-src` directive does NOT include `'unsafe-eval'`

#### Scenario: PostHog configured — eval permitted for PostHog only
- **WHEN** `VITE_POSTHOG_KEY` is set
- **THEN** the CSP `script-src` includes `'unsafe-eval'` scoped to PostHog domains

### Requirement: Electron sandbox evaluation
The Electron BrowserWindow configuration SHALL be evaluated for `sandbox: true` compatibility with the current version of `trpc-electron`. If compatible, `sandbox: true` SHALL be enabled.

#### Scenario: Sandbox compatibility test
- **WHEN** BrowserWindow is configured with `sandbox: true` and `trpc-electron` IPC is used
- **THEN** all tRPC procedures remain callable from the renderer
- **THEN** the preload script loads successfully with contextIsolation
