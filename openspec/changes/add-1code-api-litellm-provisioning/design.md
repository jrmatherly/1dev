# Design: add-1code-api-litellm-provisioning

## Context

This change extends `services/1code-api` with LiteLLM user provisioning + team assignment + API key lifecycle, porting a well-validated Python implementation from the `apollos-portal` project. The design below is grounded in a file-by-file read of Apollos's backend code, specifically:

- `apollos-portal/backend/app/services/provisioning.py` (301 LOC — provisioning state machine)
- `apollos-portal/backend/app/services/key_service.py` (339 LOC — key lifecycle)
- `apollos-portal/backend/app/services/litellm_client.py` (289 LOC — admin API client)
- `apollos-portal/backend/app/services/deprovisioning_service.py` (146 LOC — group-membership-triggered removal)
- `apollos-portal/backend/app/services/rotation_service.py` (178 LOC — expiry-triggered auto-rotation)
- `apollos-portal/backend/app/core/graph.py` (74 LOC — MSAL confidential + Graph pagination)
- `apollos-portal/backend/app/core/teams.py` (102 LOC — TeamsConfig dataclass + resolution)
- `apollos-portal/backend/app/core/auth.py` (147 LOC — SKIPPED because Envoy already validates)
- `apollos-portal/backend/app/core/scheduler.py` (65 LOC — APScheduler cron)

The complete research notes with line-level citations live in `.scratchpad/1code-api-provisioning-research.md` (902 lines) and should be read alongside this design document.

## Goals

1. **Self-contained onboarding for 1Code desktop app users.** A user who has authenticated via Entra (MSAL Node in the Electron app) and whose token has been validated at the Envoy Gateway can call `POST /api/provision` and receive a working LiteLLM API key in one round trip, without visiting any portal or browser UI.
2. **Idempotent state reconciliation.** Calling `POST /api/provision` for an already-provisioned user must be a no-op that returns their current state. The same principle applies to team creation (idempotent) and user creation in LiteLLM (idempotent).
3. **Entra security group → LiteLLM team mapping.** A user's LiteLLM team membership is derived from their Entra security group memberships via a `teams.yaml` config file. Users in multiple groups get multiple team memberships.
4. **Automatic lifecycle management.** Keys auto-rotate on expiry. Users who leave authorized Entra groups are auto-deprovisioned within 6 hours.
5. **Clean decommission path for Apollos.** Once this change lands and soaks, Apollos portal can be removed from the cluster entirely. The design assumes Apollos's data is the source of truth *until* cutover, then 1code-api's database becomes the source of truth.

## Non-Goals

- Apollos portal data migration — the cutover involves running a one-shot migration script that reads from `apollos_portal_db` and inserts into 1code-api's DB. That script is a separate deliverable, not part of this change.
- Usage tracking / spend reporting (`/api/usage`) — Apollos exposes these; we don't need them.
- Model list / sync (`/api/models`) — Apollos exposes these; we don't need them.
- Admin endpoints (list all users, force rotate, audit log viewer) — Apollos exposes these; 1code-api doesn't need them because there is no admin UI.
- Email notifications — Apollos sends expiry reminder emails; we replace this with in-app notifications in the Electron desktop app based on `days_until_expiry` returned by `GET /api/keys`.
- Reconciliation cron — Apollos has a `TODO(4.6)` incomplete version. Defer until ops actually complains about drift.
- Browser/React UI — there is no 1code-api web frontend.

## Decisions

### Decision 1: Two Entra app registrations (not one dual-mode)

**Context:** The 1code-api ecosystem needs two fundamentally different Entra credentials:

1. The existing `onecode_api_entra_client_id: 52d25f5d-688a-46fe-8356-305cec17f375` is a **public client** used by MSAL Node in the Electron desktop app (loopback redirect `http://localhost`, no client secret, RFC 8252). Its token `aud` claim is validated by the Envoy Gateway JWT provider.
2. The new server-side Graph client inside 1code-api needs a **confidential client** with a client secret for the `client_credentials` OAuth flow (app-only, no user context). This client has `GroupMember.Read.All` application permission to query `/users/{oid}/memberOf`.

**Options considered:**

- **Option A — Mint a new confidential Entra app reg, keep the existing public client unchanged.** Two distinct Entra app regs, each with narrow scope. Matches the Apollos pattern exactly.
- **Option B — Reconfigure the existing `52d25f5d...` to be a dual-mode app reg** with both Web + Mobile/desktop platform configs, add a client secret. Microsoft allows this, but the "Allow public client flows" flag applies to the whole app and confidential credentials behave oddly alongside it. Fragile.
- **Option C — Use federated identity credentials / managed identity.** Overkill for K8s workloads; requires additional infrastructure.

**Decision: Option A.** Consistent with Apollos's existing pattern (Apollos uses `2938f422-ae63-48ee-b129-1d75b420aeeb` as its confidential client for Graph). Least-privilege at the Entra app reg boundary. Each secret has a distinct rotation schedule. Adds one new pair of SOPS-encrypted `cluster.yaml` values: `onecode_api_graph_client_id` and `onecode_api_graph_client_secret`.

**Trade-off:** Two app regs to manage instead of one. Accepted — this is how Apollos already works and ops is familiar with the pattern.

### Decision 2: Extend the existing `users` table in place with an internal UUID primary key

**Context:** The `self-hosted-api` baseline already defines a `users` table at `services/1code-api/src/db/schema.ts:3-12` with columns `oid` (PK, text), `email`, `display_name`, `created_at`, `updated_at`. Apollos's equivalent is `provisioned_users` with a separate internal `id: uuid` primary key AND an `entra_oid: text` unique column, PLUS `litellm_user_id`, `is_active`, `default_key_duration_days`, `deprovisioned_at`, plus notification flags. Apollos's foreign keys (`provisioned_keys.user_id`, `user_team_memberships.user_id`) reference the internal UUID, NOT the Entra OID.

**Options considered:**

