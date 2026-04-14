## Why

The Account tab (Settings → Account in `src/renderer/components/dialogs/settings-tabs/agents-profile-tab.tsx`) shows only Full Name and Email for enterprise-auth users. No avatar, no department, no job title. Two reasons this matters:

1. **Visual identity parity with the rest of the Microsoft 365 / Teams / Outlook surface** — users expect to see their Entra profile photo in any app that's signed in with their work account. Its absence makes the app feel "less integrated" than its peers.
2. **`DesktopUser.imageUrl` is already plumbed end-to-end** through the preload IPC surface (`src/preload/index.ts:460`, `src/main/auth-store.ts:16`), the tRPC `getUser` endpoint, and the React state in `agents-profile-tab.tsx`. The value is hard-coded to `null` in `src/main/auth-manager.ts:86` because the Graph call was never wired — the field waits for this work.

The correct scope is "Graph profile display" — not just avatar. Fetching `/me?$select=displayName,mail,jobTitle,department,officeLocation` is one call; adding `/me/photo/$value` in parallel is a second call. Shipping the broader set in a single change (a) amortizes the Entra admin-consent cost of the `User.Read` delegated scope addition, (b) gives the Account tab meaningful density beyond a name and email, and (c) keeps the docs update (Entra app-registration setup instructions) to one PR.

The `User.Read` scope is NOT currently granted to the desktop Entra app registration; adding it triggers a one-time admin-consent prompt on next interactive sign-in (or can be pre-consented via the Azure portal). This is a coordination step the OpenSpec change must call out explicitly because it cannot be driven from code alone.

## What Changes

