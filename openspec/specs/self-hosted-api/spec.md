# self-hosted-api Specification

## Purpose
TBD - created by archiving change implement-1code-api. Update Purpose after archive.
## Requirements
### Requirement: API service serves changelog feed
The system SHALL expose a `GET /api/changelog/desktop` endpoint that returns recent changelog entries as a JSON array. The endpoint SHALL accept a `per_page` query parameter to limit the number of entries returned (default: 10). Each entry SHALL include `title`, `date`, `version`, and `body` (markdown) fields.

#### Scenario: Desktop app fetches changelog
- **WHEN** the desktop app sends `GET /api/changelog/desktop?per_page=3`
- **THEN** the API returns a JSON array of the 3 most recent changelog entries sorted by date descending

#### Scenario: No changelog entries exist
- **WHEN** the desktop app sends `GET /api/changelog/desktop`
- **THEN** the API returns an empty JSON array `[]`

### Requirement: API service serves user plan information
The system SHALL expose a `GET /api/desktop/user/plan` endpoint that returns the authenticated user's subscription plan. The response SHALL include `email`, `plan` (string identifier), and `status` (active/inactive/null) fields. In enterprise mode, all authenticated users SHALL receive the maximum plan tier.

#### Scenario: Enterprise user queries plan
- **WHEN** an authenticated enterprise user sends `GET /api/desktop/user/plan`
- **THEN** the API returns `{ "email": "<user-email>", "plan": "onecode_max", "status": "active" }` derived from the user's Entra ID claims and feature flag configuration

#### Scenario: Unauthenticated request
- **WHEN** a request without valid auth headers reaches the endpoint
- **THEN** the API returns HTTP 401

### Requirement: API service supports user profile updates
The system SHALL expose a `PATCH /api/user/profile` endpoint that accepts a JSON body with `display_name` field. The endpoint SHALL update the user's display name and return the updated user object.

#### Scenario: Update display name
- **WHEN** an authenticated user sends `PATCH /api/user/profile` with `{ "display_name": "New Name" }`
- **THEN** the API updates the user record and returns the full user object with the new display name

### Requirement: API service exposes health check
The system SHALL expose a `GET /health` endpoint that returns HTTP 200 with `{ "status": "ok" }` when the service is healthy. The endpoint SHALL verify database connectivity before reporting healthy.

#### Scenario: Healthy service
- **WHEN** the K8s liveness probe sends `GET /health`
- **THEN** the API returns HTTP 200 with `{ "status": "ok" }`

#### Scenario: Database unreachable
- **WHEN** the database connection is down and a probe sends `GET /health`
- **THEN** the API returns HTTP 503 with `{ "status": "unhealthy", "reason": "database" }`

### Requirement: API service authenticates via gateway headers
The system SHALL authenticate requests by reading JWT claims from Envoy Gateway headers (`x-user-oid`, `x-user-email`, `x-user-name`). The service SHALL NOT perform its own JWT validation — it trusts the gateway. A dev bypass mode SHALL be available via environment variable for local development without the gateway.

#### Scenario: Request with gateway headers
- **WHEN** a request arrives with `x-user-oid` and `x-user-email` headers set by Envoy Gateway
- **THEN** the API extracts the user identity from these headers and processes the request

#### Scenario: Request without gateway headers in production
- **WHEN** a request arrives without gateway headers and dev bypass is disabled
- **THEN** the API returns HTTP 401

#### Scenario: Local development bypass
- **WHEN** `DEV_BYPASS_AUTH=true` is set and the request has no gateway headers
- **THEN** the API uses a default dev user identity

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

### Requirement: Changelog entries are stored as markdown files
The system SHALL read changelog entries from a `changelog/` directory within the service. Each entry SHALL be a markdown file with YAML frontmatter containing `title`, `date`, and `version` fields. The body of the markdown file SHALL be the changelog content.

#### Scenario: New changelog entry
- **WHEN** a new markdown file is added to `services/1code-api/changelog/2026-04-10-v0.0.75.md`
- **THEN** the `GET /api/changelog/desktop` endpoint includes it in results sorted by date

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

### Requirement: SecurityPolicy deployed and enforced
The Envoy Gateway SecurityPolicy for the 1code-api HTTPRoute SHALL be deployed (not draft) and reconciled by Flux. The policy SHALL validate JWT tokens from the configured OIDC issuer.

#### Scenario: SecurityPolicy in kustomization
- **WHEN** Flux reconciles `deploy/kubernetes/1code-api/app/kustomization.yaml`
- **THEN** the SecurityPolicy resource is included and applied to the cluster

#### Scenario: Unauthenticated request blocked
- **WHEN** a request to the 1code-api HTTPRoute arrives without a valid JWT
- **THEN** Envoy Gateway returns 401 Unauthorized

### Requirement: CiliumNetworkPolicy default-deny
The CiliumNetworkPolicy for 1code-api SHALL enable default-deny for both ingress and egress traffic. Explicit allow rules SHALL cover only legitimate traffic paths (DNS, LiteLLM, PostgreSQL, health probes, Envoy Gateway).

#### Scenario: Default-deny enabled
- **WHEN** the CiliumNetworkPolicy is applied
- **THEN** `enableDefaultDeny.ingress` is `true` and `enableDefaultDeny.egress` is `true`

#### Scenario: Legitimate traffic allowed
- **WHEN** 1code-api attempts to connect to PostgreSQL, LiteLLM, or external DNS
- **THEN** the connection succeeds via explicit allow rules

#### Scenario: Unauthorized traffic blocked
- **WHEN** 1code-api attempts to connect to an unlisted service
- **THEN** the connection is denied by the default-deny policy

### Requirement: Read-only root filesystem
The 1code-api container SHALL run with `readOnlyRootFilesystem: true`. Writable paths (e.g., `/tmp`) SHALL use `emptyDir` volumes.

#### Scenario: Container starts with read-only root
- **WHEN** the 1code-api pod starts
- **THEN** the root filesystem is read-only and the container runs successfully

### Requirement: Pinned base images
The 1code-api Dockerfile SHALL pin all base images to specific digest hashes, not floating tags.

#### Scenario: Deterministic builds
- **WHEN** the Dockerfile is built at two different times without code changes
- **THEN** the same base image layers are used (digest match)

### Requirement: No duplicate utility functions
Utility functions (e.g., `makeKeyPreview`) SHALL have a single canonical definition. Other modules SHALL import from the canonical location.

#### Scenario: makeKeyPreview single source
- **WHEN** `provisioning.ts` needs `makeKeyPreview`
- **THEN** it imports `_makeKeyPreview` from `key-service.ts` instead of defining a local copy

### Requirement: SOPS credential protection
The `.gitignore` SHALL include patterns that prevent accidental commit of unencrypted SOPS files (e.g., `*.dec.yaml`, `*.unencrypted.yaml`).

#### Scenario: Unencrypted file ignored
- **WHEN** a developer creates `secret.dec.yaml` in the deploy directory
- **THEN** `git status` does not show it as an untracked file

