---
title: 1code-api LiteLLM Provisioning
description: Architecture, API reference, and operator runbook for the self-hosted LiteLLM provisioning subsystem in 1code-api.
---

# 1code-api LiteLLM Provisioning

The 1code-api service provides a self-hosted replacement for Apollos's LiteLLM provisioning portal. It lets authenticated users request their own LiteLLM API keys based on their Entra security group membership, with no operator intervention required per user.

**Status:** Phase 1 — all endpoints implemented behind a feature flag. Integration testing is deferred until the cluster-side prerequisites land in `talos-ai-cluster`.

## Architecture

```mermaid
flowchart LR
  desktop["Electron desktop app<br/>(MSAL public client)"]
  envoy["Envoy Gateway<br/>(JWT validation)"]
  api["1code-api<br/>(Fastify + Drizzle)"]
  db[("Postgres<br/>(users, keys,<br/>memberships, audit)")]
  graph["Microsoft Graph<br/>(confidential client)"]
  litellm["LiteLLM<br/>(master_key Bearer)"]

  desktop -->|bearer token| envoy
  envoy -->|x-user-*| api
  api -->|select/insert| db
  api -->|getUserGroups| graph
  api -->|/team/new, /user/new, /key/generate| litellm
```

The service trusts Envoy Gateway's validated JWT claims via `x-user-oid`, `x-user-email`, and `x-user-name` headers. All business logic assumes those headers are authoritative — there is no secondary JWT verification inside the service.

### Key design decisions

These are the load-bearing decisions from the OpenSpec proposal. Read the full design in `openspec/changes/add-1code-api-litellm-provisioning/design.md`.

- **Two Entra app registrations.** The existing public client (loopback MSAL in the desktop app) stays as-is. A NEW confidential client is minted for server-side Microsoft Graph calls, with `GroupMember.Read.All` application permission and admin consent granted.
- **UUID primary key.** `users.id` is a UUID with `oid` kept as a unique-indexed secondary column. Three child tables (`provisionedKeys`, `userTeamMemberships`, `auditLog`) use UUID foreign keys to `users.id`.
- **Feature flag `PROVISIONING_ENABLED`.** When `false`, all provisioning endpoints return HTTP 503 and the background cron scheduler does not start. The flag is read once at boot; flipping it requires a pod restart.
- **Two-phase provisioning transaction.** Pre-flight reads (no writes) capture existing state for idempotency decisions, then the execution phase interleaves external API calls with DB writes inside a single Drizzle transaction. See design §Decision 8 for the full state machine.
- **Five-state key status.** Persisted values are `active | revoked | rotated`. The values `expired` and `expiring_soon` are derived at read time from `(persisted_status, portal_expires_at, now)` with a 14-day threshold.
- **Single-replica enforcement.** The deprovisioning + rotation crons are not safe to run concurrently. `helmrelease.yaml` pins `replicas: 1` and a regression guard (`tests/regression/1code-api-single-replica.test.ts`) enforces the pin.

## API reference

All endpoints require the `x-user-oid`, `x-user-email`, and `x-user-name` headers set by Envoy Gateway. All endpoints return HTTP 503 when `PROVISIONING_ENABLED=false`.

### `GET /api/provision/status`

Returns the current provisioning state for the authenticated user.

**Rate limit:** 60/min per user OID.

**Response 200:**
```json
{
  "user_id": "<uuid>",
  "oid": "<entra oid>",
  "email": "user@example.com",
  "is_active": true,
  "teams": [
    { "team_id": "<entra group id>", "team_alias": "Engineering" }
  ],
  "active_key_count": 1
}
```

**Response 404:** User not yet provisioned.

### `POST /api/provision`

Provision the authenticated user. Idempotent — repeat calls for a fully-provisioned user return the same teams with `keys_generated: []`.

**Rate limit:** 5/min per user OID.

**Response 200:**
```json
{
  "user_id": "<uuid>",
  "litellm_user_id": "user@example.com",
  "teams_provisioned": [
    { "team_id": "<entra group id>", "team_alias": "Engineering" }
  ],
  "keys_generated": [
    {
      "key_id": "<uuid>",
      "key": "sk-abc...",
      "key_alias": "user-engineering",
      "team_alias": "Engineering",
      "portal_expires_at": "2026-07-10T00:00:00.000Z"
    }
  ]
}
```

