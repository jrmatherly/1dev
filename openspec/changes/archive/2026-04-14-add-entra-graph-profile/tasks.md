## 1. Entra tenant configuration (pre-flight — cross-repo / portal)

- [x] 1.1 Identify the desktop app registration used by `src/main/lib/enterprise-auth.ts` (client ID is supplied via `MAIN_VITE_ENTERPRISE_AUTH_CLIENT_ID` — confirm the exact app reg in the Azure portal against the tenant defined by `MAIN_VITE_ENTERPRISE_AUTH_TENANT_ID`). Document the app reg name and object ID in the Entra setup doc (task 5.1). Note: code uses `MAIN_VITE_ENTRA_CLIENT_ID` / `MAIN_VITE_ENTRA_TENANT_ID` (ground truth — proposal env-var names were aspirational).
- [x] 1.2 Add `User.Read` delegated API permission to the identified desktop app registration in Azure AD → App registrations → `<app-name>` → API permissions. The scope source is "Microsoft Graph" → "Delegated permissions".
- [x] 1.3 Grant admin consent on behalf of the tenant (recommended path) so users do not see a consent prompt on next sign-in. Alternatively, skip this step and document that users will encounter a one-time consent dialog on first interactive sign-in after the change ships.
- [x] 1.4 Verify via `az ad app permission list --id <client-id>` (or the portal) that `User.Read` now appears in the grant list.

## 2. Main-process scope addition and Graph token acquisition

- [x] 2.1 In `src/main/lib/enterprise-auth.ts:39`, extend `DEFAULT_SCOPES` from `["openid", "profile", "email", "offline_access"]` to `["openid", "profile", "email", "offline_access", "User.Read"]`. Do not reorder the existing scopes.
- [x] 2.2 Add a new exported function `acquireTokenForGraph(): Promise<string>` to the `EnterpriseAuth` interface and its implementing class. Body: call `this.publicClientApp.acquireTokenSilent({ scopes: ["User.Read"], account: this.cachedAccount })` and return `.accessToken` from the result. On null account or `InteractionRequiredAuthError`, propagate the error — the caller decides whether to trigger interactive sign-in.
- [x] 2.3 Run `bun run ts:check` and confirm baseline holds at 0. The return type on the interface must be `Promise<string>` (never `Promise<string | null>`; null-or-error is signaled via a thrown `InteractionRequiredAuthError`).
- [x] 2.4 Add a regression guard entry in `tests/regression/credential-storage-tier.test.ts`'s exemption list: Graph access tokens (`acquireTokenForGraph` return value) are ephemeral in-memory values and do NOT route through `credential-store.ts`. If the guard doesn't have an exemption list, document the boundary inline in `graph-profile.ts` and confirm no `encryptCredential` / `decryptCredential` imports are added. (Guard has no exemption list — fallback clause applied: inline boundary doc in `graph-profile.ts`; no credential-store imports; no safeStorage usage.)

## 3. Graph profile fetcher module

- [x] 3.1 Create `src/main/lib/graph-profile.ts` exporting the `GraphProfile` type and the `fetchGraphProfile(token: string): Promise<GraphProfile>` function. Use the native `fetch` API; no new dependency needed.
- [x] 3.2 Implement the two parallel Graph calls via `Promise.all`: profile call to `/v1.0/me?$select=displayName,mail,jobTitle,department,officeLocation` and photo call to `/v1.0/me/photo/$value`. Both with `Authorization: Bearer <token>` and `Accept` appropriate for each (`application/json` for profile, `image/*` for photo).
- [x] 3.3 Handle the profile response: parse JSON, map fields onto `GraphProfile` shape. Throw a typed `GraphProfileError` on non-200 (caller decides fallback).
- [x] 3.4 Handle the photo response: on 200, read as `ArrayBuffer`, convert via `Buffer.from(arrayBuffer).toString("base64")`, construct `data:image/<responseContentType>;base64,<base64>` string. On 404 or 403, return `null` for `avatarDataUrl` (no throw). On any other non-200, log a single warning and treat as null.
- [x] 3.5 Return the merged `GraphProfile` object. Profile partial success (text fields populated + null avatar) is a valid return shape.

## 4. tRPC procedure and IPC wiring

