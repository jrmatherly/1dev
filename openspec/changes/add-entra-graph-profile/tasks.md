## 1. Entra tenant configuration (pre-flight — cross-repo / portal)

- [ ] 1.1 Identify the desktop app registration used by `src/main/lib/enterprise-auth.ts` (client ID is supplied via `MAIN_VITE_ENTERPRISE_AUTH_CLIENT_ID` — confirm the exact app reg in the Azure portal against the tenant defined by `MAIN_VITE_ENTERPRISE_AUTH_TENANT_ID`). Document the app reg name and object ID in the Entra setup doc (task 5.1).
- [ ] 1.2 Add `User.Read` delegated API permission to the identified desktop app registration in Azure AD → App registrations → `<app-name>` → API permissions. The scope source is "Microsoft Graph" → "Delegated permissions".
- [ ] 1.3 Grant admin consent on behalf of the tenant (recommended path) so users do not see a consent prompt on next sign-in. Alternatively, skip this step and document that users will encounter a one-time consent dialog on first interactive sign-in after the change ships.
- [ ] 1.4 Verify via `az ad app permission list --id <client-id>` (or the portal) that `User.Read` now appears in the grant list.

## 2. Main-process scope addition and Graph token acquisition

- [ ] 2.1 In `src/main/lib/enterprise-auth.ts:39`, extend `DEFAULT_SCOPES` from `["openid", "profile", "email", "offline_access"]` to `["openid", "profile", "email", "offline_access", "User.Read"]`. Do not reorder the existing scopes.
- [ ] 2.2 Add a new exported function `acquireTokenForGraph(): Promise<string>` to the `EnterpriseAuth` interface and its implementing class. Body: call `this.publicClientApp.acquireTokenSilent({ scopes: ["User.Read"], account: this.cachedAccount })` and return `.accessToken` from the result. On null account or `InteractionRequiredAuthError`, propagate the error — the caller decides whether to trigger interactive sign-in.
- [ ] 2.3 Run `bun run ts:check` and confirm baseline holds at 0. The return type on the interface must be `Promise<string>` (never `Promise<string | null>`; null-or-error is signaled via a thrown `InteractionRequiredAuthError`).
- [ ] 2.4 Add a regression guard entry in `tests/regression/credential-storage-tier.test.ts`'s exemption list: Graph access tokens (`acquireTokenForGraph` return value) are ephemeral in-memory values and do NOT route through `credential-store.ts`. If the guard doesn't have an exemption list, document the boundary inline in `graph-profile.ts` and confirm no `encryptCredential` / `decryptCredential` imports are added.

## 3. Graph profile fetcher module

- [ ] 3.1 Create `src/main/lib/graph-profile.ts` exporting the `GraphProfile` type and the `fetchGraphProfile(token: string): Promise<GraphProfile>` function. Use the native `fetch` API; no new dependency needed.
- [ ] 3.2 Implement the two parallel Graph calls via `Promise.all`: profile call to `/v1.0/me?$select=displayName,mail,jobTitle,department,officeLocation` and photo call to `/v1.0/me/photo/$value`. Both with `Authorization: Bearer <token>` and `Accept` appropriate for each (`application/json` for profile, `image/*` for photo).
- [ ] 3.3 Handle the profile response: parse JSON, map fields onto `GraphProfile` shape. Throw a typed `GraphProfileError` on non-200 (caller decides fallback).
- [ ] 3.4 Handle the photo response: on 200, read as `ArrayBuffer`, convert via `Buffer.from(arrayBuffer).toString("base64")`, construct `data:image/<responseContentType>;base64,<base64>` string. On 404 or 403, return `null` for `avatarDataUrl` (no throw). On any other non-200, log a single warning and treat as null.
- [ ] 3.5 Return the merged `GraphProfile` object. Profile partial success (text fields populated + null avatar) is a valid return shape.

## 4. tRPC procedure and IPC wiring

- [ ] 4.1 In `src/main/lib/trpc/routers/enterprise-auth.ts`, add a new `getGraphProfile` public procedure. It calls `authManager.acquireTokenForGraph()` (via a getter on the auth manager), then `fetchGraphProfile(token)`, and returns the `GraphProfile` object. On `InteractionRequiredAuthError`, return `null` (the renderer handles the null case by hiding the Graph section or prompting re-sign-in).
- [ ] 4.2 Expose `acquireTokenForGraph` through the auth manager's public surface if not already reachable from the tRPC router. This may require a small `getGraphToken()` wrapper on `auth-manager.ts` that dispatches to `enterpriseAuth.acquireTokenForGraph()` when `enterpriseAuthEnabled` is true, else throws.
- [ ] 4.3 Run `bun run ts:check` — baseline holds at 0. Fix any typing issues surfaced by the new procedure.
- [ ] 4.4 Run `trpc-router-auditor` subagent to verify the router shape is compositional (method added to existing `enterpriseAuth` router; no new top-level router — count stays at 23).

## 5. Documentation — Entra app-reg delegated consent

