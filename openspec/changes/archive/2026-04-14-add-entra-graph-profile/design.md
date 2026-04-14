## Context

The desktop Electron client uses MSAL Node (`@azure/msal-node` v5) in `src/main/lib/enterprise-auth.ts` to acquire Entra ID tokens for the LiteLLM / Envoy Gateway audience. Current `DEFAULT_SCOPES` at line 39: `["openid", "profile", "email", "offline_access"]`. These are the OpenID-standard scopes that populate `idTokenClaims` — which `adaptEnterpriseUser()` reads for displayName / email / oid. But they do NOT grant access to `graph.microsoft.com`.

The Account tab type `DesktopUser.imageUrl: string | null` has been plumbed through the IPC surface since the initial port, but `adaptEnterpriseUser()` hard-codes `imageUrl: null`. The infrastructure is ready for a Graph-sourced value; only the Graph call and the consent step are missing.

The server-side at `services/1code-api/src/lib/graph-client.ts:59` uses `["https://graph.microsoft.com/.default"]` with `acquireTokenByClientCredential` (app-only, no user context). That code path enumerates group membership for the authenticated user. The desktop client's new work is in the **delegated** (user-context) flow, which is a separate Entra app registration and a separate consent surface. They do not interact.

The CSP in `src/renderer/index.html:8` already allows `data: blob: https:` for `img-src`, so a Graph-returned photo blob can be rendered directly after base64 conversion.

Stakeholders:
- Entra tenant admin (one-time consent for the new scope on the desktop app registration)
- End users (see their profile photo after next sign-in)
- Docs consumers / new-developer onboarding (updated Entra setup page)

## Goals / Non-Goals

**Goals:**
- Populate `DesktopUser.imageUrl` (currently always null) with a Graph-sourced avatar when available.
- Render Department, Job Title, and Office Location as read-only fields in the Account tab.
- Fall back gracefully to user initials on a deterministic pastel background when no photo is available (404, 403, tenant policy).
- Keep the Graph access token in the main process only; never expose to renderer.
- Document the one-time admin-consent step for `User.Read` delegated permission.

**Non-Goals:**
- App-only Graph flow — already covered by `services/1code-api/src/lib/graph-client.ts` for group enumeration; out of scope here.
- Presence / Teams status / mailbox indicators — adjacent features, deferred.
- Manager / direct-reports hierarchy — deferred; add in a follow-up if requested.
- Profile editing — Account tab remains read-only for Graph-sourced fields.
- Persisting the avatar to the local database for offline rendering — React Query cache with `staleTime: 1h` is sufficient; rebuilding on app restart is acceptable.

## Decisions

### Decision 1 — Delegated `User.Read` scope on the desktop app registration, NOT `.default`

**Chosen:** Add only `"User.Read"` to `DEFAULT_SCOPES`. Keep it separate from the existing scopes rather than switching to `"https://graph.microsoft.com/.default"`.

**Alternatives considered:**
- `.default` scope — grants every statically-configured permission on the app registration. Works but is broader than needed and increases audit scope. The server-side uses `.default` because it's a trusted backend with many enumerated permissions; the desktop client is a user-facing PublicClientApplication where the principle of least privilege matters more.
- `User.ReadBasic.All` — readable by any user across the tenant, not just the signed-in user. Overkill for displaying the signed-in user's own profile.

**Why `User.Read`:** this is exactly the permission needed — read the signed-in user's own profile. Delegated (not application) scope. Admin consent is a one-time checkbox in the Azure portal. MSAL pairs it with the existing tokens via incremental consent — users who already authenticated will see a consent prompt on their next interactive sign-in for the new scope; existing refresh tokens remain valid for the scopes they already cover.

### Decision 2 — Lazy tRPC fetch from the Account tab, not eager on sign-in

**Chosen:** Add `enterpriseAuth.getGraphProfile` as a new tRPC procedure. The renderer calls it via `useQuery` when the Account tab mounts. React Query `staleTime: 1h` caches the result across tab opens within the session.

**Alternatives considered:**
- Eager fetch during sign-in (inside `adaptEnterpriseUser`) — adds 300-800ms to sign-in. Graph calls are subject to rate limiting and transient errors; failures would block the entire sign-in flow. Rejected.
- On-demand per UI element — too many round trips; every avatar render would re-fetch.

**Why lazy:** keeps sign-in fast, pays the Graph cost only when the user is actually looking at the Account tab, cache survives for a reasonable session duration. If the user navigates away and back, no re-fetch.

### Decision 3 — Single module `graph-profile.ts` with parallel Graph calls

**Chosen:** `fetchGraphProfile(token)` issues two Graph calls in parallel via `Promise.all`:
1. `GET https://graph.microsoft.com/v1.0/me?$select=displayName,mail,jobTitle,department,officeLocation` — returns ~500 bytes of JSON.
2. `GET https://graph.microsoft.com/v1.0/me/photo/$value` — returns a binary blob (or 404/403).

Both calls use `Authorization: Bearer <token>`. The profile call feeds the text fields; the photo call feeds the `avatarDataUrl`. Failures on either side don't cascade — the function returns partial data.

**Alternatives considered:**
- Batch endpoint `/v1.0/$batch` — one HTTP request, reduces connection overhead. Worth it only if we expect >3 Graph calls per mount. We don't.
- Sequential calls (profile then photo) — simpler error handling but adds round-trip latency.

**Why parallel single-module:** keeps the code path simple, avoids the batch-endpoint request envelope syntax, and lets each call fail independently with a sensible fallback.