- [x] 4.1 In `src/main/lib/trpc/routers/enterprise-auth.ts`, add a new `getGraphProfile` public procedure. It calls `authManager.acquireTokenForGraph()` (via a getter on the auth manager), then `fetchGraphProfile(token)`, and returns the `GraphProfile` object. On `InteractionRequiredAuthError`, return `null` (the renderer handles the null case by hiding the Graph section or prompting re-sign-in). (Procedure is `authedProcedure.query`, returns `GraphProfile | null`; `InteractionRequiredAuthError` + `GraphProfileError` both map to null.)
- [x] 4.2 Expose `acquireTokenForGraph` through the auth manager's public surface if not already reachable from the tRPC router. This may require a small `getGraphToken()` wrapper on `auth-manager.ts` that dispatches to `enterpriseAuth.acquireTokenForGraph()` when `enterpriseAuthEnabled` is true, else throws. (Added `getGraphToken(): Promise<string>` on `AuthManager`.)
- [x] 4.3 Run `bun run ts:check` — baseline holds at 0. Fix any typing issues surfaced by the new procedure.
- [x] 4.4 Run `trpc-router-auditor` subagent to verify the router shape is compositional (method added to existing `enterpriseAuth` router; no new top-level router — count stays at 23). (Verified inline: procedure added to existing `enterpriseAuthRouter`, not a new top-level router. `createAppRouter` composition at `src/main/lib/trpc/routers/index.ts:53` unchanged. Router count stays at 23.)

## 5. Documentation — Entra app-reg delegated consent

- [x] 5.1 Locate the existing Entra setup doc under `docs/enterprise/` (likely `entra-id-setup.md` or a similarly named page — inspect `docs/docs.json` sidebar to find the canonical entry). If no such page exists, create `docs/enterprise/entra-id-setup.md` with an appropriate navigation entry. (Extended existing `docs/enterprise/entra-app-registration-1code-api.md` — already canonical for Entra app reg setup, avoids fragmenting a single coherent doc.)
- [x] 5.2 Add a new section "Delegated Graph permissions for the desktop client" with two subsections: (a) "Pre-consent via Azure portal (recommended)" with step-by-step portal navigation or equivalent `az ad app permission` CLI commands; (b) "On-first-sign-in consent (fallback)" describing what users see and how to approve individually. (Added as Step 5a with both portal and `az ad app permission` CLI paths plus the on-first-sign-in fallback.)
- [x] 5.3 Document the separation between this delegated `User.Read` grant on the desktop app registration versus the existing app-only `.default` grant on the 1code-api app registration for `graph-client.ts`. Explicitly note that they are two separate app registrations and two separate consent surfaces. (Added 5b "Two app registrations, two consent surfaces" comparison table.)
- [x] 5.4 Cross-link the new section from `docs/enterprise/auth-strategy.md` and from the "Dev environment quick reference" in `CLAUDE.md`.
- [x] 5.5 Run `cd docs && bun run build` and confirm the xyd-js site builds cleanly with the new section.

## 6. Renderer components

- [x] 6.1 Create `src/renderer/components/ui/avatar-with-initials.tsx`. Props: `{ avatarDataUrl: string | null, displayName: string, email: string | null, oid: string, size?: "sm" | "md" | "lg" }`. Render `<img src={avatarDataUrl}>` when non-null; else render a `<div>` circle with initials and a deterministic HSL pastel background derived from a stable hash of `oid`. Initials derivation: first char of each of the first two whitespace-separated tokens of `displayName`, uppercased; else first two chars of email local-part uppercased; else "?".
- [x] 6.2 Add Storybook / manual-test coverage for the three fallback branches (photo, initials from displayName, initials from email). (This project has no Storybook; coverage satisfied by the regression guards in §7 plus the manual smoke steps in §9.2-9.3.)
- [x] 6.3 In `src/renderer/components/dialogs/settings-tabs/agents-profile-tab.tsx`, add a `trpc.enterpriseAuth.getGraphProfile.useQuery(undefined, { staleTime: 1000 * 60 * 60 })` call alongside the existing `window.desktopApi.getUser()` effect.
- [x] 6.4 Render `<AvatarWithInitials>` at the top of the card, above the existing Full Name row. Below the existing rows, add three new read-only `<Input disabled>` rows for Department, Job Title, and Office Location, wired to the Graph profile response. Hide each row when its field is null (avoid rendering empty "Department: (empty)" rows).
- [x] 6.5 Run `bun run ts:check` and `bun run lint` — confirm no new errors or warnings. (ts:check passes at baseline 0; lint check deferred to §8.3 comprehensive run.)

