# Tasks: add-1code-api-litellm-provisioning

## 1. Database schema & migration

- [x] 1.1 Extend `services/1code-api/src/db/schema.ts` `users` table per Decision 2: add `id: uuid primaryKey defaultRandom` as new PK, keep `oid: text notNull` as a `uniqueIndex("users_oid_unique")`, add `litellmUserId` (nullable text), `isActive` (boolean, default true), `defaultKeyDurationDays` (integer, default 90), `deprovisionedAt` (nullable timestamp)
- [x] 1.2 Add `keyStatus = pgEnum("key_status", ["active", "revoked", "rotated", "expired", "expiring_soon"])` to `services/1code-api/src/db/schema.ts` per Decision 9
- [x] 1.3 Add `provisionedKeys` table to `services/1code-api/src/db/schema.ts` per design §"New `provisionedKeys` table" — `userId: uuid` FK to `users.id`, `status: keyStatus` column, `rotatedFromId: uuid` self-FK using `AnyPgColumn` type annotation with `onDelete: "set null"`
- [x] 1.4 Add `userTeamMemberships` table to `services/1code-api/src/db/schema.ts` with `userId: uuid` FK to `users.id` and `uq_user_team` unique constraint on `(userId, teamId)`
- [x] 1.5 Add `auditLog` table to `services/1code-api/src/db/schema.ts` (7 columns for actor + action + target + details + timestamp)
- [x] 1.6 Run `cd services/1code-api && bun run db:generate` to produce the migration file
- [x] 1.7 Review generated SQL: verify the two-step `users` PK migration is present (add `id` with `gen_random_uuid()` default → drop old `users_pkey` → add new PK on `id` → create `users_oid_unique` index). If Drizzle emits a naive single-step DROP PRIMARY KEY, split into two migration files manually. Verify all new `users` columns are nullable or have defaults (backward-compatible for rolling deploy).
- [x] 1.8 Commit the generated migration file(s)

## 2. Config & feature flag

- [x] 2.1 Extend `services/1code-api/src/config.ts` Zod schema with a **conditional** schema using `.superRefine()`: parse `PROVISIONING_ENABLED` (enum `true|false|1|0`, default `false`, transformed to boolean) first. When the resulting boolean is `true`, `.superRefine()` validates that `LITELLM_BASE_URL` (url), `LITELLM_MASTER_KEY` (string min 1), `AZURE_TENANT_ID` (uuid), `AZURE_GRAPH_CLIENT_ID` (uuid), `AZURE_GRAPH_CLIENT_SECRET` (string min 1), `TEAMS_CONFIG_PATH` (string, default `/app/config/teams.yaml`), `DEPROVISIONING_MAX_PER_RUN` (integer, default 20) are all present and valid. When the flag is `false`, these fields are optional and unvalidated. This preserves local-dev ergonomics for devs who only need the baseline endpoints.
- [x] 2.2 Add gitignore entry `services/1code-api/config/teams.yaml` to the root `.gitignore`
- [x] 2.3 Create `services/1code-api/config/` directory
- [x] 2.4 Create `services/1code-api/config/teams.yaml.example` with placeholder GUIDs and header comment matching Apollos's `teams.yaml.example` structure
- [x] 2.5 Write a unit test in `services/1code-api/tests/config.test.ts` that asserts: (a) with `PROVISIONING_ENABLED=false` and no Azure/LiteLLM env vars set, the config parses successfully, (b) with `PROVISIONING_ENABLED=true` and missing `AZURE_GRAPH_CLIENT_ID`, the config parse throws with a message listing the missing fields, (c) with `PROVISIONING_ENABLED=true` and all required vars set, the config parses successfully

## 3. Core libraries