- [ ] 5.1 Locate the existing Entra setup doc under `docs/enterprise/` (likely `entra-id-setup.md` or a similarly named page — inspect `docs/docs.json` sidebar to find the canonical entry). If no such page exists, create `docs/enterprise/entra-id-setup.md` with an appropriate navigation entry.
- [ ] 5.2 Add a new section "Delegated Graph permissions for the desktop client" with two subsections: (a) "Pre-consent via Azure portal (recommended)" with step-by-step portal navigation or equivalent `az ad app permission` CLI commands; (b) "On-first-sign-in consent (fallback)" describing what users see and how to approve individually.
- [ ] 5.3 Document the separation between this delegated `User.Read` grant on the desktop app registration versus the existing app-only `.default` grant on the 1code-api app registration for `graph-client.ts`. Explicitly note that they are two separate app registrations and two separate consent surfaces.
- [ ] 5.4 Cross-link the new section from `docs/enterprise/auth-strategy.md` and from the "Dev environment quick reference" in `CLAUDE.md`.
- [ ] 5.5 Run `cd docs && bun run build` and confirm the xyd-js site builds cleanly with the new section.

## 6. Renderer components

- [ ] 6.1 Create `src/renderer/components/ui/avatar-with-initials.tsx`. Props: `{ avatarDataUrl: string | null, displayName: string, email: string | null, oid: string, size?: "sm" | "md" | "lg" }`. Render `<img src={avatarDataUrl}>` when non-null; else render a `<div>` circle with initials and a deterministic HSL pastel background derived from a stable hash of `oid`. Initials derivation: first char of each of the first two whitespace-separated tokens of `displayName`, uppercased; else first two chars of email local-part uppercased; else "?".
- [ ] 6.2 Add Storybook / manual-test coverage for the three fallback branches (photo, initials from displayName, initials from email).
- [ ] 6.3 In `src/renderer/components/dialogs/settings-tabs/agents-profile-tab.tsx`, add a `trpc.enterpriseAuth.getGraphProfile.useQuery(undefined, { staleTime: 1000 * 60 * 60 })` call alongside the existing `window.desktopApi.getUser()` effect.
- [ ] 6.4 Render `<AvatarWithInitials>` at the top of the card, above the existing Full Name row. Below the existing rows, add three new read-only `<Input disabled>` rows for Department, Job Title, and Office Location, wired to the Graph profile response. Hide each row when its field is null (avoid rendering empty "Department: (empty)" rows).
- [ ] 6.5 Run `bun run ts:check` and `bun run lint` — confirm no new errors or warnings.

## 7. Regression guards

- [ ] 7.1 Create `tests/regression/graph-profile-404-fallback.test.ts`. Mock-import `graph-profile.ts`'s internal `fetch` to return a 200 for the profile call and a 404 for the photo call. Assert `fetchGraphProfile(token)` returns an object with populated text fields and `avatarDataUrl: null`.
- [ ] 7.2 Create `tests/regression/graph-avatar-data-url-shape.test.ts`. Mock-import `fetch` to return a 200 with a `Buffer` body for the photo call. Assert `fetchGraphProfile(token).avatarDataUrl` matches `/^data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+$/`.
- [ ] 7.3 Run `bun test tests/regression/graph-profile-404-fallback.test.ts tests/regression/graph-avatar-data-url-shape.test.ts` — confirm both pass.
- [ ] 7.4 Run `bun test` (full suite) — confirm no side-effect regressions.

## 8. Quality gates

- [ ] 8.1 `bun run ts:check` — baseline 0 holds.
- [ ] 8.2 `bun run build` — packaging succeeds.
- [ ] 8.3 `bun run lint` — local advisory clean.
- [ ] 8.4 `bun audit` — no new advisories.
- [ ] 8.5 `bun test` — all regression guards pass, including the two new Graph guards.
- [ ] 8.6 `cd docs && bun run build && cd ..` — docs site builds with the new Entra section.

## 9. Manual smoke

- [ ] 9.1 With admin consent granted (task 1.3), sign in via `bun run dev` without `MAIN_VITE_DEV_BYPASS_AUTH`. Confirm sign-in succeeds without an unexpected consent prompt.
- [ ] 9.2 Navigate to Settings → Account. Confirm the avatar (or initials fallback if no photo is set on your M365 account) renders. Confirm Department, Job Title, and Office Location rows appear when those fields are populated on your profile.
- [ ] 9.3 (Optional) Remove the profile photo from your M365 account (portal.office.com → account settings → photo), reload the app, clear the React Query cache (devtools or full restart), and verify the fallback renders cleanly.

## 10. OpenSpec workflow wrap-up

- [ ] 10.1 `bunx @fission-ai/openspec@1.2.0 validate add-entra-graph-profile --strict --no-interactive` — confirm valid.
- [ ] 10.2 Commit in one commit referencing the change id.
- [ ] 10.3 Run `/session-sync` to refresh CLAUDE.md, PROJECT_INDEX, Serena memories, and rebuild the code-review graph. Router count stays at 23 (same `enterpriseAuth` router, new `getGraphProfile` method).
- [ ] 10.4 Run `/opsx:archive add-entra-graph-profile` to promote the `enterprise-auth` delta additions into the baseline.

## 11. Follow-on — update the fix-preferred-editor-detection ship order if Track C is ready first

- [ ] 11.1 If Entra admin consent is delayed and Track C blocks longer than expected, Track A (`fix-preferred-editor-detection`) MUST ship first (per `.scratchpad/2026-04-13-ui-issues-findings.md` promoted content in the proposal). This task is a reminder, not a blocker: no code action here, just do not merge Track C before Track A if consent is still pending.