- **ADD** `"User.Read"` to `DEFAULT_SCOPES` in `src/main/lib/enterprise-auth.ts:39`. Existing refresh tokens remain valid; next interactive sign-in surfaces the consent prompt for the new scope.
- **ADD** a helper `acquireTokenForGraph()` in `enterprise-auth.ts` that calls `acquireTokenSilent({ scopes: ["User.Read"], account: cachedAccount })`. The returned access token is ephemeral, in-memory, and MUST NOT be passed through `credential-store.ts` (that tier is for persisted credentials; Graph access tokens are not persisted — MSAL's cache handles rotation).
- **ADD** a new main-process helper `src/main/lib/graph-profile.ts` exporting `fetchGraphProfile(token): Promise<GraphProfile>` where `GraphProfile = { displayName: string, mail: string | null, jobTitle: string | null, department: string | null, officeLocation: string | null, avatarDataUrl: string | null }`. Makes two parallel Graph calls: `/v1.0/me?$select=displayName,mail,jobTitle,department,officeLocation` and `/v1.0/me/photo/$value`. On 404/403 for the photo endpoint (no photo set, tenant policy hides photos), return `avatarDataUrl: null`. Convert the photo blob to a `data:image/jpeg;base64,...` URL for direct `<img src>` consumption.
- **ADD** a new tRPC procedure `enterpriseAuth.getGraphProfile` that wraps `fetchGraphProfile`. Lazy — the renderer calls it when the Account tab mounts. React Query `staleTime: 1h` avoids re-fetching on every tab open.
- **ADD** a reusable renderer component `src/renderer/components/ui/avatar-with-initials.tsx` that renders `<img src={avatarDataUrl}>` when present, or a circle with user initials on a deterministic pastel background derived from `oid` hash when `avatarDataUrl` is null. Follows the Teams / M365 standard initials-fallback pattern.
- **MODIFY** `src/renderer/components/dialogs/settings-tabs/agents-profile-tab.tsx` to render the avatar component at the top of the card, followed by the existing Full Name / Email rows, plus new read-only rows for Department, Job Title, and Office Location. Leverage the existing `useEffect` + `window.desktopApi.getUser()` flow plus a new `trpc.enterpriseAuth.getGraphProfile.useQuery()`.
- **MODIFY** `docs/enterprise/` Entra ID setup instructions with a new "Delegated Graph permissions for the desktop client" section documenting the one-time `User.Read` admin-consent step (Azure portal screenshots or CLI snippet). Cross-link from CLAUDE.md "Dev environment quick reference" and from the auth-strategy doc.
- **ADD** two regression guards: (a) `tests/regression/graph-profile-404-fallback.test.ts` — mock Graph returning 404 for the photo endpoint, assert `avatarDataUrl` is `null` and the initials fallback branch renders; (b) `tests/regression/graph-avatar-data-url-shape.test.ts` — mock Graph returning a photo blob, assert the helper produces a well-formed `data:image/...;base64,...` URL.

## Capabilities

### New Capabilities

None. This change scopes entirely within the existing `enterprise-auth` baseline capability (MSAL / Entra / scope management) plus renderer UI surface. Creating a new `entra-profile-display` capability would fragment the auth stratum unnecessarily.

### Modified Capabilities

- `enterprise-auth` — ADD two requirements: (a) `User.Read` is included in the default scope set so `acquireTokenForGraph()` can succeed silently after admin consent; (b) a documented `fetchGraphProfile` contract that defines the Graph API call, the 404/403 fallback to null, and the data URL shape of the avatar output. Neither modification affects the existing scenarios for token acquisition, cache persistence, or the `applyEnterpriseAuth()` `Promise<void>` contract — the additions are orthogonal to the core auth flow.

## Impact

**Affected code (main process):**
- `src/main/lib/enterprise-auth.ts:39` — `DEFAULT_SCOPES` extension; new `acquireTokenForGraph()` helper
- `src/main/lib/graph-profile.ts` — new file, ~80 lines (two Graph calls + blob→data URL conversion + error handling)
- `src/main/lib/trpc/routers/enterprise-auth.ts` — new `getGraphProfile` procedure

**Affected code (renderer):**
- `src/renderer/components/ui/avatar-with-initials.tsx` — new component, ~60 lines
- `src/renderer/components/dialogs/settings-tabs/agents-profile-tab.tsx:80-130` — add avatar and three read-only rows

**Affected code (preload / auth store):**
- No changes. `DesktopUser.imageUrl` already exists; the renderer populates from the lazy `getGraphProfile` query instead.

**New tests:**
- `tests/regression/graph-profile-404-fallback.test.ts`
- `tests/regression/graph-avatar-data-url-shape.test.ts`

**Dependencies:**
- None. MSAL Node already handles the token acquisition; native `fetch` handles Graph calls; native `Buffer.from(arrayBuf).toString("base64")` handles the data URL conversion.

**Cross-repo / cross-team coordination:**
- **Entra tenant admin consent** — `User.Read` delegated permission must be added to the desktop app registration in Azure AD portal OR granted ad-hoc on first interactive sign-in after this change ships. The server-side `services/1code-api/src/lib/graph-client.ts` uses app-only (client-credentials) flow with `.default` scope — this is a SEPARATE app registration and a SEPARATE consent surface. The two do not conflict but must both be maintained. Document this distinction in the Entra setup docs section.

**Docs:**
- `docs/enterprise/entra-id-setup.md` (or equivalent) — new section on delegated Graph permissions
- `docs/enterprise/auth-strategy.md` — cross-link to the new section
- `CLAUDE.md` — "Dev environment quick reference" gets a one-liner on the User.Read scope requirement

**APIs / systems:**
- No database schema change
- No spawn-env or Claude CLI env-var change
- No F-entry involvement (Graph is a Microsoft ecosystem dependency, not an `apollosai.dev` upstream call)

**CSP:**
- The existing `img-src 'self' data: blob: https:` in `src/renderer/index.html:8` already allows `data:` URLs. No CSP change required.

**Quality gates:**
- All 5 CI gates must pass; `bun run lint` advisory should stay clean
- `bun audit` — no new deps, no new advisories expected
- `cd docs && bun run build` — affected (new doc section); must pass
