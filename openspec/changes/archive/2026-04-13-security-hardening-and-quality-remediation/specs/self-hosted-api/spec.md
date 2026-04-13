## ADDED Requirements

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
