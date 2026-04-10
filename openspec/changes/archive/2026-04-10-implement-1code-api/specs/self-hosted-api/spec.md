## ADDED Requirements

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
The system SHALL be packaged as a multi-arch (`linux/amd64`, `linux/arm64`) container image published to GHCR at `ghcr.io/jrmatherly/1code-api`. The image SHALL be built via GitHub Actions on `v*` tag push and signed with Cosign keyless (GitHub OIDC).

#### Scenario: Release tag triggers container build
- **WHEN** a `v*` tag is pushed to the repository
- **THEN** GitHub Actions builds the container for both architectures, pushes to GHCR, and signs with Cosign

#### Scenario: Container runs in Kubernetes
- **WHEN** the container is deployed via the existing HelmRelease at `deploy/kubernetes/1code-api/`
- **THEN** the service starts, connects to PostgreSQL, runs migrations, and serves traffic on port 8000

### Requirement: Changelog entries are stored as markdown files
The system SHALL read changelog entries from a `changelog/` directory within the service. Each entry SHALL be a markdown file with YAML frontmatter containing `title`, `date`, and `version` fields. The body of the markdown file SHALL be the changelog content.

#### Scenario: New changelog entry
- **WHEN** a new markdown file is added to `services/1code-api/changelog/2026-04-10-v0.0.75.md`
- **THEN** the `GET /api/changelog/desktop` endpoint includes it in results sorted by date