**Response 403:** User is not in any `required_groups` from `teams.yaml`.

**Response 409:** User was previously deprovisioned (contact admin to re-enable).

### `GET /api/keys`

List the authenticated user's active and revoked keys.

**Rate limit:** 60/min per user OID.

**Response 200:**
```json
{
  "active": [
    {
      "key_id": "<uuid>",
      "key_preview": "sk-a...wxyz",
      "key_alias": "user-engineering",
      "team_id": "<entra group id>",
      "team_alias": "Engineering",
      "status": "active",
      "days_until_expiry": 87,
      "portal_expires_at": "2026-07-10T00:00:00.000Z",
      "rotated_from_id": null,
      "created_at": "2026-04-11T00:00:00.000Z"
    }
  ],
  "revoked": []
}
```

### `POST /api/keys/new`

Create a new key for the authenticated user in the specified team.

**Rate limit:** 10/min per user OID.

**Request:**
```json
{ "team_id": "<entra group id>" }
```

**Response 200:** Same shape as `keys_generated[0]` in `POST /api/provision`.

**Response 403:** User is not a member of the specified team.

### `POST /api/keys/:keyId/rotate`

Rotate an existing key. Generates a new key, marks the old one as `rotated`, and links them via `rotated_from_id`.

**Rate limit:** 5/min per user OID.

**Response 200:**
```json
{
  "new_key_id": "<uuid>",
  "key": "sk-new...",
  "key_alias": "user-engineering",
  "old_key_id": "<old uuid>"
}
```

**Response 404:** Key not found OR not owned by the authenticated user. The status code is intentionally 404 (not 403) to avoid leaking the existence of other users' keys.

### `POST /api/keys/:keyId/revoke`

Revoke an existing key. Marks `status = revoked` and attempts best-effort deletion on LiteLLM.

**Rate limit:** 5/min per user OID.

**Response 200:**
```json
{ "revoked": true, "key_id": "<uuid>" }
```

**Response 404:** Key not found OR not owned.

## Configuration — `teams.yaml`

The service loads team configuration from a YAML file at the path specified by `TEAMS_CONFIG_PATH` (default `/app/config/teams.yaml`).

### Schema

```yaml
teams:
  - entra_group_id: "<GUID>"          # required — Entra security group Object ID
    team_alias: "Engineering"          # required — human-readable name
    models: ["gpt-4o", "claude-3-5"]   # list of LiteLLM model names
    max_budget: 500.0                  # USD cap for the team
    budget_duration: "1mo"             # LiteLLM budget window
    team_member_budget: 50.0           # per-member cap (0 = unlimited)
    litellm_role: "user"               # "user" | "admin"
    is_default: false                  # optional — default team suppression

required_groups:                       # optional authorization gate
  - "<GUID>"
```

### Default team suppression

If a user's Graph groups match both a team marked `is_default: true` and a non-default team, the default team is suppressed from the qualifying set. This allows a catch-all default team for users who don't belong to any product team while keeping it out of the way for users who do.

### `required_groups` gate

When `required_groups` is non-empty, the user must be a member of at least one listed group or `POST /api/provision` returns 403. When empty (the default), all users are authorized.

### In Kubernetes

The runtime `teams.yaml` is delivered via a ConfigMap mounted at `/app/config/teams.yaml`. The ConfigMap in this repo (`deploy/kubernetes/1code-api/app/teams-configmap.yaml`) contains placeholder GUIDs. The cluster repo (`talos-ai-cluster`) substitutes real values at Flux reconcile time from `cluster.yaml`'s `onecode_api_teams:` array.

The template `services/1code-api/config/teams.yaml.example` is committed for reference. The live `services/1code-api/config/teams.yaml` is gitignored.

## Operator runbook

### Enabling provisioning