- [x] 3.1 Add `@azure/msal-node`, `node-cron`, `yaml`, `@fastify/rate-limit` to `services/1code-api/package.json` dependencies; run `bun install`
- [x] 3.2 Create `services/1code-api/src/lib/teams-config.ts` — YAML loader, `TeamConfig`/`TeamsConfig` types, `getTeamByGroupId`, `getQualifyingTeams` (with default suppression logic), `isUserAuthorized` (with `required_groups` gate)
- [x] 3.3 Create `services/1code-api/src/lib/graph-client.ts` — `GraphClient` class with `MSALConfidentialClientApplication`, in-memory token cache with 60s safety margin, `getUserGroups(oid)` with `@odata.nextLink` pagination
- [x] 3.4 Create `services/1code-api/src/lib/litellm-client.ts` — `LiteLLMClient` class with methods: `checkHealth`, `getTeam`, `createTeam`, `createUser`, `getUser`, `addTeamMember`, `generateKey`, `deleteKey`; each with typed request/response shapes and error handling that logs response body before throwing
- [x] 3.5 Create `services/1code-api/src/lib/audit.ts` — export a closed `AuditAction` string-literal union type containing exactly these 11 values: `"user.provisioned"`, `"user.deprovisioned"`, `"team.synced"`, `"membership.added"`, `"key.generated"`, `"key.rotated"`, `"key.auto_rotated"`, `"key.revoked"`, `"key.deprovisioned"`, `"key.generation_orphaned"`, `"email.changed"`. Export a const `AUDIT_ACTIONS` object mapping symbolic names to the literal strings (e.g., `ACTION_USER_PROVISIONED = "user.provisioned" as const`). Implement `logAction({tx, actorEmail, actorEntraOid, action, targetType, targetId, details})` that accepts `action: AuditAction` (type-enforced) and inserts into the `auditLog` table with `details` JSON-stringified. Any call site that passes a string literal not in the union fails `bun run ts:check`.
- [x] 3.6 Create `services/1code-api/src/lib/scheduler.ts` — `setupScheduler` function that registers deprovisioning + rotation jobs with `node-cron`, returns a handle for graceful shutdown
- [x] 3.7 Create `services/1code-api/src/lib/slugify.ts` — minimal kebab-case helper for key alias generation

## 4. Domain services

- [x] 4.1 Create `services/1code-api/src/services/provisioning.ts` — `getProvisionStatus(session, user)` + `provisionUser(session, litellm, graph, teamsConfig, user)` following the 10-step state machine in design.md §"Transaction boundary for provisioning state changes"
- [x] 4.2 Create `services/1code-api/src/services/key-service.ts` — `listUserKeys`, `createKey` (with alias collision suffix), `rotateKey` (with `rotatedFromId` linkage), `revokeKey`; include `_makeKeyPreview`, `_computeStatus`, `_daysUntilExpiry` helpers
- [x] 4.3 Create `services/1code-api/src/services/deprovisioning.ts` — `runDeprovisioningJob` + `_deprovisionUser` per design §"Deprovisioning cron"
- [ ] 4.4 Create `services/1code-api/src/services/rotation.ts` — `runRotationJob` + `_autoRotateKey` per design §"Rotation cron"

## 5. Zod schemas

- [x] 5.1 Create `services/1code-api/src/schemas/provision.ts` — `ProvisionStatusResponse`, `ProvisionResponse`, `UserSummary`, `TeamSummary` Zod schemas
- [ ] 5.2 Create `services/1code-api/src/schemas/keys.ts` — `KeyListItem`, `KeyListResponse`, `KeyCreateRequest`, `KeyCreateResponse`, `KeyRotateResponse`, `KeyRevokeResponse` Zod schemas

## 6. Route handlers

