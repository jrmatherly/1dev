# 1code-api-litellm-provisioning Specification

## Purpose
TBD - created by archiving change add-1code-api-litellm-provisioning. Update Purpose after archive.
## Requirements
### Requirement: Provisioning flow derives team membership from Entra security groups

The 1code-api SHALL expose a `POST /api/provision` endpoint that authenticates the current user via trusted Envoy Gateway headers (`x-user-oid`, `x-user-email`, `x-user-name`), resolves the user's Entra security group membership via Microsoft Graph, matches those groups against a `teams.yaml` configuration file to determine qualifying LiteLLM teams, and provisions the user into those teams in LiteLLM. The flow SHALL be idempotent: calling `POST /api/provision` for an already-provisioned active user SHALL return their existing state without creating duplicate LiteLLM resources or local DB rows.

#### Scenario: First-time user in a single authorized group provisions successfully

- **WHEN** an authenticated user with `oid = "abc-123"`, `email = "user@example.com"`, and Entra group membership `["f70ded09-fd52-4bc1-a024-be6bda9e39b3"]` calls `POST /api/provision` and the teams config has a team entry for that group
- **THEN** the API calls Microsoft Graph `/users/abc-123/memberOf`, resolves one qualifying team, idempotently creates the LiteLLM team via `/team/new` if not present, creates the LiteLLM user via `/user/new` with `user_id = "user@example.com"`, adds the user to the team via `/team/member_add`, generates an initial API key via `/key/generate`, inserts rows into `users` (with a newly-generated internal UUID `id`, `oid = req.user.oid`, `litellmUserId = "user@example.com"`, `isActive = true`), `user_team_memberships` (with `userId = users.id`), `provisioned_keys` (with `userId = users.id`), and `audit_log` via interleaved writes inside a single Drizzle transaction per Decision 8, and returns `{"user_id": "<uuid>", "litellm_user_id": "user@example.com", "teams_provisioned": [...], "keys_generated": [{ "key_id": "<uuid>", "key": "<raw>", ... }]}` with the raw key value shown once

#### Scenario: Already-provisioned active user re-calls provision is a per-team idempotent no-op

- **WHEN** an authenticated user whose `oid` already exists in the `users` table with `isActive = true` AND who already has an active `user_team_memberships` row AND an active `provisioned_keys` row for every team in `qualifyingTeams` calls `POST /api/provision`
- **THEN** the pre-flight read phase of the provisioning flow loads the existing memberships and active-key set from the DB, the execution phase iterates `qualifyingTeams` and short-circuits every team because the pre-flight sets already contain them, returns HTTP 200 with `{"user_id": "<existing-uuid>", "litellm_user_id": "<existing>", "teams_provisioned": [...all teams echoed...], "keys_generated": []}`, AND makes zero calls to `litellm.createTeam`, `litellm.addTeamMember`, or `litellm.generateKey` (verified by test assertion on mock call counts)

#### Scenario: Already-provisioned user newly added to a second qualifying Entra group gets incremental provisioning

- **WHEN** an authenticated already-provisioned user whose prior Graph response listed group `["team-A"]` now has a Graph response listing `["team-A", "team-B"]` and both are in `teams.yaml`
- **THEN** the pre-flight read phase sees the existing team-A membership and key, the execution phase short-circuits team-A (zero LiteLLM calls), then creates team-B in LiteLLM if not present, adds the user to team-B, generates a new initial key for team-B, inserts one new `user_team_memberships` row and one new `provisioned_keys` row, and returns a response with `teams_provisioned` containing both teams and `keys_generated` containing only the new team-B key

#### Scenario: Previously deprovisioned user attempts to re-provision

- **WHEN** an authenticated user whose `oid` exists in the `users` table with `isActive = false` and `deprovisionedAt` set calls `POST /api/provision`
- **THEN** the API returns HTTP 409 with `{"error": "User was deprovisioned; contact admin"}` and performs no provisioning actions

#### Scenario: User in multiple authorized groups gets multiple team memberships

