---
title: Talos AI Cluster Facts
icon: server
---

# Talos AI Cluster Facts {subtitle="Discovered and validated 2026-04-08"}

The enterprise deployment target is a Talos Kubernetes cluster managed via Flux/GitOps.

## Cluster Location

```bash
cd /Users/jason/dev/ai-k8s/talos-ai-cluster
KUBECONFIG=./kubeconfig kubectl ...
```

**Important:** `mise`/`direnv` loads `KUBECONFIG` on `cd` into the cluster repo. `~/.kube/config` is a separate, unrelated config.

## Key Facts

| Fact | Value |
|------|-------|
| Envoy Gateway version | `v1.7.1` (image: `mirror.gcr.io/envoyproxy/gateway:v1.7.1`) |
| Entra tenant ID | `f505346f-75cf-458b-baeb-10708d41967d` |
| Echo test server | `https://echo.aarons.com/` (`default/echo` HTTPRoute, `mendhak/http-https-echo:39`) |
| Parent Gateway | `envoy-external/network/https` |
| OIDC reference | `kube-system/hubble-ui-oidc` (single-auth; dual-auth is new) |

## Flux/GitOps Rule

**Never use direct `kubectl apply` for cluster resources.** All changes go through:

1. `templates/config/**/*.j2` (Jinja2 templates)
2. `cluster.yaml` (plaintext variables)
3. SOPS encryption (for secrets)
4. `git commit` + `git push`
5. Flux reconcile

Direct applies are reconciled away within 60 seconds.

## Dual-Auth Pattern (Validated)

The Envoy Gateway dual-auth pattern was empirically validated on 2026-04-08:

- `oidc.passThroughAuthHeader: true` — skips OIDC when a Bearer header is present
- `oidc.forwardAccessToken: true` — forwards OIDC session token to upstream
- `jwt.optional: true` — allows browser requests without Bearer to get OIDC redirect

See the [Envoy Smoke Test Runbook](./envoy-smoke-test.md) for the full procedure.

## Entra Gotchas

- **`requestedAccessTokenVersion` defaults to `null` = v1, NOT v2** in new app registrations. Must be explicitly set to `2` (integer) in the Manifest tab.
- **`oid`, `tid`, `azp` are default v2.0 claims** — they do NOT appear in the "Add optional claim" dialog because they're always present.
- **`preferred_username` MUST NOT be used for authorization** — it's tenant-admin-mutable, empty for service principals.
- **Envoy Gateway v1.7.1 enables PKCE by default** (S256) without explicit `pkceEnabled: true`.