- [x] 6.1 Create `services/1code-api/src/routes/provision.ts` — `GET /api/provision/status` (60/min rate limit) + `POST /api/provision` (5/min rate limit) handlers with feature flag guard returning 503 when off, Zod validation of responses
- [ ] 6.2 Create `services/1code-api/src/routes/keys.ts` — `GET /api/keys` (60/min) + `POST /api/keys/new` (10/min) + `POST /api/keys/:keyId/rotate` (5/min) + `POST /api/keys/:keyId/revoke` (5/min) handlers with feature flag guard, Zod validation, ownership enforcement (return 404 if key is not owned by the authenticated user)
- [ ] 6.3 Register `@fastify/rate-limit` plugin in `services/1code-api/src/index.ts` before route registration with a **global `keyGenerator` that returns `request.headers["x-user-oid"]`** (NOT the default IP-based key, which would global-rate-limit the entire fleet because all requests share the Envoy Gateway pod IP). When the header is missing (e.g., health check before auth hook), fall back to the source IP to preserve existing health-check rate limits.
- [ ] 6.4 Register `registerProvisionRoute` and `registerKeysRoute` in `services/1code-api/src/index.ts` alongside existing route registrations
- [ ] 6.5 Add app state initialization in `services/1code-api/src/index.ts` for `LiteLLMClient`, `GraphClient`, `TeamsConfig`, wired into Fastify decorators for DI — eagerly initialize ONLY when `PROVISIONING_ENABLED=true`, lazy/null when flag is false
- [ ] 6.6 Add a unit test for the rate-limit `keyGenerator` that asserts two requests with different `x-user-oid` values do NOT share a rate limit bucket, even when they originate from the same simulated source IP

## 7. Scheduler lifecycle

- [ ] 7.1 In `services/1code-api/src/index.ts`, call `setupScheduler` only when `PROVISIONING_ENABLED === true`; store handle for shutdown
- [ ] 7.2 In the `shutdown` handler, stop scheduled jobs via the handle before closing Fastify
- [ ] 7.3 Verify scheduler does not start when flag is false via log output

## 8. Tests

- [ ] 8.1 Create `services/1code-api/tests/lib/teams-config.test.ts` — YAML parsing, qualifying teams resolution (default suppression), `required_groups` gate
- [ ] 8.2 Create `services/1code-api/tests/lib/graph-client.test.ts` — token caching, pagination, 4xx error handling (mock `fetch`)
- [ ] 8.3 Create `services/1code-api/tests/lib/litellm-client.test.ts` — each of 8 methods with mocked `fetch`, 404 handling for `getUser`/`getTeam`
- [ ] 8.4 Create `services/1code-api/tests/services/provisioning.test.ts` — idempotency, unauthorized user 403, deprovisioned user 409, Graph failure propagation
- [ ] 8.5 Create `services/1code-api/tests/services/key-service.test.ts` — all 4 operations (list/create/rotate/revoke), alias collision suffix, status derivation tests covering **all 5 states** with explicit boundary assertions per Decision 9: `days_until_expiry = 15 → "active"`, `= 14 → "expiring_soon"`, `= 1 → "expiring_soon"`, `= 0 → "expired"`, `= -5 → "expired"`, `persisted_status = "revoked" → "revoked" (overrides)`, `persisted_status = "rotated" → "rotated" (overrides)`. Ownership check: `rotate_key` and `revoke_key` return 404 (not 403) when the key belongs to another user.
- [ ] 8.6 Create `services/1code-api/tests/services/deprovisioning.test.ts` — authorized user skipped, unauthorized user fully deprovisioned, per-user catch on Graph error, **mass-deprovisioning threshold**: when the count of users-to-deprovision in a single run exceeds `DEPROVISIONING_MAX_PER_RUN` (default 20), the cron aborts without any writes, logs an error with `level: "error"`, writes a single audit row `action = "cron.deprovisioning_aborted"` with `details = {threshold, would_deprovision}`, and exits cleanly
- [ ] 8.7 Create `services/1code-api/tests/services/rotation.test.ts` — expired key rotated with `rotatedFromId` link, LiteLLM delete failure logged but proceeds
- [ ] 8.8 Create `services/1code-api/tests/routes/provision.test.ts` — feature flag off returns 503, happy path end-to-end
- [ ] 8.9 Create `services/1code-api/tests/routes/keys.test.ts` — feature flag off returns 503, ownership enforcement, rate limiting (smoke only)
- [ ] 8.10 Create `services/1code-api/tests/integration/provision-flow.test.ts` — docker-compose with Postgres + LiteLLM, real end-to-end provision flow
- [ ] 8.11 Create `services/1code-api/tests/integration/deprovisioning-flow.test.ts` — seed → group removal → manual cron run → verify state
- [ ] 8.12 Create `services/1code-api/tests/integration/rotation-flow.test.ts` — seed expired key → manual cron run → verify new key + DB link

