# self-hosted-api Specification (delta)

## MODIFIED Requirements

### Requirement: API service is packaged as a container image

The system SHALL be packaged as a multi-arch (`linux/amd64`, `linux/arm64`) container image published to GHCR at `ghcr.io/jrmatherly/1code-api`. The image SHALL be built via GitHub Actions on `v*` tag push and signed with Cosign keyless (GitHub OIDC). The container image SHALL bundle a `config/teams.yaml.example` template file and expect a runtime `teams.yaml` to be mounted at the path specified by the `TEAMS_CONFIG_PATH` environment variable when the provisioning capability is enabled.

#### Scenario: Release tag triggers container build

- **WHEN** a `v*` tag is pushed to the repository
- **THEN** GitHub Actions builds the container for both architectures, pushes to GHCR, and signs with Cosign

#### Scenario: Container runs in Kubernetes with provisioning disabled

- **WHEN** the container is deployed via the existing HelmRelease at `deploy/kubernetes/1code-api/` with `PROVISIONING_ENABLED=false`
- **THEN** the service starts, connects to PostgreSQL, runs migrations (including the new provisioning tables), and serves traffic on port 8000 with the four baseline endpoints (`/api/changelog/desktop`, `/api/desktop/user/plan`, `/api/user/profile`, `/health`) responding normally and the six new provisioning endpoints returning HTTP 503

#### Scenario: Container runs in Kubernetes with provisioning enabled

- **WHEN** the container is deployed with `PROVISIONING_ENABLED=true`, the new env vars (`LITELLM_BASE_URL`, `LITELLM_MASTER_KEY`, `AZURE_TENANT_ID`, `AZURE_GRAPH_CLIENT_ID`, `AZURE_GRAPH_CLIENT_SECRET`, `TEAMS_CONFIG_PATH`), and a mounted `teams.yaml` ConfigMap
- **THEN** the service starts, validates all required env vars via Zod, loads `teams.yaml`, initializes the Graph and LiteLLM clients, starts the node-cron scheduler with deprovisioning + rotation jobs, and serves all ten endpoints (four baseline + six provisioning)

## ADDED Requirements

### Requirement: Provisioning and key management endpoints are gated by the PROVISIONING_ENABLED feature flag

The 1code-api SHALL gate all new provisioning-related HTTP endpoints behind a `PROVISIONING_ENABLED` boolean environment variable (accepting `"true"`, `"false"`, `"1"`, `"0"`, default `false`). The gating SHALL be checked per-request at the handler level so the same binary can be deployed to multiple environments with different flag values. When the flag is `false`, the scheduler SHALL NOT start and endpoints SHALL return HTTP 503.

#### Scenario: Production deploy with flag off serves only baseline endpoints

- **WHEN** the 1code-api is deployed with `PROVISIONING_ENABLED=false`
- **THEN** the existing four baseline endpoints (`GET /api/changelog/desktop`, `GET /api/desktop/user/plan`, `PATCH /api/user/profile`, `GET /health`) respond normally, AND the six new endpoints return HTTP 503 with `{"error": "provisioning disabled"}`, AND no `node-cron` jobs are scheduled

#### Scenario: Provisioning flag flipped requires pod restart to take effect

- **WHEN** an operator changes `PROVISIONING_ENABLED` from `false` to `true` in the Kubernetes Secret and triggers a Flux reconcile
- **THEN** Flux causes a rolling deploy of the 1code-api pod, the new pod starts with the flag true and initializes the scheduler at boot, AND any in-flight requests to the old pod complete normally before its shutdown

### Requirement: API service integrates with LiteLLM admin API via master key

The 1code-api SHALL integrate with a LiteLLM proxy instance at `LITELLM_BASE_URL` using the `LITELLM_MASTER_KEY` as a Bearer token for admin API calls (`/team/*`, `/user/*`, `/key/*`). The master key SHALL be sourced via Kubernetes `secretKeyRef` from the existing `litellm-secret` in the same namespace, NOT duplicated into a separate secret. The 1code-api SHALL NOT call non-admin LiteLLM endpoints (such as `/v1/chat/completions`) — those are the desktop app's responsibility using the generated user virtual keys.