- **WHEN** an authenticated user's Graph response lists group memberships for two groups both present in `teams.yaml`
- **THEN** the API creates both LiteLLM teams (if not already present), adds the user to both, generates one API key per team, and returns an array of two `keys_generated` entries

#### Scenario: User in no authorized groups is rejected

- **WHEN** an authenticated user whose Graph group memberships do not intersect with any team in `teams.yaml` (and `required_groups` is non-empty) calls `POST /api/provision`
- **THEN** the API returns HTTP 403 with `{"error": "Not in any authorized group"}` and performs no LiteLLM or DB writes

### Requirement: Provisioning status endpoint returns current user state

The 1code-api SHALL expose a `GET /api/provision/status` endpoint that returns the current provisioning state of the authenticated user, including whether they are provisioned, their user summary, team list, and active key count, without making any external API calls.

#### Scenario: Provisioned user queries status

- **WHEN** an authenticated provisioned user calls `GET /api/provision/status`
- **THEN** the API returns `{"provisioned": true, "user": {oid, email, display_name, litellm_user_id, is_active, created_at}, "teams": [{team_id, team_alias}, ...], "key_count": N}` where N is the count of active keys owned by the user

#### Scenario: Unprovisioned user queries status

- **WHEN** an authenticated user with no row in the `users` table calls `GET /api/provision/status`
- **THEN** the API returns `{"provisioned": false, "user": null, "teams": [], "key_count": 0}`

### Requirement: API key list endpoint splits active and revoked keys with five derived statuses

The 1code-api SHALL expose a `GET /api/keys` endpoint that returns the authenticated user's API keys split into `active` and `revoked` arrays, each entry containing id, masked preview, team reference, status, timestamps, and days-until-expiry. The `status` field SHALL be one of five values — `"active"`, `"expiring_soon"`, `"expired"`, `"revoked"`, `"rotated"` — derived at read time from `(persisted_status, portal_expires_at, now)` per Decision 9. The persisted `provisioned_keys.status` column SHALL only ever hold `"active"`, `"revoked"`, or `"rotated"` — the values `"expired"` and `"expiring_soon"` SHALL never be written to the database.

#### Scenario: User with active, expiring-soon, and rotated keys

- **WHEN** an authenticated user has three keys — one with persisted status `active` and `days_until_expiry = 45`, one with persisted status `active` and `days_until_expiry = 10`, one with persisted status `rotated` — and calls `GET /api/keys`
- **THEN** the API returns `{"active": [<entry with status="active">, <entry with status="expiring_soon">], "revoked": [<entry with status="rotated">]}` where each entry has fields `id`, `key_alias`, `key_preview`, `team_id`, `team_alias`, `status`, `created_at`, `expires_at`, `days_until_expiry`, `last_spend`

#### Scenario: Active key within the 14-day warning window shows expiring_soon status

- **WHEN** an authenticated user has a key with persisted `status = "active"` and `portal_expires_at` such that `0 < days_until_expiry <= 14`
- **THEN** the response entry for that key has `status = "expiring_soon"`, `days_until_expiry` is the actual remaining days count (a positive integer between 1 and 14 inclusive), AND the key appears in the `active` array, not the `revoked` array

#### Scenario: Boundary check — exactly 14 days until expiry is expiring_soon, 15 days is active

- **WHEN** an authenticated user has two active keys, one with `days_until_expiry = 14` and one with `days_until_expiry = 15`
- **THEN** the first key's response entry has `status = "expiring_soon"` and the second key's response entry has `status = "active"`

#### Scenario: Active key past its expiry date shows expired status

- **WHEN** an authenticated user has a key with persisted `status = "active"` but `portal_expires_at < now()` (not yet rotated by the cron)
- **THEN** the response entry for that key has `status = "expired"`, `days_until_expiry = 0`, AND the key appears in the `active` array (so the desktop app can surface a "rotation pending" warning)

#### Scenario: Derived status values are never persisted to the database