## 9. Deployment manifests

- [ ] 9.1 Extend `deploy/kubernetes/1code-api/app/helmrelease.yaml` `env:` block with `LITELLM_BASE_URL`, `AZURE_TENANT_ID`, `AZURE_GRAPH_CLIENT_ID`, `TEAMS_CONFIG_PATH` (non-secret values)
- [ ] 9.2 Extend `deploy/kubernetes/1code-api/app/helmrelease.yaml` with `env:` entries using `secretKeyRef` for `LITELLM_MASTER_KEY` (from existing `litellm-secret`) and `AZURE_GRAPH_CLIENT_SECRET` (from new `1code-api-graph-secret`)
- [ ] 9.3 Add new Secret stub `deploy/kubernetes/1code-api/app/graph-secret.sops.yaml` (encrypted separately via SOPS)
- [ ] 9.4 Extend `deploy/kubernetes/1code-api/app/helmrelease.yaml` with ConfigMap volume mount for `teams.yaml` at `/app/config/teams.yaml`
- [ ] 9.5 Add teams ConfigMap to `deploy/kubernetes/1code-api/app/teams-configmap.yaml` as a committed **placeholder-only** ConfigMap with the example contents from `services/1code-api/config/teams.yaml.example` (no real Entra group IDs). The Flux postBuild step in `talos-ai-cluster` will substitute the real values from `cluster.yaml`'s `onecode_api_teams:` array at reconcile time. This decision (committed placeholder vs cluster-repo-generated file) is locked here to unblock task 12.4. Reference pattern: follow `deploy/kubernetes/1code-api/app/secret.sops.yaml` for how SOPS substitution works in Flux for this repo — same approach for the ConfigMap but without SOPS encryption since the placeholder values are safe to commit.
- [ ] 9.6 Extend the existing `deploy/kubernetes/1code-api/app/ciliumnetworkpolicy.yaml` (already present in the repo; the file was created by the `implement-1code-api` change) — add egress rules to allow `graph.microsoft.com` (via DNS-based FQDN entity) and `litellm.ai.svc.cluster.local:4000` (via service selector matching `app.kubernetes.io/name: litellm`)
- [ ] 9.7 Add `PROVISIONING_ENABLED: "false"` to the helmrelease env — explicit default for staging
- [ ] 9.8 **Single-replica regression test**: create `tests/regression/1code-api-single-replica.test.ts` per Decision 10. The test SHALL parse `deploy/kubernetes/1code-api/app/helmrelease.yaml` with `yaml` parser, navigate to `spec.values.controllers["1code-api"].replicas`, and assert the value equals `1`. The test SHALL fail with a clear error message referencing Decision 10 and the "Scheduler runs in at most one replica" Requirement if the field is missing or differs. Update `docs/conventions/regression-guards.md` to add this guard to the canonical list.

## 10. Documentation

