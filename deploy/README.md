# Kubernetes Deployment Manifests

Flux v2 GitOps manifests for deploying 1Code enterprise services to a Kubernetes cluster.

## Components

| Directory | Purpose |
|-----------|---------|
| `kubernetes/1code-api/` | Self-hosted API backend (replaces upstream `1code.dev` API). Container built via `.github/workflows/container-build.yml`, pushed to `ghcr.io/jrmatherly/1code-api` |
| `kubernetes/envoy-auth-policy/` | Envoy Gateway SecurityPolicy for Entra OIDC (protects LiteLLM proxy) |

## Prerequisites

- Flux v2 with SOPS decryption configured
- Envoy Gateway with a `Gateway` named `envoy-external` in the `network` namespace
- A PostgreSQL database for the API backend
- A LiteLLM proxy deployment (for the auth policy to protect)
- An Entra ID (Azure AD) app registration with OIDC configured
- Cert-manager or equivalent for TLS certificates

## Placeholder Variables

All manifests use `${PLACEHOLDER}` syntax for sensitive or environment-specific values.
Replace these before deploying:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `${SECRET_DOMAIN}` | Your base domain | `example.com` |
| `${APP_HOSTNAME}` | API hostname | `api.example.com` |
| `${LITELLM_HOSTNAME}` | LiteLLM proxy hostname | `llms.example.com` |
| `${ENTRA_TENANT_ID}` | Azure AD / Entra tenant ID | `xxxxxxxx-xxxx-...` — see [Entra App Registration guide](../docs/enterprise/entra-app-registration-1code-api.md) |
| `${ENTRA_CLIENT_ID}` | Entra app registration client ID | `xxxxxxxx-xxxx-...` — see [Entra App Registration guide](../docs/enterprise/entra-app-registration-1code-api.md) |
| `${ENTRA_ISSUER_URL}` | Entra OIDC issuer URL | `https://login.microsoftonline.com/{tenant}/v2.0` |
| `${AUTH_POLICY_NAMESPACE}` | Namespace for the OIDC client secret | `ai` |
| `${IMAGE_REGISTRY}` | Container image registry | `ghcr.io/your-org` |
| `${IMAGE_TAG}` | Container image tag | `sha-abc1234` or `v0.0.72` |
| `${APP_TEMPLATE_VERSION}` | bjw-s app-template Helm chart version | `4.6.2` |
| `${DB_HOST}` | PostgreSQL host (in secret.sops.yaml) | `my-db.database.svc.cluster.local` |
| `${DB_APP_LABEL}` | Database pod label for CiliumNetworkPolicy | `my-db` |
| `${LITELLM_INTERNAL_URL}` | LiteLLM cluster-internal URL | `http://litellm.ai.svc.cluster.local:4000` |

## Deployment Order

1. **envoy-auth-policy** — can be deployed independently (depends on Envoy Gateway)
2. **1code-api** — depends on PostgreSQL database

## Container Build

The API container image is built via `.github/workflows/container-build.yml`:

- **Trigger:** `v*` tag push or `workflow_dispatch`
- **Registry:** `ghcr.io/jrmatherly/1code-api`
- **Architectures:** `linux/amd64`, `linux/arm64`
- **Signing:** Cosign keyless via GitHub OIDC
- **Supply chain:** SLSA provenance + SBOM enabled

## Integration with Flux

To integrate into a Flux-managed cluster:

1. Copy these directories into your cluster repo under `kubernetes/apps/<namespace>/`
2. Add each `ks.yaml` to your namespace-level `kustomization.yaml`
3. Create SOPS-encrypted secrets for credentials
4. Run `flux reconcile source git flux-system` to trigger deployment

## SOPS Secrets

Secret templates are provided as `secret.sops.yaml` with placeholder values.
Encrypt with your cluster's Age key before committing:

```bash
sops --encrypt --age <your-age-public-key> --in-place secret.sops.yaml
```
