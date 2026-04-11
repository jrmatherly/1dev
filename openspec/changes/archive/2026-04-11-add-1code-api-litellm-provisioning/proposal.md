# Change: add-1code-api-litellm-provisioning

## Why

The `1code-api` (shipped via the `implement-1code-api` change on 2026-04-10) currently exposes only four read-mostly endpoints: `GET /api/changelog/desktop`, `GET /api/desktop/user/plan`, `PATCH /api/user/profile`, and `GET /health`. It has zero coupling to LiteLLM — `LITELLM_BASE_URL` is wired in the HelmRelease but never consumed. The 1Code desktop app therefore has no way to obtain a LiteLLM API key for its own Claude Code / Codex subprocess traffic unless a human ops user manually provisions that user via the **Apollos portal** (a separate FastAPI + React service in the cluster).

The Apollos portal is the current (and only) LiteLLM user provisioning mechanism in the `talos-ai-cluster`. It was created to solve two distinct problems: (a) LiteLLM OSS's admin-UI SSO free tier is limited to 5 users per `v1.76.0+`, making it unusable as a direct browser login path for more than a small admin team; (b) LiteLLM's admin API (`/user/new`, `/team/new`, `/key/generate`) is unrestricted OSS but requires an external orchestrator to call it with the master_key on behalf of end users. Apollos sits in front of LiteLLM, authenticates browser users via its own Entra app registration (`2938f422-ae63-48ee-b129-1d75b420aeeb`), reads Entra security-group membership via Microsoft Graph (app-only `GroupMember.Read.All`), resolves group membership to LiteLLM teams via a `teams.yaml` config, and runs four cron jobs (rotation, deprovisioning, reconciliation, notification) to keep LiteLLM state in sync with Entra.

For the 1Code desktop app to be usable in the enterprise cluster, its users need the same provisioning flow — but going through Apollos's browser portal for onboarding is a poor UX (two-step sign-in), introduces a cross-service dependency the 1code-api doesn't otherwise need, and leaves an orphaned browser-facing service running for a use case the desktop app has already solved via MSAL Node + Envoy Gateway JWT validation.

**The goal of this change** is to replicate the LiteLLM user-provisioning subset of Apollos inside the `1code-api` itself, behind a `PROVISIONING_ENABLED` feature flag. This gives the 1Code desktop app self-contained onboarding (one sign-in, no portal visit required) and unblocks the eventual decommission of Apollos entirely.

**Scope is deliberately narrow**: only the user → team → membership → API key lifecycle (provision, list, rotate, revoke) plus the deprovisioning and rotation crons. Apollos's usage tracking, model sync, admin endpoints, audit endpoints beyond minimal logging, email notifications, reconciliation cron, and React frontend are **explicitly out of scope** for this change. They can be added in follow-on proposals if operational need arises after Apollos decommission.

## What Changes

### New capabilities — `1code-api-litellm-provisioning`

A new OpenSpec capability covering: provisioning state machine, team assignment from Entra security groups, API key generation and lifecycle (list/rotate/revoke), deprovisioning cron, and rotation cron.

### Modified capabilities — `self-hosted-api`

The existing `self-hosted-api` baseline requires extension to expose new HTTP endpoints and a new background scheduler lifecycle. Specifically:

- New endpoint group: `GET /api/provision/status`, `POST /api/provision`
- New endpoint group: `GET /api/keys`, `POST /api/keys/new`, `POST /api/keys/:keyId/rotate`, `POST /api/keys/:keyId/revoke`
- All new endpoints gated behind `PROVISIONING_ENABLED=false` by default; return 503 when flag is off
- New background scheduler (node-cron) running two jobs: deprovisioning (every 6h), rotation (every 6h)
- New config variables: `LITELLM_BASE_URL`, `LITELLM_MASTER_KEY`, `AZURE_TENANT_ID`, `AZURE_GRAPH_CLIENT_ID`, `AZURE_GRAPH_CLIENT_SECRET`, `TEAMS_CONFIG_PATH`, `PROVISIONING_ENABLED`

### Database schema changes

Extend the existing `users` table (from the `self-hosted-api` baseline) with four new columns — `litellm_user_id`, `is_active`, `default_key_duration_days`, `deprovisioned_at` — and add three new tables: `provisioned_keys`, `user_team_memberships`, `audit_log`. One new Drizzle migration.

### Entra ID app registration