- **Option A — Extend `users` in place, keep `oid: text` as PK, use `text` foreign keys.** Simplest additive change. Cost: the decommission migration script must rewrite every Apollos UUID FK value to a text OID value (O(n) pass over `provisioned_keys`, `user_team_memberships`, and `rotated_from_id` self-FK), and the API response shapes cannot expose a `user_id: uuid` field that's distinct from the OID.
- **Option B — Add a new `id: uuid` primary key column AND keep `oid: text` as a unique-indexed secondary column; FKs target `users.id` with `uuid` type.** Apollos-faithful. Two-phase migration: (1) add `id` column with default `gen_random_uuid()`, (2) demote `oid` from PK to unique index. Existing `PATCH /api/user/profile` uses `oid` for lookups and still works unchanged (unique index is still a valid lookup key). Decommission migration is a straight row copy with no FK rewrite.
- **Option C — Create a parallel `provisioned_users` table with a 1:1 relationship to `users`.** Two tables, two writes per provisioning call. Rejected — unnecessary complexity.
- **Option D — Rename `users` → `provisioned_users`.** Breaking schema change. Rejected.

**Decision: Option B.** The Apollos decommission migration is the single most risky operational phase of this overall initiative (see §11 of `.scratchpad/1code-api-provisioning-research.md`). Matching Apollos's schema exactly means the migration script becomes a plain `INSERT INTO ... SELECT FROM` across the psql wire, with no FK rewrite pass, no risk of orphaned rows from mis-remapping, and no ambiguity about which key shape to use for the migration's existence checks. The cost of carrying one additional UUID column on `users` for the life of the service is negligible compared to the cost of a botched cutover.

**Schema shape (final):**

```typescript
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),        // NEW internal PK
    oid: text("oid").notNull(),                         // Entra object ID (was PK; now unique)
    email: text("email").notNull(),
    displayName: text("display_name").notNull().default(""),
    // NEW from this change:
    litellmUserId: text("litellm_user_id"),             // = email written to LiteLLM /user/new
    isActive: boolean("is_active").notNull().default(true),
    defaultKeyDurationDays: integer("default_key_duration_days").notNull().default(90),
    deprovisionedAt: timestamp("deprovisioned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    oidUnique: uniqueIndex("users_oid_unique").on(table.oid),
  }),
);
```

All three child tables (`provisionedKeys`, `userTeamMemberships`, `auditLog` relationships, `rotated_from_id` self-FK) use `uuid` foreign keys referencing `users.id`.

**Migration ordering for the existing schema:** The Drizzle migration needs two steps:

1. `ALTER TABLE users ADD COLUMN id uuid DEFAULT gen_random_uuid()` (nullable initially so existing rows get populated)
2. `ALTER TABLE users ADD CONSTRAINT users_id_not_null CHECK (id IS NOT NULL); ALTER TABLE users DROP CONSTRAINT users_pkey; ALTER TABLE users ADD PRIMARY KEY (id); CREATE UNIQUE INDEX users_oid_unique ON users(oid);`

Drizzle's `drizzle-kit generate` should produce this automatically from the schema diff, but task 1.6 explicitly requires reviewing the generated SQL — if Drizzle emits a naive `DROP PRIMARY KEY` without the fill pass, it has to be split into two migration files.

**Trade-off:** One additional column on `users`. Apollos's API response shape `{ "user_id": <uuid>, "oid": <text>, ... }` now applies directly — no re-translation needed for the decommission migration or for consumers that may come from Apollos's codebase.

### Decision 3: Feature flag `PROVISIONING_ENABLED` (default false)

**Context:** Provisioning endpoints must be shippable to production without actually serving traffic, so the code can soak alongside the existing four endpoints before cutover.

**Decision:** All six new endpoints (`/api/provision/status`, `/api/provision`, `/api/keys*`) are gated by a single boolean feature flag `PROVISIONING_ENABLED` read from environment at process boot. When false:

- All six endpoints return HTTP 503 with body `{"error": "provisioning disabled"}`
- The scheduler is not started (no deprovisioning or rotation crons run)
- No Graph API calls are made (the Graph client is lazy-initialized on first request)
- No LiteLLM admin API calls are made (the LiteLLM client is lazy-initialized on first request)
- The schema migration still runs on startup (tables exist but stay empty)

When true:

- Endpoints respond normally
- Scheduler starts and registers both crons with the user-configured schedules
- Graph + LiteLLM clients initialize eagerly at boot for fail-fast diagnostics
- Unit tests cover both flag states

**Flag reload behavior:** the flag is read once at boot. Flipping it requires a pod restart (Flux reconcile → rolling deploy). This is intentional — we do not want a scheduler that's half-started due to a mid-process flag flip.

### Decision 4: `teams.yaml` ownership and mount strategy