- [ ] 10.1 Create `docs/enterprise/1code-api-provisioning.md` — architecture overview, API reference, operator runbook, troubleshooting, teams.yaml schema reference
- [ ] 10.2 Update `docs/enterprise/entra-app-registration-1code-api.md` with a new "Server-side Graph client app registration" section covering the new confidential client, `GroupMember.Read.All` permission, admin consent steps, and client secret rotation
- [ ] 10.3 Update `docs/enterprise/auth-strategy.md` with a note that the v2.1 dual-auth JWT half is implemented by this change and the OIDC half is explicitly not implemented on the 1code-api route
- [ ] 10.4 Create `docs/enterprise/apollos-decommission-runbook.md` — operational runbook for the post-change Apollos removal (Phase B/C/D/E from research doc §11). MUST include: (a) a dedicated "Cutover race window" section documenting that Apollos pod SIGTERM and 1code-api pod restart with `PROVISIONING_ENABLED=true` are NOT atomic under Flux reconcile, and specifying a `MIGRATION_COMPLETE` env var pattern (or equivalent) that prevents the 1code-api deprovisioning cron from running its first pass until the operator manually confirms the one-shot Apollos data migration script has completed; (b) the one-shot migration script design (read from `apollos_portal_db.provisioned_users` / `provisioned_keys` / `user_team_memberships`, INSERT into 1code-api's DB preserving UUIDs since both schemas use uuid PKs — Decision 2); (c) an explicit "audit log portability" section stating whether Apollos's historical `audit_log` rows are copied (recommended: yes, for compliance continuity) or abandoned at cutover; (d) a rollback plan if Phase C cutover fails; (e) the exact order for Apollos Entra app reg deletion (LAST — never before the 1-week soak).
- [ ] 10.5 Update `CLAUDE.md` architecture summary — note 1code-api now owns LiteLLM provisioning, reference the new doc, update shipped features bullet
- [ ] 10.6 Update `.claude/PROJECT_INDEX.md` — add new source files and new doc pages
- [ ] 10.7 Add roadmap entry to `docs/operations/roadmap.md` — "Pending" section with this change ID, flipping to "Recently Completed" after archive
- [ ] 10.8 Register `docs/enterprise/1code-api-provisioning.md` and `docs/enterprise/apollos-decommission-runbook.md` in `docs/docs.json` enterprise sidebar

## 11. Quality gates

- [ ] 11.1 `bun run ts:check` — no new errors above baseline (32)
- [ ] 11.2 `bun run lint` — no new SonarLint findings
- [ ] 11.3 `bun test` — all existing regression guards + new unit tests pass
- [ ] 11.4 `bun run build` — esbuild packaging validation
- [ ] 11.5 `cd services/1code-api && bun test` — service tests pass
- [ ] 11.6 `cd docs && bun run build` — xyd-js docs site builds cleanly
- [ ] 11.7 `bunx @fission-ai/openspec@1.2.0 validate add-1code-api-litellm-provisioning --strict --no-interactive` passes

## 12. Cross-repo coordination (talos-ai-cluster)

These tasks are in the cluster repo, not this repo. Tracked here so they are not forgotten before feature flag flip.

- [ ] 12.1 (cluster repo) Add `onecode_api_graph_client_id`, `onecode_api_graph_client_secret`, `provisioning_enabled` to `cluster.yaml`
- [ ] 12.2 (cluster repo) Mint new confidential Entra app registration per design §"Decision 1", grant `GroupMember.Read.All` Application permission with admin consent
- [ ] 12.3 (cluster repo) Add new Secret SOPS file `kubernetes/apps/ai/1code-api/app/graph-secret.sops.yaml` with the new client secret
- [ ] 12.4 (cluster repo) Generate or update ConfigMap containing runtime `teams.yaml`
- [ ] 12.5 (cluster repo) Update 1code-api HelmRelease Jinja template to surface new env vars and mount the ConfigMap
- [ ] 12.6 (cluster repo) Deploy with `PROVISIONING_ENABLED=false` — smoke test existing endpoints still work
- [ ] 12.7 (cluster repo) Dry-run smoke test — exec into 1code-api pod, manually verify Graph connectivity + teams.yaml parsing without calling LiteLLM