- **WHEN** the deprovisioning cron, rotation cron, and all API handlers execute any write against the `provisioned_keys.status` column
- **THEN** the value written is one of `"active"`, `"revoked"`, or `"rotated"` — never `"expired"` or `"expiring_soon"` — enforced at the TypeScript type level by a separate `PersistedKeyStatus` union type distinct from the full `KeyStatus` union

### Requirement: API key creation on a specific team

The 1code-api SHALL expose a `POST /api/keys/new` endpoint that accepts a `team_id` in the request body, validates the user is a member of that team, generates a new LiteLLM key with an alias derived from the user's email and the team's slug, and returns the raw key value (shown once).

#### Scenario: Member creates a second key on their team

- **WHEN** an authenticated user who is already a member of team `team-1` calls `POST /api/keys/new` with body `{"team_id": "team-1"}`
- **THEN** the API generates a new LiteLLM key via `/key/generate`, inserts a new row into `provisioned_keys` with a computed alias `{emailPrefix}-{teamSlug}` (with a uuid suffix if a collision exists), and returns the raw key value in the response

#### Scenario: Non-member attempts to create a key on a team they do not belong to

- **WHEN** an authenticated user calls `POST /api/keys/new` with a `team_id` they are not a member of
- **THEN** the API returns HTTP 403 with `{"error": "Not a member of this team"}` and does not generate a key

### Requirement: API key rotation preserves audit trail

The 1code-api SHALL expose a `POST /api/keys/:keyId/rotate` endpoint that deletes the old key in LiteLLM, marks the old key `status = "rotated"`, generates a new key with the same team and model list, and links the new key to the old one via `rotatedFromId`. The endpoint SHALL only accept keys owned by the authenticated user and in `status = "active"`.

#### Scenario: User rotates their active key

- **WHEN** an authenticated user calls `POST /api/keys/:keyId/rotate` for a key they own with `status = "active"`
- **THEN** the API calls `litellm.deleteKey` for the old key, updates the old key row with `status = "rotated"` and `revoked_at = now()`, generates a new key via `litellm.generateKey` with the same team and models, inserts a new row with `rotatedFromId = oldKey.id`, writes an audit entry, and returns `{old_key_id, new_key_id, new_key, new_key_alias, portal_expires_at}`

#### Scenario: User attempts to rotate a key they do not own

