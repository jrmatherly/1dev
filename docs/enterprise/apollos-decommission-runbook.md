---
title: Apollos Decommission Runbook
description: Phased cutover plan for retiring the Apollos portal after 1code-api absorbs its LiteLLM provisioning subset.
---

# Apollos Decommission Runbook

This runbook covers the cutover from Apollos portal to 1code-api's LiteLLM provisioning subsystem. It assumes the OpenSpec change `add-1code-api-litellm-provisioning` is fully merged and deployed to staging with `PROVISIONING_ENABLED=true`.

**Scope:** This document describes the operational decommission — what gets removed when, the one-shot data migration script, audit log portability, the rollback plan if cutover fails, and the cutover race window between Apollos SIGTERM and 1code-api restart.

**Out of scope:** Apollos features NOT being ported (usage tracking, model sync, admin endpoints, email notifications, reconciliation cron, React frontend). These are simply deleted at cutover; there is no migration path for them.

## Phase A — Preparation (days -14 to -1)

1. **Confirm 1code-api parity on staging**
   - Run through all five endpoints (`/api/provision/status`, `/api/provision`, `/api/keys`, `POST /api/keys/new`, `POST /api/keys/:id/rotate`, `POST /api/keys/:id/revoke`) against staging with a test user.
   - Confirm the deprovisioning cron fires at 02:00 UTC without the mass-deprovisioning guard tripping (check the logs for `deprovisioning: run complete`).
   - Confirm the rotation cron fires at 03:00 UTC.
2. **Audit row portability decision**
   - **Recommendation: copy Apollos's historical `audit_log` rows** into the new `audit_log` table at cutover for compliance continuity. Apollos's action strings do not perfectly match the 1code-api `AUDIT_ACTIONS` union; copy them verbatim and add a `source: "apollos"` JSON detail field to distinguish them from 1code-api actions during later queries.
   - Alternative: abandon at cutover. Only choose this if legal/compliance has confirmed that Apollos's audit history is not load-bearing for any retention requirement. Document the decision in the cutover ticket.
3. **One-shot migration script design**
   - Read from Apollos's `apollos_portal_db.provisioned_users`, `provisioned_keys`, `user_team_memberships`, and optionally `audit_log`.
   - Write to 1code-api's `users`, `provisioned_keys`, `user_team_memberships`, and (if audit portability is chosen) `audit_log`.
   - **Both schemas use UUID primary keys (per Decision 2 of add-1code-api-litellm-provisioning)**, so a straight row-copy preserves all FK linkages without rewriting any IDs. This was the whole point of the UUID PK decision.
   - The script MUST be idempotent: re-running it against a partially-migrated target should no-op on already-migrated rows. Use `INSERT ... ON CONFLICT (id) DO NOTHING`.
   - The script MUST write a marker row to a `migration_state` table (or equivalent) when it completes, so the 1code-api pod can check it before starting its deprovisioning cron (see Phase C race-window mitigation below).

## Phase B — Cluster repo preparation (day 0)

Coordinate with the cluster repo (`talos-ai-cluster`) to make all the following changes in a single PR:

1. Add cluster.yaml values: `onecode_api_graph_client_id`, `onecode_api_graph_client_secret`, `provisioning_enabled: true`, `onecode_api_teams:` (real Entra group IDs).
2. Create the new confidential Entra app registration per design §Decision 1. Grant `GroupMember.Read.All` (Application permission) and admin-consent it.
3. Add the new SOPS-encrypted `1code-api-graph-secret` containing the confidential client secret.
4. Update the 1code-api HelmRelease Jinja template to surface the new env vars and mount the teams ConfigMap.
5. Update the 1code-api `teams-configmap.yaml` postBuild substitution to read from `onecode_api_teams:`.

**Do not merge this PR yet.** It's pre-staged for Phase C.

## Phase C — Cutover day

This is the only irreversible phase. Have a rollback plan ready (Phase C.5 below).

### C.1 — Stop Apollos cron jobs (the only preemptive action)

```bash
kubectl scale -n ai deploy/apollos-portal --replicas=0
```

This prevents Apollos's own deprovisioning cron from running while the data migration is in-flight. **Do not delete the deployment yet** — we need the ability to scale it back up if Phase C.2 fails.

### C.2 — Run the one-shot data migration script

```bash
# Run the migration script against the new 1code-api DB
kubectl run migrate --rm -it --image=<migration-image> --restart=Never -- \
  --source-db apollos_portal_db \
  --target-db onecode_api_db
```

The script writes to the 1code-api DB. It MUST complete before 1code-api's deprovisioning cron runs — otherwise the cron could see a partially-migrated state and incorrectly deprovision users whose Apollos rows haven't been copied over yet.