A **new, distinct** confidential-client Entra app registration for server-side Microsoft Graph calls (`onecode_api_graph_client_id` + `onecode_api_graph_client_secret` in `cluster.yaml`). The existing public-client app reg `52d25f5d-688a-46fe-8356-305cec17f375` used by MSAL Node in the desktop app stays unchanged. The new confidential client needs `GroupMember.Read.All` application permission with admin consent granted.

### Configuration file

New `services/1code-api/config/teams.yaml.example` committed as a template (schema identical to Apollos's `teams.yaml.example`). Actual `services/1code-api/config/teams.yaml` is **gitignored** and mounted at runtime via a Kubernetes ConfigMap populated from `cluster.yaml` values.

### Documentation

New canonical page `docs/enterprise/1code-api-provisioning.md` covering the provisioning architecture, API reference, operator runbook, and troubleshooting. Update `docs/enterprise/entra-app-registration-1code-api.md` with the new server-side Graph client section. Note in `docs/enterprise/auth-strategy.md` that the Envoy dual-auth pattern's JWT half is implemented by this change and OIDC half is explicitly not (no browser flow on the 1code-api route).

### Explicit non-goals

This change does **NOT** include:

- Decommissioning Apollos portal (separate operational runbook in `docs/enterprise/apollos-decommission-runbook.md` once this change soaks in production)
- Usage tracking / spend reporting endpoints
- Model list / sync endpoints
- Admin endpoints (list all users, force-rotate, audit log view)
- Email notification cron
- Reconciliation cron (drift detection between 1code-api DB and LiteLLM)
- React/browser UI (the 1Code desktop Electron app IS the UI)
- Apollos data migration script (separate concern handled in the decommission runbook)
- Prometheus `/metrics` endpoint (separate cross-cutting observability proposal; Apollos also doesn't have this today so parity is maintained at decommission)
- Multi-replica support for 1code-api (Phase 1 is pinned to `replicas: 1` per Decision 10 and a regression test enforces this; multi-replica via Postgres advisory locks is a future proposal)
- Email change propagation to LiteLLM (the `email_sync_state` field surfaces drift in `GET /api/provision/status` per the "Email mutability" Requirement, but no automatic LiteLLM user rename is performed because LiteLLM does not support `user_id` rename)

## Capabilities

### New Capabilities

- `1code-api-litellm-provisioning`: LiteLLM user, team, and API key lifecycle management driven by Entra security group membership. Covers the provisioning state machine, deprovisioning and rotation crons, team configuration schema, and Microsoft Graph integration for group resolution.

### Modified Capabilities

- `self-hosted-api`: Gains six new HTTP endpoints (2 provisioning, 4 key management) and a background scheduler lifecycle. The existing changelog, plan, profile, and health endpoints are unaffected.

## Impact

### Affected files and directories

- **New source directory:** `services/1code-api/src/lib/` — shared libraries (`teams-config.ts`, `graph-client.ts`, `litellm-client.ts`, `scheduler.ts`, `audit.ts`)
- **New source directory:** `services/1code-api/src/services/` — provisioning domain services (`provisioning.ts`, `key-service.ts`, `deprovisioning.ts`, `rotation.ts`)
- **New source directory:** `services/1code-api/src/schemas/` — Zod request/response schemas
- **New source files in existing directory:** `services/1code-api/src/routes/provision.ts`, `services/1code-api/src/routes/keys.ts`
- **Modified source files:** `services/1code-api/src/index.ts` (register routes + scheduler lifecycle), `services/1code-api/src/config.ts` (add new env vars), `services/1code-api/src/db/schema.ts` (extend `users` + add 3 tables), `services/1code-api/src/auth.ts` (no change; already trust-the-edge per `self-hosted-api` baseline)
- **New config directory:** `services/1code-api/config/` with `teams.yaml.example` (committed) and gitignored `teams.yaml` (runtime)
- **New Drizzle migration:** `services/1code-api/drizzle/<timestamp>_add_provisioning_tables.sql`
- **New tests:** `services/1code-api/tests/lib/*.test.ts`, `services/1code-api/tests/services/*.test.ts`, integration tests under `services/1code-api/tests/integration/`
- **Modified deployment:** `deploy/kubernetes/1code-api/app/helmrelease.yaml` (new env vars, LiteLLM master_key secretRef, teams.yaml ConfigMap mount), `deploy/kubernetes/1code-api/app/ciliumnetworkpolicy.yaml` (egress to `graph.microsoft.com` and `litellm.ai.svc.cluster.local:4000`)
- **Modified root gitignore:** new entry for `services/1code-api/config/teams.yaml`
- **New documentation:** `docs/enterprise/1code-api-provisioning.md`
- **Updated documentation:** `docs/enterprise/entra-app-registration-1code-api.md`, `docs/enterprise/auth-strategy.md`, `CLAUDE.md` (architecture summary), `.claude/PROJECT_INDEX.md`
- **Roadmap entry:** `docs/operations/roadmap.md` Recently Completed table after archive

### New dependencies (added to `services/1code-api/package.json`)

- `@azure/msal-node` — Microsoft Authentication Library for the confidential Graph client
- `node-cron` — lightweight cron scheduler for deprovisioning + rotation jobs
- `yaml` — YAML parser for `teams.yaml`
- `@fastify/rate-limit` — per-endpoint rate limiting (mirrors Apollos's `@limiter.limit` decorators)

### New dependencies on the cluster repo (`talos-ai-cluster`)

These are **coordination**, not changes made by this OpenSpec proposal — they must happen before the feature flag can be flipped on in production:

- `cluster.yaml`: add `onecode_api_graph_client_id`, `onecode_api_graph_client_secret`, `provisioning_enabled`
- New Kubernetes Secret for the Graph client secret (SOPS-encrypted)
- Updated ConfigMap for `teams.yaml` (file contents)
- Updated `1code-api` HelmRelease values to surface the new env vars

### Migration path

This change is **build-only**. The Apollos portal continues to run unchanged during and after this change lands. Apollos decommission is a separate operational activity tracked in `docs/enterprise/apollos-decommission-runbook.md` (to be written during this change's task 9.6) and requires:

1. This change lands in production with `PROVISIONING_ENABLED=false` (soak for 1+ week to confirm no regressions in the existing `self-hosted-api` endpoints)
2. New Graph Entra app reg minted and added to `cluster.yaml` (operational, not OpenSpec)
3. Dry-run smoke test with `PROVISIONING_ENABLED=false` still (exec into pod, verify Graph connectivity + teams.yaml parsing)
4. Cutover window: Apollos crons stopped atomically with `PROVISIONING_ENABLED=true` flip
5. Existing Apollos-provisioned users reconciled into `1code-api`'s database via a one-shot migration script
6. Soak 1-2 weeks
7. Apollos scaled to 0 replicas, then deleted entirely, then its Entra app reg removed

Only steps 1-2 are in scope for this OpenSpec change. Steps 3-7 are operational.

### Risk

**Medium.** The code is well-understood (this proposal ports a proven Python implementation from Apollos, and the OpenSpec design section includes explicit source-file citations for every algorithm). The main risks are:

1. **Feature flag safety** — `PROVISIONING_ENABLED=false` is the only thing protecting production until the cutover. The flag must be implemented such that flipping it off mid-traffic cleanly returns 503 without partial state, and flipping it on does not attempt to hot-initialize the scheduler (scheduler only starts when flag is true at process boot).
2. **Graph permission grant latency** — the new Entra confidential app reg needs admin consent for `GroupMember.Read.All`. This is a manual tenant admin action with no fixed SLA. The task list flags this explicitly so the work isn't blocked at the end.
3. **Drizzle migration ordering** — extending the existing `users` table in place (vs creating a new `provisioned_users` table) means the migration touches a table already in use by `PATCH /api/user/profile`. The migration must be backward-compatible — new columns nullable with defaults — so a rolling deploy doesn't break the existing endpoint.
4. **LiteLLM master_key access** — the 1code-api pod will have write access to LiteLLM's admin API. If the pod is compromised, the blast radius is "full LiteLLM control plane." This is no worse than Apollos today, and mitigation is via the existing `CiliumNetworkPolicy` locking pod egress to LiteLLM's ClusterIP and the Graph endpoint only.

### Validation

- `openspec validate add-1code-api-litellm-provisioning --strict --no-interactive` passes
- `bun run ts:check` — no new errors above baseline (38)
- `bun run lint` — no new SonarLint findings
- `bun test` — all 14+ regression guards pass; new unit tests added for each new service pass
- `bun run build` — esbuild packaging validation
- `cd docs && bun run build` — xyd-js docs site builds cleanly
- Integration test suite: docker-compose with Postgres + LiteLLM, end-to-end provision flow, deprovisioning cycle, rotation cycle