- **WHEN** an authenticated user calls `POST /api/keys/:keyId/rotate` for a key owned by a different user
- **THEN** the API returns HTTP 404 with `{"error": "Key not found"}` (not 403, to avoid leaking the existence of other users' keys)

#### Scenario: User attempts to rotate an already-rotated key

- **WHEN** an authenticated user calls `POST /api/keys/:keyId/rotate` for a key they own with `status = "rotated"`
- **THEN** the API returns HTTP 409 with `{"error": "Can only rotate active keys"}`

### Requirement: API key revocation is immediate and irreversible

The 1code-api SHALL expose a `POST /api/keys/:keyId/revoke` endpoint that deletes the key in LiteLLM and marks the row `status = "revoked"` with `revoked_at = now()`. The endpoint SHALL only accept keys owned by the authenticated user and in `status = "active"`.

#### Scenario: User revokes their active key

- **WHEN** an authenticated user calls `POST /api/keys/:keyId/revoke` for an active key they own
- **THEN** the API calls `litellm.deleteKey`, updates the row to `status = "revoked"` and `revoked_at = now()`, writes an audit entry, and returns `{key_id, revoked_at}`

#### Scenario: Revoked keys remain visible in /api/keys history

- **WHEN** a user who has revoked one of their keys calls `GET /api/keys`
- **THEN** the revoked key appears in the `revoked` array of the response with `status = "revoked"`, preserving the audit trail

### Requirement: Deprovisioning cron runs every six hours and removes users no longer in authorized Entra groups

The 1code-api SHALL run a background cron job every six hours that iterates all active users in the `users` table, queries Microsoft Graph for each user's current group membership, and deprovisions any user whose groups no longer qualify them under the `teams.yaml` configuration. Deprovisioning SHALL delete all the user's active LiteLLM keys, mark their keys `status = "revoked"`, mark the user `isActive = false` and `deprovisionedAt = now()`, and write audit entries for all actions.

#### Scenario: User who has been removed from the authorized Entra group is deprovisioned

- **WHEN** the deprovisioning cron runs and a user previously in a `teams.yaml` group is no longer a member of any qualifying group
- **THEN** the cron calls `litellm.deleteKey` for each of the user's active keys, updates the key rows to `status = "revoked"`, updates the user row to `isActive = false` and `deprovisionedAt = now()`, writes audit entries with `actor = "system@1code-api"`, and the user's next request returns HTTP 409 from `POST /api/provision`

#### Scenario: User still in an authorized group is skipped

- **WHEN** the deprovisioning cron runs and an active user is still a member of at least one team group in `teams.yaml`
- **THEN** the cron skips that user without any DB writes or LiteLLM calls

#### Scenario: Graph API failure for one user does not stop the cron

- **WHEN** the deprovisioning cron encounters a Graph API error while checking one user's group membership
- **THEN** the cron logs the error, increments an internal error counter, and continues processing remaining users without abort

### Requirement: Rotation cron runs every six hours and rotates expired active keys

The 1code-api SHALL run a background cron job every six hours that selects all keys where `status = "active"` and `portal_expires_at <= now()` belonging to active users, deletes the old key in LiteLLM, marks the old key `status = "rotated"`, generates a new key with the same team and model list, and inserts a new `provisioned_keys` row with `rotatedFromId` linking back to the old key.

#### Scenario: Expired active key is auto-rotated

- **WHEN** the rotation cron runs and finds an active key whose `portal_expires_at` has passed and whose user is still active
- **THEN** the cron deletes the old key in LiteLLM, updates the old row to `status = "rotated"` and `revoked_at = now()`, generates a new key via `litellm.generateKey`, inserts a new row with `rotatedFromId = oldKey.id`, and writes an audit entry

#### Scenario: LiteLLM delete failure during rotation is logged but does not block new key creation

- **WHEN** the rotation cron encounters a LiteLLM `deleteKey` error for an expired key
- **THEN** the cron logs the error, proceeds to generate the new key and insert the new row, marks the old row `status = "rotated"`, and the overall rotation count still increments

#### Scenario: Key belonging to a deprovisioned user is not rotated

- **WHEN** the rotation cron runs and an expired key belongs to a user with `isActive = false`
- **THEN** the cron skips that key (the join filter excludes inactive users) and does not attempt rotation

### Requirement: Teams configuration is loaded from a gitignored YAML file

The 1code-api SHALL load team configuration from a YAML file at the path specified by the `TEAMS_CONFIG_PATH` environment variable (default: `/app/config/teams.yaml`). The file SHALL contain a `teams:` array of `TeamConfig` entries (each with `entra_group_id`, `team_alias`, `models`, `max_budget`, `budget_duration`, `team_member_budget`, `litellm_role`, optional `is_default`) and an optional `required_groups:` array for the authorization gate. The runtime `teams.yaml` SHALL NOT be committed to the repository; a `teams.yaml.example` template SHALL be committed instead.

#### Scenario: Teams config loads from the configured path on startup

- **WHEN** the 1code-api starts with `TEAMS_CONFIG_PATH=/app/config/teams.yaml` and a valid YAML file at that path
- **THEN** the service parses the file into a `TeamsConfig` object cached in memory and uses it for all provisioning and cron operations until the next process restart

#### Scenario: Default teams are suppressed when the user qualifies for a non-default team

- **WHEN** a user's Graph groups match one team entry marked `is_default: true` and one team entry marked `is_default: false`
- **THEN** the provisioning flow uses only the non-default team and suppresses the default team from the result

#### Scenario: Required groups gate blocks unauthorized users

- **WHEN** `teams.yaml` has a non-empty `required_groups` array and a user's Graph groups do not include any entry from that array
- **THEN** `POST /api/provision` returns HTTP 403 even if the user is a member of a `teams:` entry group

### Requirement: Microsoft Graph calls use a confidential-client app-only token

The 1code-api SHALL use a Microsoft Authentication Library (MSAL) confidential client application, configured with `AZURE_GRAPH_CLIENT_ID` and `AZURE_GRAPH_CLIENT_SECRET` environment variables, to acquire an app-only access token via the `client_credentials` flow with scope `https://graph.microsoft.com/.default`. This token SHALL be used as a Bearer token on Graph API requests. The client SHALL NOT perform JWT validation on user tokens (Envoy Gateway handles that upstream). The confidential-client Entra app registration SHALL be distinct from the public-client app registration used by MSAL Node in the 1Code desktop app.

#### Scenario: Graph client acquires an app-only token on first call

- **WHEN** the 1code-api first needs to call Graph `/users/{oid}/memberOf`
- **THEN** the `GraphClient` calls `acquireTokenByClientCredential` with scope `https://graph.microsoft.com/.default`, caches the returned access token with its expiry, and sends it as `Authorization: Bearer <token>` to Graph

#### Scenario: Cached Graph token is reused within its lifetime

- **WHEN** multiple provisioning or cron operations call Graph within the token's lifetime (minus a 60-second safety margin)
- **THEN** the `GraphClient` reuses the cached token without re-calling `acquireTokenByClientCredential`

#### Scenario: Expired Graph token triggers a refresh

- **WHEN** the cached Graph token's expiry is within 60 seconds of `now()`
- **THEN** the next call to `getAppToken()` re-acquires a fresh token via `acquireTokenByClientCredential` before using it

### Requirement: LiteLLM admin API calls use the master key

The 1code-api SHALL authenticate to the LiteLLM admin API (`/team/*`, `/user/*`, `/key/*`) using the value of the `LITELLM_MASTER_KEY` environment variable as a Bearer token on every request. The master key SHALL be sourced from a Kubernetes Secret `secretKeyRef` referencing the existing `litellm-secret` in the deployment namespace.

#### Scenario: LiteLLM client calls /user/new with master_key Bearer

- **WHEN** the provisioning flow calls `litellm.createUser({user_id, user_email, user_alias})`
- **THEN** the HTTP request to `POST {LITELLM_BASE_URL}/user/new` includes the header `Authorization: Bearer {LITELLM_MASTER_KEY}`

#### Scenario: LiteLLM 4xx/5xx response is logged with body before throwing

- **WHEN** a LiteLLM admin API call returns a non-2xx response
- **THEN** the `LiteLLMClient` logs the response status code and body via structured logging, then throws an Error that propagates to the route handler which returns HTTP 502 to the client

### Requirement: All new endpoints and crons are gated by the PROVISIONING_ENABLED feature flag

The 1code-api SHALL read a `PROVISIONING_ENABLED` environment variable at process startup, parse it as a boolean (accepting `"true"`, `"false"`, `"1"`, `"0"`), and default to `false` when unset. When the flag is `false`, all provisioning and key management endpoints SHALL return HTTP 503 and the background scheduler SHALL NOT start. When the flag is `true`, the endpoints SHALL respond normally and the scheduler SHALL start at process boot.

#### Scenario: Flag is false at startup

- **WHEN** the 1code-api starts with `PROVISIONING_ENABLED=false` (or unset)
- **THEN** calling `GET /api/provision/status`, `POST /api/provision`, `GET /api/keys`, `POST /api/keys/new`, `POST /api/keys/:id/rotate`, or `POST /api/keys/:id/revoke` returns HTTP 503 with `{"error": "provisioning disabled"}`, AND no deprovisioning or rotation jobs are registered with node-cron, AND existing `self-hosted-api` endpoints (`/api/changelog/desktop`, `/api/desktop/user/plan`, `/api/user/profile`, `/health`) continue to function unchanged

#### Scenario: Flag is true at startup

- **WHEN** the 1code-api starts with `PROVISIONING_ENABLED=true`
- **THEN** all new endpoints respond normally (subject to auth and rate limits), AND the scheduler is initialized with the deprovisioning and rotation cron schedules, AND a startup log line confirms "provisioning enabled, scheduler started"

### Requirement: All provisioning-related writes are recorded in an audit log table

The 1code-api SHALL insert an audit log row into the `audit_log` table for each of the following actions: user provisioned, team synced, membership added, key generated, key rotated (user-initiated), key rotated (auto by cron), key revoked, user deprovisioned (by cron), key deprovisioned (by cron). Each audit row SHALL include actor identity (`actorEmail`, `actorEntraOid`; for cron actions, `actorEmail = "system@1code-api"` and `actorEntraOid = "system"`), action type, target type and ID, and a JSON-stringified `details` field.

#### Scenario: Successful provisioning writes multiple audit rows

- **WHEN** a user successfully provisions via `POST /api/provision` and is added to two teams with one key per team
- **THEN** the `audit_log` table contains one `user.provisioned` row, two `team.synced` rows (if teams were newly created) or zero (if already existed), two `membership.added` rows, and two `key.generated` rows — all with `actorEmail = user.email` and `actorEntraOid = user.oid`

#### Scenario: Cron-initiated key rotation writes audit row with system actor

- **WHEN** the rotation cron auto-rotates an expired key
- **THEN** a `key.auto_rotated` row is inserted with `actorEmail = "system@1code-api"`, `actorEntraOid = "system"`, `targetType = "key"`, `targetId = <new key uuid>`, and `details` JSON including `{old_key_id, old_alias, new_alias, team_id}`

### Requirement: Audit log action strings are defined as a closed enum

The 1code-api SHALL declare all valid `audit_log.action` values as named TypeScript constants exported from `services/1code-api/src/lib/audit.ts`. The `logAction` helper SHALL accept only values from this closed set (enforced at the type level via a string-literal union), preventing divergent action strings across call sites.

The closed set SHALL contain exactly these eleven actions:

- `"user.provisioned"` — a new user row inserted via `POST /api/provision`
- `"user.deprovisioned"` — a user marked inactive by the deprovisioning cron
- `"team.synced"` — a new LiteLLM team created via `litellm.createTeam`
- `"membership.added"` — a `user_team_memberships` row inserted
- `"key.generated"` — a new `provisioned_keys` row inserted via user action (`POST /api/provision` or `POST /api/keys/new`)
- `"key.rotated"` — a user-initiated rotation via `POST /api/keys/:id/rotate`
- `"key.auto_rotated"` — an automatic rotation by the rotation cron
- `"key.revoked"` — a user-initiated revocation via `POST /api/keys/:id/revoke`
- `"key.deprovisioned"` — a key revoked by the deprovisioning cron as part of user deprovisioning
- `"key.generation_orphaned"` — a LiteLLM `generateKey` call succeeded but the subsequent DB insert or compensating delete failed (see Decision 8 failure semantics)
- `"email.changed"` — the user's email field on `users.email` was updated via `PATCH /api/user/profile` while their `litellmUserId` still references the old email (see the email mutability Requirement below)

#### Scenario: Adding a new action string without updating the enum fails the build

- **WHEN** a developer adds a new call to `logAction({action: "new.action", ...})` in any `.ts` file under `services/1code-api/src/`
- **THEN** `bun run ts:check` reports a type error because `"new.action"` is not a member of the closed `AuditAction` union, and the build fails until the new value is either added to the enum or removed from the call site

### Requirement: Rate limits are enforced per authenticated user, not per source IP

The 1code-api SHALL configure `@fastify/rate-limit` with a `keyGenerator` that returns the authenticated user's Entra `oid` from the `x-user-oid` header for all provisioning and key management endpoints. The default IP-based rate limiting SHALL NOT be used on these endpoints because all requests arrive from the Envoy Gateway pod's cluster IP, which would cause the entire fleet to share a single rate limit bucket.

The following per-endpoint rate limits SHALL be enforced, all keyed on `x-user-oid`:

- `GET /api/provision/status`: 60 requests per minute
- `POST /api/provision`: 5 requests per minute
- `GET /api/keys`: 60 requests per minute
- `POST /api/keys/new`: 10 requests per minute
- `POST /api/keys/:keyId/rotate`: 5 requests per minute
- `POST /api/keys/:keyId/revoke`: 5 requests per minute

Rate limits are an operational safeguard, not a contract — the exact numeric limits may be tuned without a spec amendment, but the keying strategy (`x-user-oid`) is the contract.

#### Scenario: Per-user rate limit isolates two users behind the same Envoy pod

- **WHEN** two authenticated users with different `oid` values (`oid = "user-A"` and `oid = "user-B"`) each send 3 `POST /api/provision` requests per minute from the same Envoy Gateway source IP
- **THEN** both users succeed (each below their individual 5/min limit), and neither user exhausts the other's budget

#### Scenario: Per-user rate limit blocks abusive retry storm

- **WHEN** a single authenticated user sends 6 `POST /api/provision` requests within a 60-second window
- **THEN** the first 5 requests are processed normally (subject to other errors), and the 6th request returns HTTP 429 with a `Retry-After` header

### Requirement: Deprovisioning cron halts if more than N users would be removed in a single run

The 1code-api SHALL configure a mass-deprovisioning safety threshold (default: 20 users, configurable via `DEPROVISIONING_MAX_PER_RUN` env var) that, when exceeded within a single cron iteration, causes the cron to abort without making any LiteLLM or DB writes and log an error with severity `level: "error"`. This protects against the failure mode where a misconfigured `teams.yaml` (e.g., a deleted Entra group ID that was load-bearing for authorization) or a Graph API outage causes every user to fail the authorization check simultaneously.

#### Scenario: Threshold not exceeded — cron runs normally

- **WHEN** the deprovisioning cron runs and finds 3 users no longer in their authorized groups (below the threshold of 20)
- **THEN** the cron deprovisions all 3 users normally and logs a summary `"deprovisioning complete: 3 deprovisioned, 0 errors"`

#### Scenario: Threshold exceeded — cron aborts without writes

- **WHEN** the deprovisioning cron runs and would deprovision 25 users (above the threshold of 20)
- **THEN** the cron logs an error `"mass deprovisioning threshold exceeded: 25 > 20 — aborting without writes, manual review required"`, writes an audit entry with action `"cron.deprovisioning_aborted"` and `details = {threshold: 20, would_deprovision: 25}`, makes zero LiteLLM or DB writes, and exits cleanly so the next scheduled run can retry (with the assumption that the operator has manually investigated the cause by then)

### Requirement: Race between in-flight provisioning request and deprovisioning cron is self-healing

The 1code-api SHALL tolerate the race condition where a user's `POST /api/provision` transaction overlaps with a concurrent deprovisioning cron run for the same user. Specifically: the provisioning transaction SHALL NOT be rolled back by the cron's write to `users.isActive`, and the cron SHALL NOT delete LiteLLM keys that were generated inside a concurrent provisioning transaction. The overall system SHALL self-heal on the next cron iteration, guaranteeing eventual consistency within at most two cron cycles (12 hours at the default 6-hour schedule).

#### Scenario: Cron picks up an user whose provision transaction committed during the cron's Graph call

- **WHEN** the deprovisioning cron selects `user.id = U` at `t=0` (reading `isActive = true`), then calls Graph for user U at `t=1` and receives an empty group list, then opens a transaction at `t=2` to mark U inactive — but between `t=0` and `t=2` a concurrent `POST /api/provision` for U committed successfully, inserting two new keys
- **THEN** the cron's transaction at `t=2` proceeds and marks U inactive and revokes the two new keys (because they are now owned by a now-inactive user), the user's next request returns HTTP 409 from `POST /api/provision`, AND on the user's next cron-window Graph refresh (once groups re-sync upstream) the user is correctly identified as unauthorized — the system reaches a consistent "user is deprovisioned" state within one additional cron cycle

#### Scenario: Provision transaction commits after cron's deprovisioning decision — last write wins

- **WHEN** a `POST /api/provision` transaction is in-flight for user U at `t=0`, the deprovisioning cron reads U as `isActive = true` at `t=1`, the provision transaction commits new rows at `t=2`, the cron decides to deprovision U at `t=3` (based on its stale Graph read), the cron's transaction marks U inactive at `t=4`
- **THEN** the final DB state reflects the cron's write (U is inactive, keys revoked), the user's next request gets 409, AND the reconciliation cron (Phase 2 future work) is documented as the mechanism that would detect the inconsistent "user's keys in LiteLLM vs DB" state if the cron's compensating delete calls to LiteLLM partially fail

### Requirement: Scheduler runs in at most one replica per Phase 1 constraint

The 1code-api deployment SHALL run with `replicas: 1` in its Kubernetes HelmRelease for Phase 1 of this capability. The deprovisioning and rotation crons SHALL NOT be safe to run concurrently across multiple replicas, and no advisory-lock or leader-election mechanism is implemented in Phase 1. A regression test SHALL parse `deploy/kubernetes/1code-api/app/helmrelease.yaml` and fail if the `replicas` field is set to any value other than `1`. A future OpenSpec proposal MAY relax this constraint by adding Postgres advisory-lock wrappers around each cron job.

#### Scenario: HelmRelease with replicas: 1 passes the regression test

- **WHEN** a regression test parses `deploy/kubernetes/1code-api/app/helmrelease.yaml` and checks the `spec.values.controllers.1code-api.replicas` field
- **THEN** the field equals `1` and the test passes

#### Scenario: HelmRelease with replicas: 3 fails the regression test

- **WHEN** an operator sets `replicas: 3` in `deploy/kubernetes/1code-api/app/helmrelease.yaml` and pushes the change
- **THEN** the regression test `tests/regression/1code-api-single-replica.test.ts` fails with an assertion message referencing Decision 10 and this Requirement, blocking the PR

### Requirement: Email mutability on users.email does not silently break LiteLLM key ownership

The 1code-api SHALL handle the case where a user's email is updated via the existing `PATCH /api/user/profile` endpoint (from the `self-hosted-api` baseline) while their LiteLLM keys are keyed on the OLD email value in `litellmUserId`. The system SHALL NOT automatically rename the LiteLLM user on email change (LiteLLM does not support user_id renames), SHALL write an audit log entry with action `"email.changed"` capturing both the old and new values, AND SHALL surface the mismatch in the `GET /api/provision/status` response via a new top-level field `email_sync_state` with one of two values: `"in_sync"` (when `users.email === users.litellmUserId`) or `"drift"` (when they differ).

#### Scenario: User updates email via profile endpoint — audit logged, drift flagged

- **WHEN** an authenticated user with `email = "old@example.com"` and `litellmUserId = "old@example.com"` calls `PATCH /api/user/profile` with body `{"email": "new@example.com"}` (if the endpoint were extended to accept email — currently it only accepts `display_name`)
- **THEN** the API updates `users.email = "new@example.com"`, leaves `users.litellmUserId = "old@example.com"` unchanged, writes an audit entry with `action = "email.changed"`, `details = {"old_email": "old@example.com", "new_email": "new@example.com"}`, and the next `GET /api/provision/status` response includes `"email_sync_state": "drift"`

#### Scenario: User with in-sync email

- **WHEN** an authenticated user with `email = "user@example.com"` and `litellmUserId = "user@example.com"` calls `GET /api/provision/status`
- **THEN** the response includes `"email_sync_state": "in_sync"`

**Note:** The existing `PATCH /api/user/profile` baseline endpoint only accepts `display_name` today and does not update email. This Requirement is forward-looking — it defines the behavior IF a future change extends that endpoint to accept email updates. For Phase 1, the `email_sync_state` field is always `"in_sync"` in practice, but the plumbing is in place so that a future email-mutability feature does not silently break LiteLLM attribution.