### Decision 4 — Base64 data URL for avatar, converted in main process

**Chosen:** The main-process helper converts the photo blob to `data:image/jpeg;base64,<base64>` before returning to the renderer. The renderer binds directly: `<img src={avatarDataUrl}>`.

**Alternatives considered:**
- Stream the blob over IPC as a Buffer — requires IPC serialization of binary data and extra decode work in the renderer.
- Store the photo in a local file under `app.getPath("userData")` and return a `file://` URL — adds persistence concerns and an expiration story we don't want.
- Proxy via a localhost protocol handler — unnecessary complexity for a photo render.

**Why data URL:** CSP already allows it, React `<img src>` accepts it natively, survives cache serialization, no filesystem state. The base64 overhead (~33%) is negligible for a typical Teams-sized photo (< 50 KB).

### Decision 5 — Initials fallback using `oid`-hashed pastel background

**Chosen:** When `avatarDataUrl` is null, render a circle with the user's initials (first letters of the first two space-separated tokens of `displayName`) on a background color deterministically derived from `oid` hash → HSL pastel range.

**Alternatives considered:**
- Generic gray placeholder — feels unfinished.
- Gravatar lookup by email — leaks user email to a third party; privacy concern.
- A hand-picked palette rotated by name — less stable across sessions; users expect "the same color every time."

**Why `oid`-hashed pastel:** matches the M365 / Teams standard pattern, feels visually consistent with the user's own experience elsewhere, and the deterministic hash means the color stays stable across sessions and devices. The pastel range keeps text readable against the background without requiring dynamic contrast computation.

### Decision 6 — Document admin-consent as a Track C blocker in the Entra setup page

**Chosen:** Add a new section "Delegated Graph permissions for the desktop client" to the existing Entra setup doc (e.g., `docs/enterprise/entra-id-setup.md` if it exists, otherwise create it under `docs/enterprise/`). The section documents two paths:

1. **Pre-consent via Azure portal** (recommended for enterprise deployments): Admin grants `User.Read` delegated permission on the desktop app registration in advance; no end-user consent prompt.
2. **On-first-sign-in consent** (fallback for dev / trial): First interactive sign-in after this change ships surfaces a consent dialog for the new scope; individual users consent.

Both paths are valid; enterprise admins will typically pre-consent. Dev builds will encounter path 2 until the sandbox tenant is configured.

**Alternatives considered:**
- Skip the docs update and let users hit the consent prompt organically — unfriendly to enterprise admins who want to script their tenant setup.
- Put the docs in a new `docs/enterprise/graph-profile.md` — fragments the Entra surface across two pages.

**Why the single-section approach:** keeps all Entra setup in one place, documents both consent paths, cross-links cleanly from CLAUDE.md.

## Risks / Trade-offs

- **[Risk] Admin doesn't pre-consent; users get a surprise consent prompt on next sign-in** → Mitigation: documented in the Entra setup page; the prompt itself is safe to accept (it's the Microsoft first-party consent UI) but may surprise users. Mitigate further with a release note for enterprise admins one cycle ahead of the ship.

- **[Risk] Graph rate limiting on the `/me/photo` endpoint** → Mitigation: React Query `staleTime: 1h` + graceful 429/503 fallback to initials. A single user hitting `/me/photo` once per hour is well under any rate ceiling.

- **[Risk] Tenant policy hides photos via `/users` Graph policy** → Mitigation: 403 on the photo endpoint triggers the initials fallback; profile text fields still render. No user-visible error.

- **[Risk] User has no `displayName` set** → Mitigation: fall back to the email local-part for initials. If even that is missing (unlikely in enterprise Entra), fall back to a single "?" character.

- **[Risk] `oid` hash collision on small tenants** → Acceptable. Colors are cosmetic; a collision means two users see the same background. `oid` is 128 bits of entropy; collisions are not a real concern.

- **[Trade-off] Ships unsigned photo data over IPC** → accepted. The data is non-sensitive (user's own photo), the transport is local IPC (not network), and the CSP already scopes `img-src`. Standard Electron pattern.

- **[Trade-off] Adds one new tRPC procedure** → router count stays at 23 (same `enterpriseAuth` router, new method). No architecture drift.

## Migration Plan

**Pre-flight (cross-repo / Entra portal):**
1. Entra tenant admin adds `User.Read` delegated permission to the desktop app registration.
2. Admin grants consent on behalf of the tenant (recommended) — all users get the new scope silently on next sign-in.
3. Alternatively, users accept the consent dialog on first interactive sign-in after this change ships.

**Deploy:**
1. Land the change via normal PR flow; all 5 CI gates must pass.
2. First launch after upgrade: existing user sessions still work (refresh tokens remain valid for old scopes); new scope kicks in on next `acquireTokenSilent` call that includes it (`acquireTokenForGraph`).
3. Account tab displays avatar + 3 new fields on next open.

**Rollback:** revert the commit. Removing `User.Read` from `DEFAULT_SCOPES` does NOT require de-consent on the Entra side; unused scopes are harmless. The initials fallback takes over automatically since `getGraphProfile` then returns null values.

## Open Questions

1. Does the existing Entra setup doc live at `docs/enterprise/entra-id-setup.md` or a different path? Task 5.1 in `tasks.md` must locate and update the correct doc page. If no such page exists, create it.
2. Does the desktop app registration share a client ID with any other surface (1code-api, cluster components)? If yes, `User.Read` addition must be evaluated for cross-surface impact. Best checked by the implementer against the Entra tenant during task 1.1.