**Mitigation for the cutover race window:** The cron scheduler in `scheduler.ts` starts eagerly at pod boot. To prevent it from running before the migration script completes, introduce a `MIGRATION_COMPLETE` env var (or equivalent) that the deprovisioning cron checks before its first pass:

```typescript
// In deprovisioning.ts runDeprovisioningJob
if (process.env.MIGRATION_COMPLETE !== "true") {
  log.warn("deprovisioning: skipping run — MIGRATION_COMPLETE not set");
  return;
}
```

Set `MIGRATION_COMPLETE=false` in the HelmRelease for the initial cutover deploy. After the migration script confirms success, the operator manually flips the value to `true` in a follow-up HelmRelease patch and waits for Flux reconcile.

**This env var pattern is required** for Phase C safety. It is not currently implemented — add it to the roadmap as a prerequisite.

### C.3 — Merge the cluster-repo PR

Merging triggers Flux reconcile → rolling deploy of 1code-api with `PROVISIONING_ENABLED=true` and the new ConfigMap + secret mounted. The pod starts with `MIGRATION_COMPLETE=false` so the cron is inert.

### C.4 — Manually set `MIGRATION_COMPLETE=true`

After verifying the migration script output and checking that the 1code-api DB matches Apollos's state, patch the HelmRelease:

```bash
# In talos-ai-cluster
git -C kubernetes/apps/ai/1code-api/app/helmrelease.yaml  # edit MIGRATION_COMPLETE to "true"
git commit && git push
# Wait for Flux reconcile → rolling restart
```

After the rolling restart, the deprovisioning cron will run on its next 02:00 UTC firing. Monitor logs for the first run.

### C.5 — Rollback (if cutover fails)

If Phase C.2 reveals a data integrity issue, OR Phase C.4's first cron run trips the mass-deprovisioning guard:

1. Set `PROVISIONING_ENABLED=false` in 1code-api HelmRelease → Flux reconcile → all provisioning endpoints return 503.
2. Scale Apollos back up: `kubectl scale -n ai deploy/apollos-portal --replicas=1`.
3. Revert the cluster-repo PR from Phase B.
4. Investigate the root cause; re-plan cutover.

The 1code-api data written during the failed cutover can safely stay in the DB — Apollos uses a different DB entirely, so there's no data collision.

## Phase D — Soak period (days +1 to +7)

Do NOT proceed to Phase E until 1code-api has been running cleanly for at least 7 days. During this period:

- Monitor `audit_log` for unexpected action patterns
- Monitor the deprovisioning cron for false positives (users deprovisioned who shouldn't be)
- Verify desktop-app clients are successfully provisioning and rotating keys
- Spot-check LiteLLM for orphaned keys (action `key.generation_orphaned` in audit log)

## Phase E — Apollos removal (day +8 onwards)

Only proceed after the Phase D soak completes successfully. Phase E removes Apollos in strict order:

1. **Delete the Apollos Kustomization** (`kubernetes/apps/ai/apollos-portal/ks.yaml` in `talos-ai-cluster`) → Flux tears down the deployment + service + HTTPRoute.
2. **Delete the Apollos Postgres database** (manual step on the DB cluster — the Apollos HelmRelease didn't own it).
3. **Remove Apollos values from `cluster.yaml`** (`apollos_portal_*` entries).
4. **Delete the Apollos image in the container registry** (optional — safer to keep for 30 days as a rollback artifact).
5. **LAST STEP: Delete the Apollos Entra app registration.**
   - This step is irreversible.
   - Do NOT do this before day +8 — the Apollos app reg is still referenced by any in-flight desktop sessions that haven't refreshed their tokens.
   - Confirm no references to the Apollos client ID (`2938f422-ae63-48ee-b129-1d75b420aeeb`) exist in any tracked file before deletion.

## Explicit do-not-do list

- **Do NOT** delete the existing public-client Entra app registration used by MSAL Node (the one in `cluster.yaml` as `onecode_api_entra_client_id`). It's used by the 1code-api JWT validation at the Envoy Gateway layer — unrelated to Apollos.
- **Do NOT** delete the LiteLLM deployment or its teams — 1code-api is taking over the same teams, not replacing them.
- **Do NOT** reset the `last_spend` values on LiteLLM keys during migration — they are load-bearing for the budget system.

## Related

- OpenSpec change: `openspec/changes/add-1code-api-litellm-provisioning/`
- Decision 1 (Two Entra app registrations): `design.md`
- Decision 2 (UUID primary key): `design.md`
- Decision 10 (Single-replica scheduler): `design.md`
- Single-replica guard: `tests/regression/1code-api-single-replica.test.ts`
- Apollos codebase (reference only): `apollos-portal/backend/app/services/`