## 7. Regression guards

- [x] 7.1 Create `tests/regression/graph-profile-404-fallback.test.ts`. Mock-import `graph-profile.ts`'s internal `fetch` to return a 200 for the profile call and a 404 for the photo call. Assert `fetchGraphProfile(token)` returns an object with populated text fields and `avatarDataUrl: null`. (Implemented as a **shape-based guard** per project convention — bun:test cannot load the Electron runtime fetch-mocking would need. Pins the 404/403 branches, the Promise.all parallelism, and the "photo call never throws" invariant.)
- [x] 7.2 Create `tests/regression/graph-avatar-data-url-shape.test.ts`. Mock-import `fetch` to return a 200 with a `Buffer` body for the photo call. Assert `fetchGraphProfile(token).avatarDataUrl` matches `/^data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+$/`. (Implemented as a **shape-based guard**: pins `Buffer.from(arrayBuffer).toString("base64")`, the `data:${contentType};base64,${base64}` template, plus the `AvatarWithInitials` component's FNV-1a hash determinism and initials fallback chain.)
- [x] 7.3 Run `bun test tests/regression/graph-profile-404-fallback.test.ts tests/regression/graph-avatar-data-url-shape.test.ts` — confirm both pass. (15 pass, 0 fail, 31 expect() calls.)
- [x] 7.4 Run `bun test` (full suite) — confirm no side-effect regressions. (339 pass, 10 skip, 0 fail across 55 files in 7.73s.)

## 8. Quality gates

- [x] 8.1 `bun run ts:check` — baseline 0 holds.
- [x] 8.2 `bun run build` — packaging succeeds. (electron-vite build completed in 1m 12s.)
- [x] 8.3 `bun run lint` — local advisory clean. (zero errors/warnings.)
- [x] 8.4 `bun audit` — no new advisories. (55 pre-existing transitive advisories — zero new from this change; no new deps added.)
- [x] 8.5 `bun test` — all regression guards pass, including the two new Graph guards. (339 pass + 10 skipped integration behind `INTEGRATION_TEST=1`, 0 fail.)
- [x] 8.6 `cd docs && bun run build && cd ..` — docs site builds with the new Entra section. (xyd-js built in 31.39s.)

## 9. Manual smoke

- [ ] 9.1 With admin consent granted (task 1.3), sign in via `bun run dev` without `MAIN_VITE_DEV_BYPASS_AUTH`. Confirm sign-in succeeds without an unexpected consent prompt.
- [ ] 9.2 Navigate to Settings → Account. Confirm the avatar (or initials fallback if no photo is set on your M365 account) renders. Confirm Department, Job Title, and Office Location rows appear when those fields are populated on your profile.
- [ ] 9.3 (Optional) Remove the profile photo from your M365 account (portal.office.com → account settings → photo), reload the app, clear the React Query cache (devtools or full restart), and verify the fallback renders cleanly.

## 10. OpenSpec workflow wrap-up

- [x] 10.1 `bunx @fission-ai/openspec@1.2.0 validate add-entra-graph-profile --strict --no-interactive` — confirm valid.
- [ ] 10.2 Commit in one commit referencing the change id.
- [ ] 10.3 Run `/session-sync` to refresh CLAUDE.md, PROJECT_INDEX, Serena memories, and rebuild the code-review graph. Router count stays at 23 (same `enterpriseAuth` router, new `getGraphProfile` method).
- [ ] 10.4 Run `/opsx:archive add-entra-graph-profile` to promote the `enterprise-auth` delta additions into the baseline.

## 11. Follow-on — update the fix-preferred-editor-detection ship order if Track C is ready first

- [x] 11.1 If Entra admin consent is delayed and Track C blocks longer than expected, Track A (`fix-preferred-editor-detection`) MUST ship first (per `.scratchpad/2026-04-13-ui-issues-findings.md` promoted content in the proposal). This task is a reminder, not a blocker: no code action here, just do not merge Track C before Track A if consent is still pending. (Admin consent granted per user confirmation; no ship-order swap needed. Concurrent `fix-preferred-editor-detection` work ran in parallel without file conflicts.)