**Context:** The `teams.yaml` file contains real Entra security group GUIDs that are environment-specific (the cluster's actual groups). It must not be committed to git. Apollos's pattern (gitignore the live file, commit an example template) is proven.

**Decision:**

- `services/1code-api/config/teams.yaml.example` is **committed** with placeholder GUIDs. Schema matches Apollos's `teams.yaml.example` exactly.
- `services/1code-api/config/teams.yaml` is **gitignored** at the repo root.
- At runtime in Kubernetes, `teams.yaml` is mounted from a ConfigMap at the path specified by the `TEAMS_CONFIG_PATH` env var (default: `/app/config/teams.yaml`).
- The ConfigMap contents are managed in `talos-ai-cluster` — either as a top-level `onecode_api_teams:` array in `cluster.yaml` rendered into a ConfigMap by Jinja, or as a separate `teams.yaml.j2` file in the templates tree. Cluster-side choice, not decided here.
- In local development, ops copies `teams.yaml.example` → `teams.yaml` and fills in placeholder GUIDs with real tenant values.
- The file is loaded once at scheduler startup and cached in memory as a `TeamsConfig` object. A future enhancement may add SIGHUP reload or a 5-minute timer, but for Phase 1 a pod restart is the reload mechanism.

### Decision 5: LiteLLM master_key via secretKeyRef, not envFrom

**Context:** The 1code-api pod needs access to LiteLLM's master_key to call admin endpoints. LiteLLM's master_key already exists as an env var inside the `litellm-secret` Kubernetes Secret in the `ai` namespace (same namespace as 1code-api).

**Options considered:**

- **Option M1 — envFrom the entire `litellm-secret`** into the 1code-api pod. Simplest; matches Apollos's pattern.
- **Option M2 — secretKeyRef only the `LITELLM_MASTER_KEY` key** from `litellm-secret` into the 1code-api pod.

**Decision: Option M2.** Cleaner isolation — 1code-api only receives the one env var it actually needs, not the 10+ other variables LiteLLM itself uses. Reduces risk of accidental name collisions. Requires one more line of YAML in the HelmRelease but the cost is trivial.

### Decision 6: `node-cron` for the scheduler (not BullMQ, not Fastify plugins)

**Context:** Two cron jobs are needed: deprovisioning (every 6 hours) and rotation (every 6 hours). Apollos uses APScheduler (Python). The TypeScript equivalents are `node-cron`, `@fastify/cron`, BullMQ, Agenda, or a plain `setInterval` loop.

**Decision: `node-cron`.** Minimal dependency (<100 KB), no Redis requirement, simple API (`cron.schedule("0 */6 * * *", handler)`), well-maintained. The jobs are stateless — each run reads from Postgres and writes to LiteLLM + Postgres — so we don't need BullMQ's queue semantics. Fastify-coupled plugins add lifecycle complexity we don't need.

**Trade-off:** `node-cron` runs in-process, so if the 1code-api pod has multiple replicas, both replicas would run the cron simultaneously. We mitigate by either (a) running 1code-api as a single-replica deployment, or (b) adding a database advisory lock around each cron invocation. For Phase 1, single replica is the accepted constraint; the HelmRelease already specifies `replicas: 1` per the current `deploy/kubernetes/1code-api/app/helmrelease.yaml`.

### Decision 7: LiteLLM `user_id` keyed on email (matching Apollos)

**Context:** Apollos writes `user_id = user.email` into LiteLLM's `/user/new` API (per `apollos-portal/backend/app/services/provisioning.py:146`). Apollos separately tracks the Entra `oid` in its own `ProvisionedUser.entra_oid` column for internal lookups.

**Options considered:**

- **Option K1 — Match Apollos exactly:** `user_id = email`, keep `oid` as the local DB identity key, store `litellm_user_id` (= email) for reference.
- **Option K2 — Use `oid` as the LiteLLM user_id:** more immutable (email can change in Entra; oid never does), but would create a split-brain during the cutover where Apollos's existing LiteLLM users are keyed on email and 1code-api would create new entries keyed on oid.

**Decision: Option K1.** Cutover compatibility wins over purity. During migration, 1code-api must be able to look up existing Apollos-created LiteLLM users by email, so it must use the same key shape. If a user's email ever changes in Entra (rare), we will need a one-shot migration script to rename the LiteLLM user_id; that's an operational concern, not a design flaw.

### Decision 8: Transaction boundary for provisioning state changes (two-phase read-then-write)

**Context:** The provisioning flow (`POST /api/provision`) makes multiple external API calls (Graph, LiteLLM) interleaved with Drizzle writes. Apollos's `apollos-portal/backend/app/services/provisioning.py` handles this with **per-team existence checks mid-flow** (`provisioning.py:117`, `143`, `184-190`) and incremental commits, specifically so that already-provisioned teams/memberships are short-circuited before their LiteLLM writes execute. A naive "do all LiteLLM writes, then one big DB transaction" breaks this — it would blindly re-insert already-existing memberships and hit the `uq_user_team` unique constraint on re-runs, OR skip LiteLLM writes for already-present memberships but still attempt duplicate DB inserts.

**Decision:** Two-phase flow — **(1) pre-flight read phase** that captures all existing state needed for idempotency decisions, then **(2) execution phase** that interleaves external API calls with DB writes inside a single `db.transaction()` using Apollos's per-team idempotent pattern.

**Phase 1 — Pre-flight reads (no writes, no transaction):**

1. Read `req.user` from `x-user-*` headers (trust-the-edge; already done by auth hook)
2. `SELECT * FROM users WHERE oid = req.user.oid` → `existingUser` (null if first provision)
3. If `existingUser && !existingUser.isActive`: throw 409 "User was deprovisioned; contact admin" and abort
4. Call `graph.getUserGroups(req.user.oid)` → `groupIds: string[]` (external, idempotent read)
5. Pure-function check: `teamsConfig.isUserAuthorized(groupIds)` → if false, throw 403 and abort
6. Pure-function resolution: `qualifyingTeams = teamsConfig.getQualifyingTeams(groupIds)` → `TeamConfig[]`
7. If `existingUser` exists: `SELECT user_id, team_id, team_alias FROM user_team_memberships WHERE user_id = existingUser.id` → `existingMemberships: Set<teamId>`
8. If `existingUser` exists: `SELECT id, team_id FROM provisioned_keys WHERE user_id = existingUser.id AND status = 'active'` → `existingActiveKeysByTeam: Map<teamId, keyId>`

**Phase 2 — Execution (single outer transaction, interleaved external calls):**

```typescript
return await db.transaction(async (tx) => {
  // 2a. Upsert user row
  const user = existingUser ?? (await tx.insert(users).values({
    oid: req.user.oid,
    email: req.user.email,
    displayName: req.user.name,
    litellmUserId: req.user.email,
    isActive: true,
  }).returning())[0];

  // 2b. Ensure LiteLLM user exists (idempotent via /user/info lookup)
  const ltUser = await litellm.getUser(user.email);
  if (!ltUser) {
    await litellm.createUser({ user_id: user.email, user_email: user.email, user_alias: user.displayName });
    await logAction(tx, { actorEmail: user.email, actorEntraOid: user.oid, action: "user.provisioned", targetType: "user", targetId: user.id });
  }

  // 2c. For each qualifying team, create-if-missing (team + membership + key)
  const teamsProvisioned: Array<{team_id: string, team_alias: string}> = [];
  const keysGenerated: Array<{key_id: string, key: string, key_alias: string, team_alias: string, portal_expires_at: Date}> = [];

  for (const team of qualifyingTeams) {
    // LiteLLM team (idempotent via /team/info lookup)
    const ltTeam = await litellm.getTeam(team.entraGroupId);
    if (!ltTeam) {
      await litellm.createTeam({ team_id: team.entraGroupId, team_alias: team.teamAlias, models: team.models, max_budget: team.maxBudget, budget_duration: team.budgetDuration, max_budget_in_team: team.teamMemberBudget > 0 ? team.teamMemberBudget : null });
      await logAction(tx, { actorEmail: user.email, actorEntraOid: user.oid, action: "team.synced", targetType: "team", targetId: team.entraGroupId });
    }
    teamsProvisioned.push({ team_id: team.entraGroupId, team_alias: team.teamAlias });

    // Membership (idempotent via pre-flight set)
    if (!existingMemberships.has(team.entraGroupId)) {
      await litellm.addTeamMember({ team_id: team.entraGroupId, user_id: user.email, role: team.litellmRole });
      await tx.insert(userTeamMemberships).values({
        userId: user.id,
        teamId: team.entraGroupId,
        teamAlias: team.teamAlias,
        entraGroupId: team.entraGroupId,
        litellmRole: team.litellmRole,
      });
      await logAction(tx, { actorEmail: user.email, actorEntraOid: user.oid, action: "membership.added", targetType: "membership", targetId: team.entraGroupId });
    }

    // Initial key (only if user has no active key for this team — re-provision is a no-op for keys)
    if (!existingActiveKeysByTeam.has(team.entraGroupId)) {
      const keyAlias = await buildKeyAliasWithCollisionGuard(tx, user.email, team.teamAlias);
      const expiresAt = new Date(Date.now() + user.defaultKeyDurationDays * 24 * 60 * 60 * 1000);
      const keyResp = await litellm.generateKey({ user_id: user.email, team_id: team.entraGroupId, models: team.models, key_alias: keyAlias, duration: `${user.defaultKeyDurationDays}d` });
      const rawKey = keyResp.key;
      const [inserted] = await tx.insert(provisionedKeys).values({
        userId: user.id,
        litellmKeyId: keyResp.token ?? keyResp.key_name,
        litellmKeyAlias: keyAlias,
        keyPreview: makeKeyPreview(rawKey),
        teamId: team.entraGroupId,
        teamAlias: team.teamAlias,
        status: "active",
        portalExpiresAt: expiresAt,
      }).returning();
      keysGenerated.push({ key_id: inserted.id, key: rawKey, key_alias: keyAlias, team_alias: team.teamAlias, portal_expires_at: expiresAt });
      await logAction(tx, { actorEmail: user.email, actorEntraOid: user.oid, action: "key.generated", targetType: "key", targetId: inserted.id, details: { team_id: team.entraGroupId } });
    }
  }

  return { user_id: user.id, litellm_user_id: user.email, teams_provisioned: teamsProvisioned, keys_generated: keysGenerated };
});
```

**Idempotency semantics:**

- A second `POST /api/provision` call for a fully-provisioned user iterates all teams, finds each `existingMembership` and `existingActiveKeysByTeam` match, and returns `{teams_provisioned: [...all teams...], keys_generated: []}` — the teams list echoes the current state but no new LiteLLM or DB writes occur.
- A call for a user who is newly added to an additional Entra group (already provisioned for one team, now qualifying for a second) adds only the new team + membership + initial key. The first team is untouched.
- A call for an already-provisioned user who has had their email updated via `PATCH /api/user/profile` finds the existing row, does not re-create the LiteLLM user (the LiteLLM `user_id` is the OLD email, which is still the value in `users.litellmUserId`), and therefore does not accidentally create a duplicate LiteLLM user. See Decision 7 and the `email-mutability-vs-litellm-user-id` note below.

**Failure semantics:**

Because external LiteLLM writes are interleaved with the Drizzle transaction, a transaction rollback does NOT un-do external LiteLLM side effects. Specifically:

- If `litellm.createTeam` succeeds but the subsequent `tx.insert(userTeamMemberships)` fails, the transaction rolls back. The LiteLLM team remains created — correct outcome, because the team is idempotent on the LiteLLM side and a retry will find it via `/team/info` and skip the create.
- If `litellm.addTeamMember` succeeds but a later step in the same team's iteration fails, the transaction rolls back. The LiteLLM membership remains — next retry's pre-flight read sees it via `existingMemberships` and skips.
- If `litellm.generateKey` succeeds but the subsequent `tx.insert(provisionedKeys)` fails (e.g., DB connection drop), the transaction rolls back. **The LiteLLM key is orphaned** — it exists in LiteLLM but has no DB row. Next retry's pre-flight read does NOT see it (we look up by our DB's `provisioned_keys`, not LiteLLM's `/key/list`), so the retry calls `/key/generate` again and creates a second key. The orphan remains and accumulates `last_spend` unattributed.

**Mitigation for the orphan-key failure mode:**

1. **Primary mitigation**: the reconciliation cron (Phase 2, deferred) calls LiteLLM `/key/list` and compares against our DB; orphans are flagged and can be force-deleted. Not in this change.
2. **Partial mitigation in Phase 1**: if `tx.insert(provisionedKeys)` throws, the catch handler in the route handler attempts a best-effort `litellm.deleteKey(keyResp.token)` call BEFORE propagating the error to the client. This is a two-phase commit emulation — if the compensating delete succeeds, the rollback is clean; if it fails (e.g., LiteLLM is down), log the orphan with a distinct log level (`level: "error"`, `orphaned_key_id: ...`) and emit an audit entry `action: "key.generation_orphaned"` for a future reconciliation cron to pick up.
3. **Known gap**: between the transaction rollback and the compensating delete, there is a window where the orphan has no DB trace. If the 1code-api process crashes in this window, the orphan is unrecorded. Apollos has the same gap and accepts it.

**Pre-flight reads racing against the writes:**

Between phase 1 reads and the phase 2 transaction opening, another concurrent `POST /api/provision` request from the same user (e.g., a retry during a network blip) could modify state. Phase 2 re-reads `existingUser` inside the transaction via the `users.oid` unique index lookup, but the `existingMemberships` and `existingActiveKeysByTeam` sets are from phase 1. This is acceptable because:

- The `uq_user_team` unique constraint on `user_team_memberships (user_id, team_id)` serializes concurrent membership inserts. The loser of the race hits a constraint violation, the transaction rolls back, and the loser's LiteLLM membership (if any) is a no-op on next retry.
- The `provisioned_keys.litellmKeyAlias` collision guard prepends a uuid suffix on second-attempt inserts, so the worst case of concurrent first-key generation is two keys with different aliases — accepted duplicate, recoverable via future reconciliation cron or user revocation.
- The `apollos-portal` rate limit of 5/min on `POST /api/provision` is ported into this change (§ "API endpoint design" and task 6.1), which makes the race window narrow in practice.

**Rejected alternatives:**

- **"Single outer transaction wrapping all external calls"** (the previous version of this decision) — fails because `db.transaction()` holds a Postgres row lock on `users` for the duration, blocking concurrent reads, and because the transaction can't actually un-do LiteLLM side effects anyway (the whole "atomic" framing was wrong).
- **"Two-phase commit via a dedicated `pending_provisions` staging table"** — correct but heavy for a Phase 1 build. Defer to a follow-up proposal if the orphan-key failure mode ever bites in production.
- **"Fully optimistic: do LiteLLM writes, then DB writes, ignore failures"** — explicitly what Apollos does today. We pick a slightly stronger pattern (pre-flight reads + compensating deletes) because we can afford the additional code.

### Decision 9: Five-state key status with derived `expired` and `expiring_soon`

**Context:** Apollos's `apollos-portal/backend/app/services/key_service.py:51-62` defines a `_compute_status` function that derives one of five string states from `(persisted_status, portal_expires_at, now)`:

- `"rotated"` — from persisted status (terminal)
- `"revoked"` — from persisted status (terminal)
- `"expired"` — persisted status is `"active"` but `portal_expires_at <= now`
- `"expiring_soon"` — persisted status is `"active"` and `0 < days_until_expiry <= 14`
- `"active"` — persisted status is `"active"` and `days_until_expiry > 14`

The `"expired"` and `"expiring_soon"` states are **computed at read time** and never persisted. The `provisioned_keys.status` column only ever holds `"active"`, `"revoked"`, or `"rotated"`.

**Decision:** Port Apollos's five-state scheme exactly, including both the computed states. Use a Drizzle `pgEnum("key_status", [...5 values])` as the shared source of truth for the DB column, the Zod response schema, and the TypeScript union type. The enum allows all five values so that API responses can use the same type as the DB column, but the `provisioning.ts` / `key-service.ts` code must never insert `"expired"` or `"expiring_soon"` into the DB.

**Rationale:** The `expiring_soon` state is load-bearing for the 1Code desktop app's in-app notification strategy. `proposal.md` §"Explicit non-goals" says "Email notifications" are out of scope because "we replace [them] with in-app notifications in the Electron desktop app based on `days_until_expiry` returned by `GET /api/keys`." Without the `expiring_soon` state, the desktop app would have to duplicate the 14-day threshold logic client-side, which creates drift risk if the threshold ever changes. Keeping the server as the single source of truth matches Apollos.

**Unit tests** for `_computeStatus` (task 8.5) MUST cover all five states explicitly, with boundary cases:

- `days_until_expiry = 15` → `"active"`
- `days_until_expiry = 14` → `"expiring_soon"` (inclusive boundary)
- `days_until_expiry = 1` → `"expiring_soon"`
- `days_until_expiry = 0` → `"expired"` (exclusive lower boundary on expiring_soon)
- `days_until_expiry = -5` → `"expired"` (well past)
- `status = "revoked"` overrides all → `"revoked"`
- `status = "rotated"` overrides all → `"rotated"`

### Decision 10: Single-replica deployment enforced as a spec contract, not only a design note

**Context:** The provisioning and rotation crons are stateless but NOT safe to run concurrently across multiple 1code-api replicas. A naive scale-up from `replicas: 1` to `replicas: 3` would cause every cron run to fire three times in parallel, producing: (a) triplicate audit rows, (b) triplicate LiteLLM delete-then-create sequences on the same expired key (with one winner and two failures), (c) potential `uq_user_team` collisions during race-y provision calls.

The 1code-api Helm release at `deploy/kubernetes/1code-api/app/helmrelease.yaml:36` currently specifies `replicas: 1`. Nothing prevents a future operator from changing that value.

**Options considered:**

- **Option R1 — Document as a design note only.** (What the previous version of the proposal did.) Fragile — a single mis-edit to the Helm release breaks the system silently.
- **Option R2 — Add a Requirement to the capability spec declaring single-replica as a contract.** The Requirement forces future proposals to either uphold the constraint or explicitly supersede it. A regression test in `tests/regression/` can parse the Helm release YAML and fail if `replicas != 1`.
- **Option R3 — Implement a Postgres advisory-lock wrapper around each cron job.** Supports multi-replica deployments from day one. Significantly more code, needs careful lock-holder liveness handling, and defers the design question of "which replica serves HTTP requests during a cron run."

**Decision: Option R2.** Adds one Requirement to `specs/1code-api-litellm-provisioning/spec.md` (see the new "Scheduler runs in a single replica" Requirement) and one tasks.md entry (9.8) to create a regression test that reads `deploy/kubernetes/1code-api/app/helmrelease.yaml` and asserts `replicas: 1` is explicitly set. A future proposal can relax this via Option R3 if multi-replica becomes necessary.

**Rationale:** The contract-level enforcement catches the scale-up footgun at review time rather than at 3 AM when cron collisions start producing duplicate billing events. The regression test cost is ~30 LOC.

## Architecture overview

See §2 of `.scratchpad/1code-api-provisioning-research.md` for the full ASCII architecture diagram. Condensed version:

```
Electron (MSAL Node, public client)
    ↓ Bearer <entra-token>
Envoy Gateway (JWT validation, claimToHeaders injection)
    ↓ x-user-oid, x-user-email, x-user-name
1code-api Fastify
    ├─ Route handlers (/api/provision/*, /api/keys/*)
    │   └─ Services (provisioning, key-service)
    │       ├─ GraphClient (app-only, MSAL confidential)
    │       │   └─ Graph API /users/{oid}/memberOf
    │       ├─ LiteLLMClient (master_key Bearer)
    │       │   └─ LiteLLM /team, /user, /key admin endpoints
    │       └─ Drizzle (Postgres)
    │           └─ provisioned_keys, user_team_memberships, audit_log
    └─ node-cron scheduler
        ├─ deprovisioning (6h)
        └─ rotation (6h)
```

## Module layout

```
services/1code-api/
├── config/
│   ├── teams.yaml.example          # committed template
│   └── teams.yaml                  # gitignored runtime
├── src/
│   ├── lib/
│   │   ├── teams-config.ts         # YAML loader, TeamsConfig/TeamConfig types, resolution
│   │   ├── graph-client.ts         # MSAL confidential client, getUserGroups with pagination + caching
│   │   ├── litellm-client.ts       # 8-method admin API client (subset of Apollos's 15)
│   │   ├── scheduler.ts            # node-cron setup + lifecycle (start/stop)
│   │   └── audit.ts                # log_action helper writing to audit_log table
│   ├── services/
│   │   ├── provisioning.ts         # provision_user + get_provision_status
│   │   ├── key-service.ts          # list_user_keys, create_key, rotate_key, revoke_key
│   │   ├── deprovisioning.ts       # run_deprovisioning_job + _deprovision_user
│   │   └── rotation.ts             # run_rotation_job + _auto_rotate_key
│   ├── schemas/
│   │   ├── provision.ts            # Zod request/response for /api/provision/*
│   │   └── keys.ts                 # Zod request/response for /api/keys/*
│   ├── routes/
│   │   ├── provision.ts            # GET /status + POST /
│   │   └── keys.ts                 # GET /, POST /new, POST /:id/rotate, POST /:id/revoke
│   ├── auth.ts                     # (unchanged — already trust-the-edge)
│   ├── config.ts                   # (extended — add new env vars to Zod schema)
│   ├── db/
│   │   └── schema.ts               # (extended — 4 new columns on users + 3 new tables)
│   ├── index.ts                    # (modified — register new routes, start scheduler, flag gate)
│   └── routes/ (existing)
└── tests/
    ├── lib/*.test.ts
    ├── services/*.test.ts
    ├── routes/*.test.ts
    └── integration/*.test.ts       # docker-compose with LiteLLM + Postgres
```

## Database schema changes

### Extended `users` table (in place, new `id` PK + demote `oid` to unique index)

```typescript
// services/1code-api/src/db/schema.ts
import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),               // NEW internal UUID PK
    oid: text("oid").notNull(),                                // Entra object ID (demoted from PK to unique)
    email: text("email").notNull(),
    displayName: text("display_name").notNull().default(""),
    // New provisioning columns
    litellmUserId: text("litellm_user_id"),                    // = email written to LiteLLM /user/new
    isActive: boolean("is_active").notNull().default(true),
    defaultKeyDurationDays: integer("default_key_duration_days").notNull().default(90),
    deprovisionedAt: timestamp("deprovisioned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    oidUnique: uniqueIndex("users_oid_unique").on(table.oid),
  }),
);
```

All new columns are nullable or have defaults → backward-compatible migration for the existing row set. The PK change is handled in two Drizzle migration steps (fill `id` with `gen_random_uuid()`, then swap the primary key) — see Decision 2 for details.

### New `keyStatus` enum (for `provisionedKeys.status`)

```typescript
export const keyStatus = pgEnum("key_status", ["active", "revoked", "rotated", "expired", "expiring_soon"]);
```

The five-value enum matches Apollos's `_compute_status` at `apollos-portal/backend/app/services/key_service.py:51-62`. See Decision 9 for semantics.

### New `provisionedKeys` table

```typescript
export const provisionedKeys = pgTable("provisioned_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),     // uuid FK to users.id
  litellmKeyId: text("litellm_key_id").unique(),              // LiteLLM's `token` or `key_name`
  litellmKeyAlias: text("litellm_key_alias").notNull(),       // "{emailPrefix}-{teamSlug}"
  keyPreview: text("key_preview"),                            // "sk-...Ab1z"
  teamId: text("team_id").notNull(),                          // = entraGroupId (LiteLLM team ID)
  teamAlias: text("team_alias").notNull(),
  status: keyStatus("status").notNull().default("active"),    // pgEnum — 5 states
  portalExpiresAt: timestamp("portal_expires_at", { withTimezone: true }).notNull(),
  rotatedFromId: uuid("rotated_from_id").references(
    (): AnyPgColumn => provisionedKeys.id,                    // typed self-FK
    { onDelete: "set null" },                                 // matches Apollos behavior
  ),
  lastSpend: numeric("last_spend", { precision: 12, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
```

### New `userTeamMemberships` table

```typescript
export const userTeamMemberships = pgTable(
  "user_team_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),   // uuid FK to users.id
    teamId: text("team_id").notNull(),                         // = entraGroupId
    teamAlias: text("team_alias").notNull(),
    entraGroupId: text("entra_group_id").notNull(),            // duplicates teamId for audit clarity
    litellmRole: text("litellm_role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueUserTeam: uniqueIndex("uq_user_team").on(table.userId, table.teamId),
  }),
);
```

### New `auditLog` table

```typescript
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorEmail: text("actor_email").notNull(),       // user.email OR "system@1code-api"
  actorEntraOid: text("actor_entra_oid").notNull(),
  action: text("action").notNull(),                // "user.provisioned" | "key.generated" | ...
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  details: text("details"),                        // JSON-stringified payload
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

## API endpoint design

### `GET /api/provision/status`

**Rate limit:** 60/min per authenticated user (keyed on `x-user-oid`).
**Returns:** current provisioning state for the authenticated user. `user_id` is the internal UUID primary key of `users.id`; `oid` is the Entra object ID; `email` is mutable via `PATCH /api/user/profile`.

```json
{
  "provisioned": true,
  "user": {
    "user_id": "11111111-2222-3333-4444-555555555555",
    "oid": "abc-123-def-456-ghi",
    "email": "user@example.com",
    "display_name": "User Example",
    "litellm_user_id": "user@example.com",
    "is_active": true,
    "created_at": "2026-04-10T18:00:00.000Z"
  },
  "teams": [
    { "team_id": "f70ded09-fd52-4bc1-a024-be6bda9e39b3", "team_alias": "Workload Hosting Team" }
  ],
  "key_count": 2
}
```

If user is not provisioned: `{"provisioned": false, "user": null, "teams": [], "key_count": 0}`.

### `POST /api/provision`

**Rate limit:** 5/min per authenticated user (keyed on `x-user-oid`).
**Request body:** none (user identity from `x-user-*` headers).
**Returns:** full provisioning result including raw key values (shown once). `user_id` is the internal UUID of `users.id`, NOT the Entra OID.

```json
{
  "user_id": "11111111-2222-3333-4444-555555555555",
  "litellm_user_id": "user@example.com",
  "teams_provisioned": [
    { "team_id": "f70ded09-fd52-4bc1-a024-be6bda9e39b3", "team_alias": "Workload Hosting Team" }
  ],
  "keys_generated": [
    {
      "key_id": "22222222-3333-4444-5555-666666666666",
      "key": "sk-...rawKeyValue",
      "key_alias": "user-workload-hosting-team",
      "team_alias": "Workload Hosting Team",
      "portal_expires_at": "2026-07-10T18:00:00.000Z"
    }
  ]
}
```

Error cases:

- `403` — user not in any authorized Entra group (gate check from `required_groups`)
- `409` — user exists but is deprovisioned (`is_active = false`)
- `503` — `PROVISIONING_ENABLED=false`
- `500` — Graph API failure or LiteLLM API failure (with details in error body)

### `GET /api/keys`

**Rate limit:** 60/min per authenticated user (keyed on `x-user-oid`).
**Returns:** active and revoked key lists with masked previews. `status` is one of `active | expiring_soon | expired | revoked | rotated`.

```json
{
  "active": [
    {
      "id": "22222222-3333-4444-5555-666666666666",
      "key_alias": "user-workload-hosting-team",
      "key_preview": "sk-...Ab1z",
      "team_id": "f70ded09-fd52-4bc1-a024-be6bda9e39b3",
      "team_alias": "Workload Hosting Team",
      "status": "active",
      "created_at": "2026-04-10T18:00:00.000Z",
      "expires_at": "2026-07-10T18:00:00.000Z",
      "days_until_expiry": 91,
      "last_spend": null
    },
    {
      "id": "33333333-4444-5555-6666-777777777777",
      "key_alias": "user-engineering-services-team",
      "key_preview": "sk-...Xy9Q",
      "team_id": "29a6e097-dc23-46c1-9804-0aca9593c79e",
      "team_alias": "Engineering Services Team",
      "status": "expiring_soon",
      "created_at": "2026-01-20T12:00:00.000Z",
      "expires_at": "2026-04-20T12:00:00.000Z",
      "days_until_expiry": 10,
      "last_spend": "12.3400"
    }
  ],
  "revoked": []
}
```

Key status derivation (matching Apollos's `_compute_status` at `apollos-portal/backend/app/services/key_service.py:51-62` — five states, all values surfaced in the response):

- `"rotated"` if the DB row has `status = "rotated"` (auto-rotated by cron or user-initiated rotation). Appears in the `revoked` array.
- `"revoked"` if the DB row has `status = "revoked"` (explicit user revocation). Appears in the `revoked` array.
- `"expired"` if the DB row has `status = "active"` AND `portal_expires_at < now` (waiting for the rotation cron to pick up, or rotation failed). Appears in the `active` array with `days_until_expiry = 0`.
- `"expiring_soon"` if the DB row has `status = "active"` AND `0 < days_until_expiry <= 14`. Appears in the `active` array. This state exists specifically so the 1Code desktop app can surface an in-app warning banner to the user via `GET /api/keys` polling, replacing Apollos's expiry email notifications (which are out of scope for Phase 1).
- `"active"` otherwise (status = "active" AND days_until_expiry > 14). Appears in the `active` array.

The persisted `provisioned_keys.status` column only ever holds `"active"`, `"revoked"`, or `"rotated"` — the terminal states from the provisioning + rotation + revocation flows. The `"expired"` and `"expiring_soon"` values are **derived at read time** from `(status, portal_expires_at, now)` and are never written to the database. This matches Apollos exactly and keeps the rotation cron's state-change responsibilities clean (cron transitions `active → rotated`, never through an intermediate `expired` state).

The `keyStatus` Drizzle pgEnum declared in the schema section still lists all five values because the enum type is reused in the Zod schema for API response validation (see `schemas/keys.ts` in task 5.2) — a single source of truth. The DB `CHECK` on the column is enforced by the enum type itself.

### `POST /api/keys/new`

**Rate limit:** 10/min per user.
**Request body:** `{ "team_id": "<entra-group-id>" }`.
**Returns:** new key with raw value.

User must be a member of the specified team (checked against `userTeamMemberships`). Returns `403` if not a member, `404` if team does not exist in config, `503` if flag is off.

### `POST /api/keys/:keyId/rotate`

**Rate limit:** 5/min per user.
**Returns:** new key value + old key reference.

Only active keys can be rotated. The old key is deleted in LiteLLM, marked `status = "rotated"` in DB, and a new key is generated with `rotated_from_id = oldKey.id`. Returns `404` if key not found, `409` if key is not active, `503` if flag is off.

### `POST /api/keys/:keyId/revoke`

**Rate limit:** 5/min per user.
**Returns:** revocation timestamp.

Deletes the key in LiteLLM and marks `status = "revoked"` + `revoked_at = now` in DB. Returns `404` if key not found, `409` if key is not active, `503` if flag is off.

## Cron design

### Deprovisioning cron (at 00:00, 06:00, 12:00, 18:00 daily — cron `0 */6 * * *`)

**Note on schedule interpretation:** The cron expression `0 */6 * * *` fires at fixed aligned boundaries (`00:00`, `06:00`, `12:00`, `18:00` in the pod's timezone), NOT "every 6 hours since boot." This matches Apollos's default `DEPROVISIONING_CRON_SCHEDULE = "0 */6 * * *"` (`talos-ai-cluster/kubernetes/apps/ai/apollos-portal/app/helmrelease.yaml:57`). If the pod starts at 02:00, the first deprovisioning run fires at 06:00, not 08:00. This is intentional — aligned boundaries make it easier to correlate cron output with operator observability windows.

Per `apollos-portal/backend/app/services/deprovisioning_service.py:83-146`:

1. `SELECT id FROM users WHERE is_active = true AND deprovisioned_at IS NULL`
2. For each user ID:
   a. Re-fetch user + eager-load keys (fresh transaction)
   b. Call `graphClient.getUserGroups(user.oid)`
   c. Call `teamsConfig.isUserAuthorized(groupIds)` — if true, skip
   d. If false: for each active key, call `litellm.deleteKey(key.litellmKeyId)` (best-effort; log failures), mark key `status = "revoked"`, `revoked_at = now`; mark user `is_active = false`, `deprovisioned_at = now`; write audit entries
   e. Commit
3. Log summary `{deprovisioned: N, errors: M}`

Per-user try/catch so one Graph failure doesn't kill the whole job.

### Rotation cron (every 6 hours)

Per `apollos-portal/backend/app/services/rotation_service.py:125-178`:

1. `SELECT key.id FROM provisioned_keys WHERE status = 'active' AND portal_expires_at <= now() JOIN users ON key.user_oid = users.oid WHERE users.is_active = true`
2. For each key ID:
   a. Re-fetch key + user + teamsConfig (fresh transaction)
   b. Call `litellm.deleteKey(oldKey.litellmKeyId)` (best-effort)
   c. Mark old key `status = "rotated"`, `revoked_at = now`
   d. Compute new alias `{emailPrefix}-{slugify(teamAlias)}`, append uuid suffix on collision
   e. Resolve team config to get model list
   f. Call `litellm.generateKey({ user_id, team_id, models, key_alias: newAlias, duration: `${days}d` })`
   g. Insert new `provisionedKeys` row with `rotated_from_id = oldKey.id`
   h. Write audit entry
   i. Commit
3. Log summary `{rotated: N, failed: M}`

## Error handling matrix

| Error class | Endpoint | Response | Logged? |
|---|---|---|---|
| Flag disabled | all new routes | 503 `{"error": "provisioning disabled"}` | no |
| Missing auth headers | all new routes | 401 from existing auth hook | yes (auth middleware) |
| User not in authorized groups | `POST /api/provision` | 403 `{"error": "Not in any authorized group"}` | yes |
| User already deprovisioned | `POST /api/provision` | 409 `{"error": "User was deprovisioned; contact admin"}` | yes |
| User not a team member | `POST /api/keys/new` | 403 `{"error": "Not a member of this team"}` | yes |
| Key not owned by user | `POST /api/keys/:id/*` | 404 `{"error": "Key not found"}` | yes |
| Graph API 5xx | any | 502 `{"error": "Graph API unavailable"}` | yes (with stack) |
| LiteLLM 5xx | any | 502 `{"error": "LiteLLM unavailable"}` | yes (with stack) |
| Database failure | any | 500 `{"error": "Internal server error"}` | yes (with stack) |

All errors emit structured logs via pino (matching the existing 1code-api logging config at `services/1code-api/src/index.ts:11-14`).

## Testing strategy

### Unit tests (`tests/lib/` and `tests/services/`)

- `teams-config.test.ts` — YAML parsing, `getQualifyingTeams` with default suppression, `isUserAuthorized` with empty vs non-empty `required_groups`
- `graph-client.test.ts` — token caching behavior, pagination via `@odata.nextLink`, error on 4xx, `fetch` mocked
- `litellm-client.test.ts` — each of 8 methods with `fetch` mocked, including 404 handling for `getUser`/`getTeam`
- `provisioning.test.ts` — idempotency (second call returns existing state), error paths (Graph failure, LiteLLM failure, unauthorized user)
- `key-service.test.ts` — all 4 operations, alias collision suffix, status derivation for all 4 states
- `deprovisioning.test.ts` — user still authorized → skip, user no longer authorized → delete keys + mark inactive, Graph error → per-user catch
- `rotation.test.ts` — expired key → rotation creates new with `rotated_from_id` link, LiteLLM delete failure → log and proceed

### Integration tests (`tests/integration/`)

- `provision-flow.test.ts` — docker-compose with real Postgres + LiteLLM OSS container, seed a test user in Entra mock, call `POST /api/provision`, verify LiteLLM state + DB state
- `deprovisioning-flow.test.ts` — seed a user, remove them from the mock Entra group, run the cron manually, verify keys deleted in LiteLLM and user marked inactive in DB
- `rotation-flow.test.ts` — seed an expired key, run the cron manually, verify old key deleted in LiteLLM + new key created with `rotated_from_id`

The Entra "mock" is a stub that returns hardcoded group memberships — we're not testing Graph API semantics, we're testing our client's correct handling of its response shape.

## Migration from Apollos (operational, not in this change)

This change does **not** include the Apollos decommission. The operational runbook for that will live at `docs/enterprise/apollos-decommission-runbook.md` (created as task 9.6 in `tasks.md`). The runbook will cover:

1. Pre-cutover: mint new Graph Entra app reg, add to `cluster.yaml`, deploy with `PROVISIONING_ENABLED=false`, smoke test
2. Cutover window: stop Apollos crons atomically with `PROVISIONING_ENABLED=true` flip via Flux reconcile
3. Data migration: one-shot script reading `apollos_portal_db.provisioned_users` and `provisioned_keys`, translating rows, inserting into 1code-api's DB
4. Soak: monitor Grafana, check for drift, verify cron runs successfully
5. Apollos scale-down: HelmRelease to 0 replicas, keep DB backups for 90 days
6. Apollos removal: delete Kustomization, drop `apollos-portal-db` CNPG cluster, remove `apollos_portal_*` from `cluster.yaml`
7. Final Entra cleanup: delete `2938f422-ae63-48ee-b129-1d75b420aeeb` app reg

## Open questions

These are flagged for resolution during implementation or the decommission runbook; none block merging the proposal.

1. **Data migration strategy for existing Apollos users** — resolved by Decision 2 (uuid PK matches Apollos). The decommission runbook (task 10.4) specifies a one-shot `INSERT INTO ... SELECT FROM` script with no FK rewrite. Open sub-question: does the migration script preserve the Apollos `provisioned_users.id` UUIDs into 1code-api's `users.id`, or does it generate fresh UUIDs and maintain an `entra_oid → new_id` mapping table for the cascade? Recommend preserving the originals — avoids rewriting child FKs.
2. **Key preview for Apollos-imported keys** — Apollos does NOT persist a `key_preview` for historical keys (it only computes it at create time from the raw value). Imported keys would have `key_preview = null`. Runbook decision: accept nulls for imported keys and surface them as `"sk-...????"` in the desktop UI, OR trigger a forced rotation on first access post-cutover to refresh the preview. Recommend: accept nulls for historical keys, document the UI fallback in the 1code-api-provisioning.md operator guide.
3. **Audit log retention** — Apollos has no retention policy. Defer to Phase 2 (new proposal) with a separate retention cron that deletes rows older than N days. For Phase 1, the audit_log table grows unbounded — acceptable for small user bases, flagged in the operator guide.
4. **teams.yaml hot-reload** — Phase 1 requires pod restart for `teams.yaml` changes. Documented as a known limitation in `design.md` §"Decision 4: teams.yaml ownership". A future proposal may add SIGHUP-triggered reload or a 5-minute poll timer.
5. **Prometheus `/metrics` endpoint** — moved to `proposal.md` §"Explicit non-goals". A separate cross-cutting observability proposal will add `/metrics` to both 1code-api and any other services under the same pattern. Not in this change's scope.
6. **`rotated_from_id` self-FK ON DELETE behavior** — resolved in the schema section: `onDelete: "set null"` (matches Apollos's default RESTRICT-is-not-specified behavior, but explicitly set so Drizzle's generated migration is clear). Typed self-FK uses `AnyPgColumn` per Drizzle docs.
7. **Split-brain prevention during cutover** — delegated to the decommission runbook (task 10.4) via the `MIGRATION_COMPLETE` env var pattern or equivalent gate. Not encoded in this change because the gate is operational, not a spec contract.