#### Scenario: LiteLLM client acquires master key from shared Kubernetes secret

- **WHEN** the 1code-api pod starts with the helmrelease configured to reference `secretKeyRef: {name: litellm-secret, key: LITELLM_MASTER_KEY}`
- **THEN** the `LITELLM_MASTER_KEY` environment variable is populated from the existing LiteLLM secret without requiring a duplicate secret

#### Scenario: LiteLLM admin API call includes master key Bearer header

- **WHEN** the 1code-api calls any method on the `LiteLLMClient` (e.g., `createUser`, `generateKey`, `deleteKey`)
- **THEN** the HTTP request to the LiteLLM proxy includes the header `Authorization: Bearer {LITELLM_MASTER_KEY}` and `Content-Type: application/json`

### Requirement: API service integrates with Microsoft Graph via a confidential client app registration

The 1code-api SHALL integrate with Microsoft Graph API using a dedicated confidential-client Entra app registration, distinct from the public-client app registration used by MSAL Node in the 1Code desktop app. The confidential client SHALL be configured via `AZURE_TENANT_ID`, `AZURE_GRAPH_CLIENT_ID`, and `AZURE_GRAPH_CLIENT_SECRET` environment variables, and SHALL hold the `GroupMember.Read.All` application permission with tenant admin consent granted. The 1code-api SHALL only call Graph's `/users/{oid}/memberOf/microsoft.graph.group` endpoint for the purpose of resolving user team membership during provisioning and deprovisioning.

#### Scenario: Startup fails fast if Graph credentials are missing and flag is enabled

- **WHEN** the 1code-api starts with `PROVISIONING_ENABLED=true` but `AZURE_GRAPH_CLIENT_ID` or `AZURE_GRAPH_CLIENT_SECRET` is unset
- **THEN** the Zod config validation fails, the process logs an error listing the missing variables, and exits with code 1

#### Scenario: Startup succeeds without Graph credentials when flag is disabled

- **WHEN** the 1code-api starts with `PROVISIONING_ENABLED=false` and `AZURE_GRAPH_CLIENT_ID` / `AZURE_GRAPH_CLIENT_SECRET` unset
- **THEN** the process starts successfully and serves the baseline four endpoints, because the Zod schema treats these as required only when the provisioning flag is true

### Requirement: API service runs a background scheduler for deprovisioning and rotation jobs

The 1code-api SHALL run a background scheduler (`node-cron`) when `PROVISIONING_ENABLED=true` that registers two jobs: deprovisioning (default schedule: every 6 hours via `0 */6 * * *`) and rotation (default schedule: every 6 hours via `0 */6 * * *`). The scheduler SHALL start after the Fastify server is listening and SHALL stop cleanly on `SIGTERM`/`SIGINT` before the Fastify server closes.

#### Scenario: Scheduler starts after server is listening

- **WHEN** the 1code-api process starts with `PROVISIONING_ENABLED=true`
- **THEN** the startup sequence is: connect DB → run migrations → start Fastify listener → initialize scheduler → register both cron jobs → log "scheduler started with 2 jobs"

#### Scenario: Scheduler stops before server closes on shutdown

- **WHEN** the 1code-api receives `SIGTERM`
- **THEN** the shutdown handler stops the scheduler first (preventing new cron fires), waits for any in-flight cron execution to complete, then closes the Fastify server, then closes the database connection pool

#### Scenario: Scheduler does not start when flag is off

- **WHEN** the 1code-api starts with `PROVISIONING_ENABLED=false`
- **THEN** the scheduler is never initialized and no cron jobs are registered; a startup log line confirms "provisioning disabled, scheduler not started"