1. Ensure the new confidential Entra app registration is minted with `GroupMember.Read.All` (Application permission) + admin consent granted.
2. Populate `deploy/kubernetes/1code-api/app/graph-secret.sops.yaml` with the confidential client secret and encrypt with SOPS.
3. Populate the cluster repo's `onecode_api_teams:` array in `cluster.yaml` with real Entra group IDs.
4. Set `PROVISIONING_ENABLED=true` in the HelmRelease env (or the cluster-repo override).
5. Wait for Flux reconcile → rolling deploy.
6. Verify logs show `provisioning: services initialized and scheduler started`.

### Disabling provisioning (emergency)

Set `PROVISIONING_ENABLED=false` and wait for rolling deploy. All endpoints return 503; the cron scheduler stops; no provisioning or deprovisioning runs until the flag is flipped back.

### Cron schedules

- **Deprovisioning:** daily at 02:00 UTC. Reviews all active users, deprovisions any who are no longer in any `required_groups` member group. Aborts without writes if `DEPROVISIONING_MAX_PER_RUN` (default 20) would be exceeded.
- **Rotation:** daily at 03:00 UTC. Rotates all keys where `portal_expires_at <= now` and the owning user is still active.

### Manual cron execution

The scheduler runs via `node-cron` inside the pod. To manually trigger for debugging:

```bash
kubectl exec -n ai deploy/1code-api -- node -e "
  import('./dist/services/deprovisioning.js').then(m => m.runDeprovisioningJob(...))
"
```

### Audit log

Every provisioning action writes a row to the `audit_log` table with `actor_email`, `actor_entra_oid`, `action`, `target_type`, `target_id`, and optional JSON `details`. Query via:

```sql
SELECT * FROM audit_log
 WHERE actor_entra_oid = '<oid>'
 ORDER BY created_at DESC
 LIMIT 100;
```

The closed set of audit actions is enforced at compile time via `src/lib/audit.ts` — any code that writes an audit row must use a string literal from `AUDIT_ACTIONS`.

## Troubleshooting

### `POST /api/provision` returns 503

`PROVISIONING_ENABLED` is `false` or the feature flag env var is missing. Check `kubectl describe pod -n ai <pod>` for the `env:` block, or the HelmRelease `values.controllers.1code-api.containers.app.env`.

### `POST /api/provision` returns 403

User is not in any `required_groups` member group. Check:
1. `teams.yaml` `required_groups:` array matches the groups actually exposed in Entra.
2. The user's Graph group memberships via the Azure portal → User → Groups tab.
3. Log output for `graph-client: GET memberOf` to verify which groups are being returned.

### `POST /api/provision` returns 409

User was previously deprovisioned (`users.is_active = false`). To re-enable:
```sql
UPDATE users SET is_active = true, deprovisioned_at = NULL WHERE oid = '<oid>';
```

### Deprovisioning cron aborted

Check the logs for `deprovisioning: ABORTED — would_deprovision exceeds threshold`. This means the cron detected that more than `DEPROVISIONING_MAX_PER_RUN` users would be deprovisioned in a single run, which is usually a signal of:
1. Accidental removal of a required group from Entra (e.g., a bulk cleanup)
2. A Graph API misconfiguration that's returning empty group lists for everyone
3. A massive org-chart reorganization

Investigate the root cause before raising the threshold. The `audit_log` row `action = cron.deprovisioning_aborted` records the `threshold` and `would_deprovision` counts at the time of abort.

### Orphaned LiteLLM keys

If a key exists in LiteLLM but not in our `provisioned_keys` table, it's orphaned. Possible causes:
1. `generate_key` succeeded but the follow-up `INSERT` failed (see design §Decision 8 failure semantics)
2. Manual operator intervention outside this service

The audit action `key.generation_orphaned` flags these cases. Until a reconciliation cron is implemented (Phase 2), orphans must be cleaned up manually via LiteLLM's admin API.

## Related

- OpenSpec change: `openspec/changes/add-1code-api-litellm-provisioning/`
- Design document: `openspec/changes/add-1code-api-litellm-provisioning/design.md` (10 Decisions, ~18 Requirements, ~37 Scenarios)
- Decommission runbook: [`apollos-decommission-runbook.md`](./apollos-decommission-runbook.md)
- Cluster repo integration: `kubernetes/apps/ai/1code-api/` in `talos-ai-cluster`
- Single-replica guard: `tests/regression/1code-api-single-replica.test.ts`
