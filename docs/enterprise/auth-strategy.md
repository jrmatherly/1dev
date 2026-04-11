---
title: Enterprise Auth Strategy (Envoy Gateway)
icon: shield-check
---

> **Canonical home.** This page is the authoritative version of the chosen
> enterprise auth strategy (Envoy Gateway dual-auth v2.1, empirically
> validated 2026-04-08). Promoted from the now-deprecated
> `.scratchpad/auth-strategy-envoy-gateway.md`.

# Enterprise Auth Strategy — Envoy Gateway Architecture

**Document:** `.scratchpad/auth-strategy-envoy-gateway.md`
**Created:** 2026-04-08
**Status:** **v2.1** — Empirically validated after live smoke test (see Section 11 Revision History for v2 and v2.1 change logs)
**Context:** 1Code enterprise fork — dual-auth pattern via Envoy Gateway + Microsoft Entra ID
**Review trace:** `.full-review/envoy-gateway-review/05-final-report.md` (46 findings: 7 C / 18 H / 17 M / 4 L) + smoke test validation in `envoy-claims-validation.md` (Outcome A — FULL PASS on 2026-04-08)
**Smoke test runbook:** `.scratchpad/../enterprise/envoy-smoke-test.md`

## Companion Documents

This is one of TWO parallel auth strategy documents:

| Document | Architecture |
|----------|-------------|
| `../enterprise/auth-fallback.md` (v5) | **MSAL-in-Electron** — multi-provider OAuth in the desktop app |
| `auth-strategy-envoy-gateway.md` (this doc, v2) | **Envoy Gateway dual-auth** — auth at the cluster edge, MSAL for token acquisition only |

**Key difference:** This architecture moves the OAuth/OIDC flow to the cluster gateway. The Electron app uses MSAL Node ONLY to acquire tokens that get attached to outbound requests — eliminating much of the multi-provider OAuth complexity in the v5 doc. The OIDC half of this pattern is proven by the existing Hubble UI SecurityPolicy in the cluster (`kube-system/cilium/app/securitypolicy.yaml.j2`); the **dual-auth combination** (OIDC + JWT in one policy) will be the **first deployment of its kind** in this cluster — see `cluster-crossref.md` in the review directory.

---

## Executive Summary

This document proposes an **alternative architecture** for the 1Code enterprise auth migration that leverages **Envoy Gateway's native OIDC + JWT dual-auth pattern** (`passThroughAuthHeader: true` + `jwt.optional: true`, officially supported since Envoy Gateway v1.5.0 — endorsed by maintainer `arkodg` in [envoyproxy/gateway discussion #2425](https://github.com/envoyproxy/gateway/discussions/2425) on 2025-08-11).

**Core insight:** The Talos AI cluster already runs Envoy Gateway v1.7.1 with a native single-auth OIDC SecurityPolicy serving Hubble UI. Extending the SecurityPolicy CRD to a dual-auth pattern for LiteLLM:

- **Eliminates multi-provider OAuth** in the Electron app — single auth flow (Entra ID) handles browser AND CLI subprocess access
- **Bypasses LiteLLM OSS SSO 5-user limit** — auth happens at the gateway, not in LiteLLM
- **Centralizes identity** — same gateway pattern can serve Hubble UI, LiteLLM, and future internal apps
- **Reduces Electron-side OAuth surface** — no per-provider state isolation, no Slack OAuth in Electron, no `flow-registry.ts`

**Trade-offs vs MSAL-in-Electron approach:**

| Dimension | MSAL-in-Electron (v5) | Envoy Gateway (this doc) |
|-----------|----------------------|--------------------------|
| New Electron files added | ~12 | ~4 |
| New tRPC routers | 5 | 2 |
| OAuth providers in Electron | 4 (Entra, Slack, MCP, future) | 1 (Entra only) |
| LiteLLM OSS SSO limit problem | Bypassed | Bypassed |
| Application-level CAE handling | Required (S-H3 protocol) | Required (Envoy doesn't intercept CAE; Envoy edge is *not* CAE-protected — see §7.4) |
| Cross-repo coordination | Required | Required (more cluster work) |
| Cluster prerequisite | None | Envoy Gateway >= v1.7.1 + 1-2 Entra app registrations + new CiliumNetworkPolicy |
| Bus factor / cross-repo blast radius | Lower | Higher |

> **Note on quantitative claims:** The v1 doc claimed "~3000 → ~800 lines" but had no methodology. v2 replaces this with the file/router counts above (which can be verified via `find` and `grep` against the strategy's proposed module structure in §5.3). The honest TL;DR is "fewer new files, similar net work, complexity shifted to cluster."

**Both architectures share:** the same MSAL Node integration for token acquisition, the same Drizzle schema for credential storage, the same Linux `safeStorage` layered strategy, the same CAE protocol (in scope for downstream LiteLLM→Graph hops only), and the same Phase 0 cleanup requirements. The difference is whether OAuth flows happen in the Electron app or at the cluster gateway.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Electron App (1Code)                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Main Process                                       │   │
│  │  ├─ MSAL Node (acquires tokens)                     │   │
│  │  ├─ Token cache (safeStorage + Drizzle DB)          │   │
│  │  └─ Spawn CLI tools with Bearer in env              │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│              Authorization: Bearer <token>                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Talos Kubernetes Cluster                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Envoy Gateway (>= v1.7.0)                          │   │
│  │  ├─ SecurityPolicy: dual-auth                       │   │
│  │  │   ├─ OIDC (browser flow with cookie session)     │   │
│  │  │   └─ JWT (Bearer token validation)               │   │
│  │  ├─ passThroughAuthHeader: true                     │   │
│  │  │   (Bearer requests skip OIDC redirect)           │   │
│  │  └─ jwt.optional: true                              │   │
│  │      (browser requests fall through to OIDC)        │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│              X-User-OID, X-User-Email headers               │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  LiteLLM Proxy (OSS edition)                        │   │
│  │  ├─ user_header_mappings consume X-User-Email       │   │
│  │  ├─ Per-user budgets via virtual keys               │   │
│  │  └─ MCP servers (Slack, Microsoft Foundry, etc.)    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
              Microsoft Entra ID (OAuth IdP)
              https://login.microsoftonline.com/<tenant>/v2.0
```

### How It Works

**Browser path (LiteLLM Admin UI, Open WebUI):**
1. User opens `https://llms.<domain>` in browser
2. Envoy Gateway receives request, no `Authorization` header
3. JWT `optional: true` → no JWT to validate; request falls through to the OIDC handler (note: an *invalid* JWT here would 401, not redirect — see §4.8)
4. OIDC redirects browser to Entra ID
5. User authenticates with corporate Microsoft account
6. Callback to `https://llms.<domain>/oauth2/callback`
7. Envoy sets `OauthSession` cookie (HMAC-signed, `Strict` SameSite, `Domain=llms.<domain>`)
8. Envoy forwards request to LiteLLM. Envoy first **strips any incoming `x-user-*` headers** (see §3.1), then sets identity headers from the OIDC session
9. LiteLLM identifies user via the `x-user-oid` header (authoritative); `x-user-email` is set for display only

**CLI subprocess path (Claude Code, Codex spawned by Electron):**
1. Electron uses MSAL Node to acquire token once (interactive on first launch)
2. Token cached via `safeStorage` + `@azure/msal-node-extensions`
3. Silent refresh in background via `acquireTokenSilent`
4. Before spawning Claude Code: pre-flight `getValidToken({ minLifetimeSeconds: 600 })`
5. Hand the token to the CLI subprocess via stdin handoff or a 0600 tmpfile (see §4.9 — env-var injection is a local privilege escalation surface and must NOT be the default)
6. CLI tool calls `https://llms.<domain>/v1/messages` with `Authorization: Bearer <token>`
7. Envoy: `passThroughAuthHeader: true` → the OIDC filter is **skipped entirely** for this request
8. JWT provider validates signature against Entra JWKS
9. JWT validates `iss`, `aud` (against the web API client ID GUID — see §C1 fix and §2.2), `exp`, `nbf`
10. `claimToHeaders` strips inbound `x-user-*` headers and overwrites them with `x-user-oid`, `x-user-tid`, `x-user-azp`, and (for display) `x-user-email`
11. LiteLLM sees authenticated request — same identity, same audit trail as browser

**Both paths converge on the same upstream with the same identity headers.** LiteLLM's `user_header_mappings` mechanism (configmap.yaml.j2:1185) already supports custom headers — currently it only maps `X-OpenWebUI-User-Id` / `X-OpenWebUI-User-Email`, so the new `x-user-oid` mapping must be added in Phase 1 (see §2.3).

### 1.5 Trust Model

The architecture has **three trust boundaries** that must be enforced separately. Each has a specific control:

| # | Boundary | Threat | Control |
|---|----------|--------|---------|
| TB-1 | Electron app ↔ Envoy Gateway | A compromised network path strips/forges Authorization header | TLS 1.2+ + HSTS at the gateway, certificate validation in MSAL Node |
| TB-2 | Envoy Gateway ↔ LiteLLM (intra-cluster) | A co-tenant pod in the `ai` namespace forges `x-user-oid` directly to LiteLLM ClusterIP, bypassing Envoy entirely | **CiliumNetworkPolicy locking LiteLLM port 4000 ingress to the Envoy Gateway pod selector only** (see §3.1) **AND** Envoy `requestHeadersToRemove: [x-user-*]` before `claimToHeaders` overwrite |
| TB-3 | LiteLLM ↔ downstream MCP servers (Foundry, GitHub, etc.) | LiteLLM forwards a CLI bearer to a downstream service that shouldn't receive it | LiteLLM `forward_llm_provider_auth_headers` is currently `false`; keep it false unless the downstream specifically needs OBO (the existing `foundry_mcp` uses `auth_type: bearer_token` + explicit `extra_headers` per `cluster-crossref.md`) |

> **Critical:** TB-2 is the strategy's most important boundary and the most under-specified in v1. The cluster's existing `CiliumNetworkPolicy` for LiteLLM (`ciliumnetworkpolicy.yaml.j2:15-22`) allows ingress from the Envoy Gateway namespace but does NOT exclude same-namespace pods. Without the §3.1 lock-down, **every claim in §7 collapses** because any pod in `ai` can curl LiteLLM and claim to be any user.

> **Implementation scope on `1code-api`:** The v2.1 **JWT half** of the dual-auth pattern is implemented on the 1code-api HTTPRoute — the service validates the Envoy-injected `x-user-oid`/`x-user-email`/`x-user-name` headers as trust-the-edge per the OpenSpec change `add-1code-api-litellm-provisioning`. The v2.1 **OIDC half** (browser-facing cookie flow) is explicitly **not** implemented on the 1code-api route — 1code-api is a backend-for-frontend consumed exclusively by the Electron desktop app, which already holds its own MSAL Node tokens. The OIDC half is deployed only on the LiteLLM HTTPRoute. See [`1code-api-provisioning.md`](./1code-api-provisioning.md) for the full provisioning API architecture.

---

## 2. Cluster Prerequisites

### 2.1 Envoy Gateway Version

**MUST be Envoy Gateway >= v1.7.1** (current latest stable, released 2026-03-12). The cluster is **already on v1.7.1** (verified in `cluster-crossref.md`); no upgrade needed.

Earlier versions have:
- Bug where `authorizationEndpoint` override is ignored (fixed v1.7.0)
- Missing `passThroughAuthHeader` (added v1.5.0)
- Missing `jwt.optional` (added v1.5.0)
- Missing SecurityPolicy name in stat prefix (fixed v1.7.0 — needed for observability)

**Hard constraint:** Use **HTTPRoute-scoped SecurityPolicy only** (not Gateway-scoped). [envoyproxy/gateway#8649](https://github.com/envoyproxy/gateway/issues/8649) (open, targeted to v1.8.0-rc.1 due 2026-04-22) describes a CSRF/redirect-loop bug when OIDC SecurityPolicies are mixed at Gateway and HTTPRoute levels — and the issue was reported on the exact gateway-helm 1.7.1 version we're pinning to. Re-evaluate the pin once v1.8.0 is GA.

Verify current cluster version:
```bash
kubectl get deploy -n network envoy-gateway -o jsonpath='{.spec.template.spec.containers[0].image}'
# Expected: ghcr.io/envoyproxy/gateway:v1.7.1 (or newer)
```

### 2.2 Microsoft Entra ID App Registrations

**RECOMMENDED: TWO app registrations** for operational separation (independent secret rotation, cleaner consent screens, ability to disable one flow without the other). A single-app design with both Web and Mobile-and-desktop platform configs **also works** with Entra v2.0 tokens — see "Single-app alternative" below.

> **CRITICAL — token version determines `aud` claim:** Microsoft Entra **v2.0 access tokens always carry `aud = <client_id GUID>`**, NOT the Application ID URI (`api://litellm`). This contradicts the v1 strategy doc and is verified in [Microsoft claims-validation docs](https://learn.microsoft.com/entra/identity-platform/claims-validation#validate-the-audience). The new v2 SecurityPolicy lists ONLY GUIDs in `jwt.audiences` — see §3.

**App 1: Confidential web client (for Envoy Gateway browser flow):**
- Type: Web
- Redirect URI: `https://llms.<domain>/oauth2/callback`
- Client secret: Required (NEW SOPS variable name `litellm_envoy_oidc_client_secret` — **do NOT** reuse `litellm_entra_client_secret` which is already used by LiteLLM's own SSO at `secret.sops.yaml.j2:59-65` and would silently break it)
- Permissions: `openid`, `email`, `profile`
- Application ID URI: `api://litellm` (defines the API surface; not used as `aud` for v2 tokens but still required to expose scopes)
- Expose API → Add scope `api://litellm/.default`
- **Token configuration → Optional claims:** add `email` for both ID tokens and access tokens. (`oid`, `tid`, `azp` are emitted by default in v2.0 access tokens and do NOT need to be added — they are NOT present in the Add optional claim dialog because they're default claims. Do not be confused by their absence.) `preferred_username` is display-only; optional.
- **🚨 CRITICAL — Manifest `requestedAccessTokenVersion: 2` is a HARD REQUIREMENT.** New Entra app registrations **default to `null` (which means v1.0 tokens)**, NOT v2.0 as the v2 strategy originally claimed. This was **empirically discovered during the 2026-04-08 smoke test** — see `envoy-claims-validation.md` "Smoke Test Results" section. You MUST explicitly edit the manifest and set `"requestedAccessTokenVersion": 2` (integer, inside the `api` object) in the JSON manifest editor, then click Save. Without this, tokens will be issued in v1 format with `aud = api://<client_id>` (not the GUID) and `iss = https://sts.windows.net/<tenant>/` (not the `/v2.0` form), which will cause 100% of CLI requests to fail JWT validation against the SecurityPolicy's audience and issuer configuration. The change takes ~60 seconds to propagate.
- **Verification after manifest edit:** Acquire a test token via client_credentials, decode at https://jwt.ms, confirm `ver: "2.0"`, `aud: "<client_id_GUID>"` (not `api://...`), `iss: "https://login.microsoftonline.com/<tenant>/v2.0"` (with `/v2.0` suffix), and `azp` is populated (not null).

**App 2: Public native client (for Electron app + MSAL Node):**
- Type: Mobile and desktop application
- Redirect URI: `http://localhost` (no port — MSAL Node selects an ephemeral port at runtime per RFC 8252; Entra ignores the port for loopback redirects)
- Allow public client flows: Yes
- API permissions: Add `api://litellm/.default` from App 1 (delegated)
- Client capabilities: `cp1` (declares CAE-readiness — note: CAE only applies to downstream LiteLLM→Graph calls, NOT to Electron→LiteLLM; see §7.4)

**Why we use two apps even though one would work:**
1. Independent client-secret rotation cadences
2. Reply-URL management is per-app — separating prevents accidental cross-pollution
3. Disabling the CLI flow without disabling the browser flow becomes a one-click operation
4. The v1 doc's stated reason ("different audiences") is **wrong** for v2 tokens — both flows produce `aud = <web-API-client-id GUID>`. We keep two apps for ops, not protocol.

**Single-app alternative:** Create one app with two platform configs (Web + Mobile-and-desktop). Both flows produce `aud = <the-one-client-id GUID>`, simpler `jwt.audiences` list (single GUID). Trade-off: secrets and reply URLs are co-managed.

**SOPS variable naming convention** to avoid collision with the existing LiteLLM Entra SSO:
- `litellm_envoy_oidc_client_id` (web app GUID — used in `SecurityPolicy.spec.oidc.clientID` AND `jwt.audiences`)
- `litellm_envoy_oidc_client_secret` (web app secret)
- `litellm_envoy_native_client_id` (native app GUID — added to `jwt.audiences` only if you choose two apps; same GUID for single-app)
- `entra_tenant_id` (existing — reused for issuer URL)

### 2.3 LiteLLM Configuration Updates

Add to `litellm-helmrelease.yaml.j2` configmap. The `user_header_mappings` mechanism exists at `configmap.yaml.j2:1185` but currently only maps the `X-OpenWebUI-User-*` headers — the Envoy claim headers must be added explicitly:

```yaml
general_settings:
  user_header_mappings:
    # Existing mappings preserved
    - header_name: "X-OpenWebUI-User-Id"
      litellm_user_role: "internal_user"
    - header_name: "X-OpenWebUI-User-Email"
      litellm_user_role: "customer"
    # NEW: Envoy Gateway JWT claim headers
    # x-user-oid is the AUTHORITATIVE identity key (immutable per-tenant GUID)
    - header_name: "x-user-oid"
      litellm_user_role: "internal_user"
    # x-user-email is for DISPLAY ONLY in the LiteLLM admin UI — never key budgets/auth on this
    # See entra-claims-validation.md R-E2: preferred_username is tenant-admin-mutable
    - header_name: "x-user-email"
      litellm_user_role: "internal_user"
```

**Critical:** Per-user budgets, spend logs, and audit attribution in LiteLLM **MUST be keyed on `x-user-oid`** (the `oid` claim — stable, immutable per-tenant), NOT on `x-user-email` (the `preferred_username` claim — Microsoft explicitly documents this as "never use for authorization decisions"; tenant-admin-mutable; B2B guests get synthetic UPN strings; users with email-as-alt-login can have it flip between sign-ins; service principals may not carry it at all). Update LiteLLM's per-user budget configuration accordingly.

**Pod restart required:** Changing `user_header_mappings` updates the configmap in etcd but does NOT reload the LiteLLM Python process. After the configmap change reconciles, force a pod rollout (`kubectl rollout restart deployment/litellm -n ai`) or add a checksum annotation to the deployment template. Without this, audit silently breaks until the next deploy.

---

## 3. Envoy Gateway SecurityPolicy

The complete SecurityPolicy for the LiteLLM HTTPRoute (revised v2 — see Section 11 Revision History for changes from v1):

```yaml
# kubernetes/apps/ai/litellm/app/securitypolicy.yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: litellm-dual-auth
  namespace: ai
spec:
  # HTTPRoute-scoped only — see §2.1 (envoyproxy/gateway#8649)
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: litellm

  # JWT validation for CLI/API clients
  jwt:
    # tolerates MISSING JWT only — invalid JWTs still 401 (see §4.8)
    optional: true
    providers:
      - name: entra
        issuer: https://login.microsoftonline.com/<tenant>/v2.0
        # CRITICAL FIX (v2): list ONLY the web API client ID GUID(s).
        # v2.0 access tokens always carry aud = client_id GUID, never api://litellm.
        # Source: https://learn.microsoft.com/entra/identity-platform/claims-validation#validate-the-audience
        audiences:
          - <web-api-client-id-guid>     # web app GUID (also used by CLI flow when single-app)
          # If using two app registrations, add the native client GUID below:
          # - <native-client-id-guid>
        remoteJWKS:
          uri: https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys
          # Keep cache short so revoked-key rotations propagate quickly
          cacheDuration: 300s   # 5 minutes
        # CRITICAL FIX (v2): identity is keyed on `oid`, NOT `preferred_username`
        # `email` is forwarded for display only (LiteLLM admin UI showing user labels)
        claimToHeaders:
          - header: x-user-oid     # AUTHORITATIVE identity (immutable per-tenant GUID)
            claim: oid
          - header: x-user-tid     # tenant ID for cross-tenant scoping
            claim: tid
          - header: x-user-azp     # authorized party (caller app GUID — for confused-deputy defense, see H13)
            claim: azp
          - header: x-user-email   # DISPLAY ONLY — never use for authorization
            claim: preferred_username

  # OIDC for browser clients
  oidc:
    # passThroughAuthHeader: requests with a Bearer header skip OIDC entirely.
    # Verbatim from envoy-gateway api/v1alpha1/oidc_types.go:
    # "Skips OIDC authentication when the request contains a header that will be
    #  extracted by the JWT filter."
    # Officially supported combo (with jwt.optional) per envoyproxy/gateway
    # discussion #2425, maintainer arkodg, 2025-08-11.
    # SMOKE TEST REQUIRED before Phase 1: confirm that with this flag the OIDC
    # filter does NOT overwrite the inbound CLI Bearer with its own session
    # access_token. Code reading suggests it does not, but the interaction is
    # not explicitly documented. See §6 Phase 1 Step 4.5 and envoy-claims-validation.md.
    passThroughAuthHeader: true
    # PKCE on the browser flow — defaults to false in v1.7.x; turn on explicitly
    pkceEnabled: true
    provider:
      issuer: https://login.microsoftonline.com/<tenant>/v2.0
    clientID: <web-api-client-id-guid>
    clientSecret:
      name: litellm-envoy-oidc-secret
      key: client-secret
    redirectURL: https://llms.<domain>/oauth2/callback
    logoutPath: /oauth2/logout
    scopes:
      - openid
      - email
      - profile
      - api://litellm/.default
    # forwardAccessToken: only takes effect on the OIDC (browser) path, where it
    # places the OIDC session access_token into the Authorization header upstream.
    # On the CLI path, passThroughAuthHeader skips the OIDC filter entirely so this
    # field has no effect there.
    forwardAccessToken: true
    cookie:
      sessionLifetime: 28800s     # 8 hours
      refreshToken: true
      # CRITICAL FIX (v2): Strict, not Lax. Single-site flow needs no cross-origin POST.
      # Lax permits CSRF-via-POST from another tab to LiteLLM admin endpoints once authenticated.
      sameSite: Strict
      # CRITICAL FIX (v2): pin to single host, not parent domain.
      # Without this, an XSS in any sibling subdomain (hubble.<domain>, grafana.<domain>) reads/replays it.
      domain: llms.<domain>
      httpOnly: true
      secure: true

  # CRITICAL FIX (v2): strip any inbound x-user-* headers BEFORE the JWT filter
  # populates them via claimToHeaders. Without this, a malicious upstream client
  # can preset x-user-oid in the request and the claimToHeaders mapping (which
  # only ADDS headers, not replaces) leaves the attacker value in place for some
  # filter dispatch orderings. Belt-and-braces — defense in depth alongside §3.1.
  # Note: this requires using a separate Envoy filter (HTTPFilter or
  # HeaderModifier extension) since SecurityPolicy itself doesn't expose
  # request header removal. See §3.1 implementation.
```

> **`x-user-*` header stripping** is NOT a SecurityPolicy field. It must be implemented as a `BackendTrafficPolicy` or via an Envoy Gateway HTTPFilter that runs **before** the JWT filter. Concretely: add a `requestHeadersToRemove` configuration on the HTTPRoute via `HTTPRoute.spec.rules[].filters[]` of kind `RequestHeaderModifier`. This is **load-bearing** — if the strip step is missing, an attacker who can inject a header anywhere in the request chain (browser extension, MITM on plaintext HTTP downgrade, malicious upstream proxy) can spoof identity. See §3.1 below for the exact YAML.

### 3.1 Defense in Depth: Cluster-Internal Network Lock-Down + Header Strip

> **Why this section exists:** Without these two controls, every security claim in §7 is bypassable by any pod in the `ai` namespace.

**Control 1: CiliumNetworkPolicy restricting LiteLLM ingress to Envoy Gateway only.**

The cluster's existing `templates/config/kubernetes/apps/ai/litellm/app/ciliumnetworkpolicy.yaml.j2` allows ingress to LiteLLM port 4000 from the `network` namespace where Envoy Gateway runs, BUT does NOT exclude same-namespace pods. This must be tightened:

```yaml
# Add to ciliumnetworkpolicy.yaml.j2 — restricts LiteLLM port 4000 to Envoy Gateway pods only
# Does NOT block port 8081 (metrics) or other internal cluster service traffic.
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: litellm-restrict-port-4000
  namespace: ai
spec:
  endpointSelector:
    matchLabels:
      app.kubernetes.io/name: litellm
  ingress:
    - fromEndpoints:
        - matchLabels:
            k8s:io.kubernetes.pod.namespace: network
            k8s:app.kubernetes.io/name: envoy
      toPorts:
        - ports:
            - port: "4000"
              protocol: TCP
    # Allow Prometheus scraping on metrics port (existing pattern)
    - fromEndpoints:
        - matchLabels:
            k8s:io.kubernetes.pod.namespace: observability
      toPorts:
        - ports:
            - port: "8081"
              protocol: TCP
```

**Verification:** After applying, run from a sibling pod in `ai`:
```bash
kubectl run -it --rm test --image=curlimages/curl --namespace=ai -- \
  curl -v -H 'x-user-oid: 11111111-1111-1111-1111-111111111111' \
  http://litellm.ai.svc.cluster.local:4000/v1/models
# Expected: connection refused or timeout (NOT a 200 with model list)
```

**Control 2: HTTPRoute filter stripping inbound `x-user-*` headers.**

Add a `RequestHeaderModifier` filter to the LiteLLM `HTTPRoute` spec so that any client-supplied `x-user-*` header is removed BEFORE Envoy's JWT filter populates them via `claimToHeaders`:

```yaml
# Edit templates/config/kubernetes/apps/ai/litellm/app/httproute.yaml.j2
spec:
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      filters:
        # NEW: strip identity headers from inbound requests before JWT filter
        - type: RequestHeaderModifier
          requestHeaderModifier:
            remove:
              - x-user-oid
              - x-user-tid
              - x-user-email
              - x-user-azp
              - x-user-id          # legacy from v1 doc — strip too in case any client still sends it
      backendRefs:
        - name: litellm
          port: 4000
```

**Verification:** Test that a client cannot pre-set the headers:
```bash
# From OUTSIDE the cluster, with no auth:
curl -H 'x-user-oid: forged' https://llms.<domain>/v1/models
# Expected: 302 redirect to Entra (header is stripped before JWT/OIDC)

# With a real Entra Bearer:
curl -H 'Authorization: Bearer <real>' \
     -H 'x-user-oid: forged' https://llms.<domain>/v1/models
# Expected: LiteLLM logs show oid from the JWT, NOT "forged"
```

---

## 4. Critical Gotchas

These are the verified gotchas from research that must be planned around:

### 4.1 ~~Cookie Expiry Tracks Access Token (envoyproxy/envoy#30053)~~ — HISTORICAL, FIXED 2024-03-20

**Status:** Fixed upstream in [envoyproxy/envoy#30053](https://github.com/envoyproxy/envoy/issues/30053), closed 2024-03-20. Included in Envoy ≥1.31, which is bundled with Envoy Gateway ≥1.5.0. The cluster's v1.7.1 pin is well past this fix.

**Historical context:** Pre-fix, if Entra issued a 1-hour access token, the Envoy session cookie expired at 1 hour even if `cookie.sessionLifetime: 28800s` was set.

**Defense-in-depth (still good practice, no longer working around an active bug):**
- Set `refreshToken: true` so Envoy auto-refreshes from refresh token
- Set `cookie.sessionLifetime` much longer than access token TTL
- Browser users will see silent re-auth on token expiry — this is expected behavior, not a bug

### 4.2 Cookie Size Blow-up with Entra `groups` Claim (envoyproxy/gateway#7315)

**Issue:** Entra access tokens with `groups` claim can exceed browser cookie size limits → redirect loops. Status: [envoyproxy/gateway#7315](https://github.com/envoyproxy/gateway/issues/7315) is OPEN, reported on Envoy Gateway 1.5.2 (may still repro on 1.7.x — untested).

**Mitigation:**
- In the web API app manifest, set `groupMembershipClaims: 'ApplicationGroup'` (or "Groups assigned to the application" in the Token configuration UI) so the token only carries groups explicitly assigned to the app — keeps payload well under the 200-group JWT overage threshold
- This is a manifest setting, NOT a Conditional Access policy
- If the app needs full group data, fetch from Microsoft Graph in LiteLLM middleware after token introspection
- Avoid `wids` claim which is also large (controlled by `groupMembershipClaims` set to `None`/`SecurityGroup` to suppress)
- Note: even with `ApplicationGroup` mode, a user with >200 directly-assigned groups still hits overage; LiteLLM middleware must handle `_claim_names`/`_claim_sources` fallback if it does any group-based RBAC

### 4.3 CAE Claims Challenges Are NOT Intercepted by Envoy

**Issue:** When LiteLLM calls Microsoft Graph and gets `401 WWW-Authenticate: Bearer claims="..."`, Envoy passes this through to the client UNCHANGED. Envoy does not handle CAE.

**Mitigation:**
- **CAE handling MUST be in the application layer** (LiteLLM Python middleware OR Electron MSAL Node middleware)
- This is the SAME requirement as in the v5 strategy doc — Section 7 CAE protocol applies here too

### 4.4 No `X-Auth-Request-*` Headers (oauth2-proxy convention)

**Issue:** Envoy Gateway does NOT emit oauth2-proxy-style `X-Auth-Request-Email` headers. Custom header names are required.

**Mitigation:**
- Use `claimToHeaders` to extract identity into custom headers like `x-user-email`, `x-user-oid`
- Configure LiteLLM `user_header_mappings` to read these custom headers (already done — see Section 2.3)

### 4.5 Gateway-level + Route-level SecurityPolicy Conflict (envoyproxy/gateway#8649)

**Issue:** Combining a gateway-level OIDC SecurityPolicy with a route-level policy causes CSRF/redirect loops.

**Mitigation:**
- Use HTTPRoute-level SecurityPolicy ONLY
- Never mix levels
- Each route gets its own SecurityPolicy

### 4.6 Multi-Tenant Entra Painful

**Issue:** `jwt_authn` filter doesn't natively wildcard issuers, making multi-tenant Entra apps painful.

**Mitigation:**
- Use single-tenant Entra app
- If multi-tenant required, use `iss` regex via Envoy filter chains (complex)

### 4.7 ~~Audience Mismatch Between Web Client and API~~ — CORRECTED v2

**v1 said:** "Browser-issued tokens have `aud = client_id`, CLI-issued tokens have `aud = api://litellm`. Single audience in JWT provider validates only one flow."

**v2 correction:** This was wrong. **Entra v2.0 access tokens always carry `aud = <client_id GUID>`**, never `api://litellm` (which is the Application ID URI, not the audience). Verified in [Microsoft claims-validation docs](https://learn.microsoft.com/entra/identity-platform/claims-validation#validate-the-audience).

Both browser-flow and CLI-flow tokens, when targeting the web API app, will carry `aud = <web-api-client-id GUID>`. The JWT provider's `audiences` list needs ONLY that GUID. If using two app registrations (recommended for ops separation), add the native client GUID too — but only because CLI tokens may carry the native client GUID under specific consent flows; the simpler single-app-two-platforms design avoids this entirely.

**Action:** Section 3 has been updated with the correct `audiences:` list. **Phase 1 verification (mandatory):** acquire one token from each flow against a dev tenant, decode at https://jwt.ms, and confirm the actual `aud` value before flipping production traffic.

### 4.8 `jwt.optional: true` Does NOT Soft-Fail Invalid JWTs

**Issue:** `jwt.optional: true` (per Envoy Gateway `api/v1alpha1/jwt_types.go`) tolerates a **missing** JWT only. An **invalid** JWT (bad signature, wrong issuer, expired, malformed) still produces a 401 — the request does NOT fall through to the OIDC redirect path. This means a browser request that arrives with a stale/garbage `Authorization: Bearer xxx` header gets a 401, not a redirect.

**Implication for the CLI path:** When an Entra token expires mid-session, the CLI must refresh **proactively** before calling Envoy. There is no redirect bailout — a 401 is final.

**Mitigation:**
- Section 5.4 already specifies `getValidToken({ minLifetimeSeconds: 600 })` pre-flight check (10-minute floor), which prevents this in the happy path
- Add a runtime catch on 401 from `https://llms.<domain>` that triggers an immediate `acquireTokenSilent` retry, and surfaces an interactive re-auth prompt if silent refresh fails
- Document this in the CAE handler middleware

### 4.9 Token Injection via Process Environment is a Local Privilege Escalation Surface

**Issue:** v1 of this strategy proposed injecting `ANTHROPIC_AUTH_TOKEN=<bearer>` into the spawned Claude/Codex CLI subprocess environment. On Linux, `/proc/<pid>/environ` is readable by **any process running as the same UID** (no privilege escalation needed). On macOS, `ps eww <pid>` exposes the environment to the same user. On Windows, any process with `PROCESS_QUERY_INFORMATION` rights can read it via `NtQueryInformationProcess`.

**Threat scenario:** A co-resident process (npm postinstall hook, browser extension helper, hostile dependency in any other dev tool the user runs concurrently) extracts the user's full Entra access token without elevation. Worse on this strategy than v5 because v5 keeps tokens inside the Electron process address space; this strategy externalizes them for the entire CLI subprocess lifetime.

**Mitigation (REQUIRED, not optional):**
1. **Replace env-var injection with stdin handoff** where the CLI binary supports it. The Anthropic SDK accepts the token from a file via `ANTHROPIC_AUTH_TOKEN_FILE` (verify against pinned `2.1.45` Claude CLI binary). Write a 0600-permission file in the user's runtime dir, pass the path to the subprocess, unlink after spawn confirms read.
2. **If env-var injection is the only option** for a given binary version, document an upper bound on token lifetime in the env: max 15 minutes via PTY signal-driven refresh that kills+restarts the child if refresh fails.
3. **Document this in the user-facing security model** so 1Code users on shared workstations / VDI / corporate desktops understand the risk.

### 4.10 Concurrent OIDC Browser Tabs Can Race the State Cookie

**Issue:** Envoy Gateway's OIDC state cookie is per-host, not per-tab. If a user opens `https://llms.<domain>` in two browser tabs simultaneously and both initiate OIDC, the second redirect overwrites the first's state cookie. One of the two callbacks fails CSRF validation. In some Envoy versions ([envoyproxy/gateway#8649](https://github.com/envoyproxy/gateway/issues/8649)), the failing tab gets stuck in a redirect loop.

**Mitigation:**
- Phase 2 LiteLLM admin UI documentation should warn users not to open the admin UI in multiple tabs simultaneously
- Set `cookie.path: /` (already implicit) to ensure only one state cookie per host, not per path
- The broader fix is upstream in v1.8.0 — re-evaluate after upgrade

---

## 5. Electron App Implementation

### 5.1 What's Different from v5 Strategy

| Component | v5 Strategy | This Architecture |
|-----------|------------|-------------------|
| MSAL Node | Full OAuth flow with PKCE | **Token acquisition only** |
| Slack OAuth in Electron | PKCE flow with state isolation | **DELETED** — Slack via LiteLLM MCP |
| Per-provider OAuth state isolation (S-H2) | Required | **DELETED** — only one auth flow |
| `flow-registry.ts` | Required | **DELETED** |
| Custom URI scheme dispatcher refactor | Required | **DELETED** — only Entra deep link needed |
| LiteLLM virtual key management | Required | **DELETED** — Envoy provides identity headers |

### 5.2 What's the Same

| Component | Both Architectures |
|-----------|---------------------|
| `bun:test` test framework | Required |
| Phase 0 cleanup (delete dead code, fix logs) | Required |
| Electron 41 upgrade | Required (before 39 EOL) |
| Electron Fuses + ASAR integrity | Required |
| Renderer CSP tightening | Required |
| `validateSender` hardening | Required |
| MSAL Node + `clientCapabilities: ["cp1"]` | Required |
| CAE protocol (heartbeat + lifetime cap) | Required |
| Linux `safeStorage` layered strategy | Required |
| Drizzle hybrid schema | Required (simpler — fewer rows) |
| Strangler Fig migration of `auth-manager.ts` | Required |

### 5.3 New Module Structure

```
src/main/
├── lib/
│   ├── enterprise-auth.ts       ← MSAL Node token acquisition (no full OAuth flow)
│   ├── enterprise-store.ts      ← Refactored from auth-store.ts
│   ├── litellm-client.ts        ← Settings, env injection, connection test
│   ├── trpc/routers/
│   │   ├── enterprise-auth.ts   ← Sign in/out, token refresh
│   │   └── litellm.ts           ← Proxy configuration
│   ├── oauth.ts                 ← KEEP (MCP OAuth still needed for non-LiteLLM MCP servers)
│   ├── mcp-auth.ts              ← KEEP
│   └── claude-token.ts          ← KEEP
├── auth-manager.ts              ← Strangler Fig adapter, delegates to enterprise-auth.ts
└── auth-store.ts                ← Strangler Fig adapter
```

**4 fewer files** than the v5 strategy: no `microsoft-graph.ts`, no `slack-auth.ts`, no `microsoft.ts` router, no `slack.ts` router, no `flow-registry.ts`.

### 5.3.1 Strangler Fig Migration Plan for `auth-manager.ts`

`src/main/auth-manager.ts` currently has 11 public methods, ~20 call sites in the app, and is hard-coded to 21st.dev semantics (`exchangeCode`, `getApiBaseUrl`, `21st.dev` URLs). The strategy claims it becomes "an adapter that delegates" — this section spells out the per-method migration so the work is not hand-waved.

| `auth-manager.ts` method | Current behavior | Enterprise replacement | Migration |
|--------------------------|------------------|------------------------|-----------|
| `constructor(isDev)` | Initializes 21st.dev token store, schedules refresh | Initializes `enterprise-auth.ts` MSAL Node client, schedules silent refresh | Straight swap inside the constructor; gated by `ENTERPRISE_AUTH_ENABLED` feature flag |
| `exchangeCode(code)` | POSTs to `21st.dev/api/auth/desktop/exchange` | **N/A — DELETE** (MSAL Node handles the auth code exchange internally; there is no equivalent) | Remove the deep-link handler that calls this; replace with an MSAL `acquireTokenInteractive` trigger |
| `refresh()` | POSTs to `21st.dev/api/auth/desktop/refresh` | `acquireTokenSilent` with the cached account | Direct delegate; the public method signature stays the same |
| `signOut()` | Clears local store, POSTs revoke to 21st.dev | Clears MSAL cache + persistence; logs auth event | Direct delegate |
| `isAuthenticated()` | Checks 21st.dev token presence | Checks for a non-expired Entra account in MSAL cache | Direct delegate |
| `getCurrentUser()` | Returns 21st.dev user object | Returns `{ oid, tid, displayName, email }` from cached `IdTokenClaims` | Shape change — update consumers to read `oid` not `id` |
| `setOnTokenRefresh(cb)` | 21st.dev refresh hook | Wired into MSAL silent refresh completion event | Direct delegate; same signature |
| `scheduleRefresh()` (private) | 5 min before token expiry, calls `refresh()` | 5 min before MSAL `expiresOn`, calls `acquireTokenSilent` | Direct delegate |
| `getDeviceInfo()` (private) | OS + version for telemetry | Same | No change |
| `getApiUrl()` (private) | Returns 21st.dev URL | **N/A — DELETE** | Remove all 21st.dev URL references |
| `dispose()` | Cancels refresh timer | Same + flushes MSAL cache | Direct delegate |

**Migration phasing:**
1. **Step A (Phase 0)** — Add `enterprise-auth.ts` and `enterprise-store.ts` as new files, NOT yet wired to anything. Add `ENTERPRISE_AUTH_ENABLED` feature flag (default OFF). Add unit tests via `bun:test` for the MSAL client init paths.
2. **Step B (Phase 1)** — In `auth-manager.ts` constructor, branch on the feature flag: if ON, instantiate `EnterpriseAuth` and forward all method calls; if OFF, keep legacy 21st.dev behavior. The 20 call sites remain unchanged.
3. **Step C (Phase 1)** — `getCurrentUser()` shape change is the one source-incompatible delta. Migrate all 20 call sites to read `user.oid` (or `user.id` for legacy compat) in a single PR. Add a TypeScript type union `Legacy21stUser | EnterpriseUser` to make the migration safe.
4. **Step D (Phase 2)** — Once the feature flag has been ON in production for 2+ weeks with no rollbacks, delete the 21st.dev branch and the `Legacy21stUser` type. `auth-manager.ts` becomes a pure delegating adapter.
5. **Step E (Phase 3+)** — `auth-manager.ts` may be retired entirely once all consumers import `enterprise-auth.ts` directly.

### 5.4 Token Injection for CLI Subprocess

> **CRITICAL — collision with existing code:** A function named `buildClaudeEnv` already exists in `src/main/lib/claude/env.ts` (read by code-review-graph as a 277-line module that constructs the spawned-CLI environment, with load-bearing `STRIPPED_ENV_KEYS` logic that intentionally strips `ANTHROPIC_API_KEY` in dev mode to force OAuth). The strategy must **modify the existing function in place**, not introduce a new one with the same name.
>
> Existing call sites that consume the constructed env:
> - `src/main/lib/trpc/routers/claude.ts:1168` (custom-config branch)
> - `src/main/lib/trpc/routers/claude.ts:1448-1494` (existing-CLI-config branch)
> - `src/main/lib/trpc/routers/claude.ts:1629-1634` (final spawn — also contains a token preview log that must be removed in Phase 0)
> - `src/main/lib/trpc/routers/claude-code.ts:119-127` (config detection)
> - `src/main/lib/trpc/routers/claude-code.ts:125` (env merge)
>
> All five sites need to know whether enterprise auth is on, fetch the token, and inject it. The cleanest design is a single helper that all five sites delegate to.

```typescript
// src/main/lib/claude/env.ts (modify EXISTING file, do not create new)
import { getEnterpriseAuth } from "../enterprise-auth";
import { isFeatureEnabled } from "../feature-flags";  // see §5.7
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Existing STRIPPED_ENV_KEYS / cachedShellEnv / etc. preserved verbatim ↑

/**
 * Augment the Claude/Codex spawn environment with enterprise auth config.
 *
 * Called by the EXISTING buildClaudeEnv() at the END of its env-construction
 * pipeline (after STRIPPED_ENV_KEYS strip pass), so the enterprise token is
 * not stripped in dev mode like the upstream API key is.
 *
 * Returns either:
 *   - { env, tokenFile }   : token written to a 0600 file, path injected via
 *                            ANTHROPIC_AUTH_TOKEN_FILE (preferred — see §4.9)
 *   - { env }              : token injected via ANTHROPIC_AUTH_TOKEN env var
 *                            (fallback — only for binaries that don't support
 *                             the file form)
 *
 * Caller MUST `fs.unlink(tokenFile)` after the spawn confirms read.
 */
export async function applyEnterpriseAuth(
  env: NodeJS.ProcessEnv,
  options: { useTokenFile?: boolean } = { useTokenFile: true }
): Promise<{ env: NodeJS.ProcessEnv; tokenFile?: string }> {
  if (!isFeatureEnabled("ENTERPRISE_AUTH_ENABLED")) {
    return { env };  // legacy 21st.dev path untouched
  }
  if (!isFeatureEnabled("LITELLM_PROXY_ENABLED")) {
    return { env };  // running direct-to-API even with enterprise auth on
  }

  const auth = getEnterpriseAuth();
  // Pre-flight: ensure token has at least 10 minutes remaining (see §4.8)
  const token = await auth.getValidToken({ minLifetimeSeconds: 600 });
  if (!token) {
    throw new Error("Authentication required — sign in to enterprise auth");
  }

  const baseUrlPatch = {
    ANTHROPIC_BASE_URL: process.env.LITELLM_PROXY_URL ?? "https://llms.<domain>",
  };

  if (options.useTokenFile) {
    // Preferred path — write a 0600 tmpfile, pass via ANTHROPIC_AUTH_TOKEN_FILE
    // Verifies process-environment exposure mitigation per §4.9.
    const tokenFile = path.join(
      os.tmpdir(),
      `1code-token-${randomUUID()}.txt`
    );
    fs.writeFileSync(tokenFile, token, { mode: 0o600 });
    return {
      env: {
        ...env,
        ...baseUrlPatch,
        ANTHROPIC_AUTH_TOKEN_FILE: tokenFile,
      },
      tokenFile,  // caller must unlink after spawn
    };
  }

  // Fallback path — env-var injection. WARNING per §4.9: this exposes the token
  // to /proc/<pid>/environ, ps eww, etc. Only use when the binary version does
  // not support ANTHROPIC_AUTH_TOKEN_FILE.
  return {
    env: {
      ...env,
      ...baseUrlPatch,
      ANTHROPIC_AUTH_TOKEN: token,
    },
  };
}
```

**Integration with the existing `buildClaudeEnv`:**

The existing `buildClaudeEnv` (at `src/main/lib/claude/env.ts`, ~277 lines, exported and called from 5 sites) ends by returning `{ env, ... }`. Modify it to:

```typescript
// At the end of buildClaudeEnv(), AFTER STRIPPED_ENV_KEYS strip pass:
const enterprisePatch = await applyEnterpriseAuth(env);
return {
  ...existingReturnValue,
  env: enterprisePatch.env,
  tokenFile: enterprisePatch.tokenFile,  // new field — caller must clean up
};
```

The 5 call sites need ONE additional line each: `if (result.tokenFile) cleanupAfterSpawn(result.tokenFile);`. Add a helper for this in `claude/env.ts`.

**Verification (Phase 1):** A `bun:test` unit test must assert:
1. With `ENTERPRISE_AUTH_ENABLED=false`, the env is unchanged (legacy path preserved)
2. With `ENTERPRISE_AUTH_ENABLED=true` and `useTokenFile=true`, the env contains `ANTHROPIC_AUTH_TOKEN_FILE` and the file exists with mode 0600
3. With `ENTERPRISE_AUTH_ENABLED=true` and `useTokenFile=false`, the env contains `ANTHROPIC_AUTH_TOKEN` and a security note is logged
4. The token is NEVER logged in any form (grep guard test)

### 5.5 Browser Auth Flow (For Settings UI)

For the LiteLLM Admin UI (browser-based), the Electron app opens a `BrowserWindow`. This must be carefully configured to inherit the app's existing `validateSender` rules and CSP — see also security review M-4 for the credential confusion warning vs legacy MCP OAuth windows.

```typescript
// src/main/lib/litellm-admin.ts
const adminWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    partition: "persist:litellm-admin",  // Isolated session, no cookie collision
                                          // with legacy MCP OAuth windows (different partition)
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    // No preload script - this is a "vanilla browser window" for the LiteLLM admin UI;
    // no IPC bridge needed
  }
});

// Add llms.<domain> to the validateSender allowlist BEFORE loading the URL,
// or this BrowserWindow will be rejected by the app's IPC sender validation.
adminWindow.loadURL("https://llms.<domain>/admin");

// Envoy Gateway handles OIDC flow inside the BrowserWindow.
// Session cookie persists in the "persist:litellm-admin" partition.
// CRITICAL: clear this partition on enterprise sign-out (see Strangler Fig step D)
// otherwise the user can re-enter the admin UI without re-authenticating.
```

### 5.6 Coexistence with Legacy MCP OAuth (Strategy: Two Systems Side-by-Side)

The strategy keeps `oauth.ts`, `mcp-auth.ts`, `claude-token.ts` for "MCP OAuth for non-LiteLLM MCP servers." This means TWO auth systems coexist:

1. **Enterprise Auth** (new) — MSAL Node + Envoy Gateway, used for all LiteLLM-routed traffic
2. **MCP OAuth** (legacy) — `oauth.ts` PKCE flow, used for direct MCP server connections that bypass LiteLLM

This coexistence MUST be documented to prevent confusion:

| Concern | Enterprise Auth | Legacy MCP OAuth |
|---------|----------------|------------------|
| BrowserWindow partition | `persist:litellm-admin` | (varies by MCP server — keep separate) |
| Token cache | MSAL Node + `@azure/msal-node-extensions` | `mcp-auth.ts` Drizzle row (encrypted) |
| Refresh schedule | MSAL silent refresh (~5 min before expiry) | Per-MCP-server refresh logic in `mcp-auth.ts` |
| Failure mode | Re-auth via MSAL interactive flow | Re-auth via `oauth.ts` PKCE callback |
| Audit trail | Enterprise auth event log (see §7.7) | `mcp-auth.ts` connection events |
| What "sign out" does | Clears MSAL cache + LiteLLM admin partition cookies | Clears the specific MCP server's stored token |

**Key rule:** Sign-out from enterprise auth does NOT log the user out of any non-LiteLLM MCP servers, and vice versa. Document this in the Settings UI so users aren't confused. For high-security deployments, add an "Sign out of all" button that walks both stores.

### 5.7 Feature Flag Infrastructure (NEW — does not exist yet)

The strategy depends on two feature flags (`ENTERPRISE_AUTH_ENABLED`, `LITELLM_PROXY_ENABLED`) but the codebase has no feature flag mechanism today. Build the minimum viable system in Phase 0:

```typescript
// src/main/lib/feature-flags.ts (NEW FILE — Phase 0)
import { app } from "electron";

type FlagName = "ENTERPRISE_AUTH_ENABLED" | "LITELLM_PROXY_ENABLED";

const DEFAULTS: Record<FlagName, boolean> = {
  ENTERPRISE_AUTH_ENABLED: false,
  LITELLM_PROXY_ENABLED: false,
};

export function isFeatureEnabled(name: FlagName): boolean {
  // Priority order (first match wins):
  // 1. Environment variable (dev override): FEATURE_<NAME>=true|false
  // 2. User-settings store (set via Settings UI)
  // 3. Build-time default
  const envOverride = process.env[`FEATURE_${name}`];
  if (envOverride !== undefined) return envOverride === "true";

  // Read from settings store (Drizzle table — see §5.7 schema)
  const storedValue = readFlagFromStore(name);
  if (storedValue !== null) return storedValue;

  return DEFAULTS[name];
}

export async function setFeatureFlag(name: FlagName, value: boolean): Promise<void> {
  await writeFlagToStore(name, value);
  // Restart hint: some flags require app restart to take effect
  if (name === "ENTERPRISE_AUTH_ENABLED") {
    app.relaunch();
    app.exit();
  }
}
```

Add a Drizzle table in `src/main/lib/db/schema/index.ts`:
```typescript
export const featureFlags = sqliteTable("feature_flags", {
  name: text("name").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

A new migration is required — generate via `bun run db:generate` after adding the table.

---

## 6. Implementation Phases

> **Phase ordering note (v2):** v1 inherited Phase 0 wholesale from v5. v2 lists Phase 0 explicitly so the count of items is correct (v1 undercounted token log leaks 2→4) and so the Envoy-specific hard gates are visible. The HARD GATE items below MUST be merged before any Phase 1 work begins.

### Phase 0: Foundation (Hard Gates — Verified Counts in v2)

> **Hard gate definition:** PRs touching the new enterprise auth code MUST be blocked at code review until every item below is merged. None of these are optional.

**Security hard gates (must be merged BEFORE the feature flag goes ON anywhere):**

| # | Item | Verification |
|---|------|--------------|
| 1 | **Delete `auth:get-token` IPC handler** at `src/main/windows/main.ts:434-437` | grep `auth:get-token` returns no matches |
| 2 | **Delete `getAuthToken` preload bridge** at `src/preload/index.ts:198` | grep returns no matches |
| 3 | **Delete `getAuthToken` type declaration** at `src/preload/index.ts:461` | grep returns no matches |
| 4 | **Add regression test** asserting `desktopApi.getAuthToken === undefined` | bun:test passes |
| 5 | **Remove ALL FOUR token preview logs** in `src/main/lib/trpc/routers/claude.ts` at lines 203, 247, 1540, 1634 (NOT two — v1 footgun in CLAUDE.md was wrong) | grep `slice\(0,\s*\d+\)\s*\+\s*"\\.\\.\\."` returns no matches |
| 6 | **Remove `[claude-env] ANTHROPIC_AUTH_TOKEN: ${env.ANTHROPIC_AUTH_TOKEN ? "set" : "not set"}` log** at `src/main/lib/claude/env.ts:302` | grep returns no matches |
| 7 | **Audit `scripts/download-claude-binary.mjs` and `scripts/download-codex-binary.mjs`** for SHA-256 checksum verification; pin upstream hashes | grep `sha256` exists in both files; downloads fail on hash mismatch |
| 8 | **Resolve `src/main/lib/trpc/routers/claude-code.ts:178-220` upstream sandbox dependency** — this fetches `${apiUrl}/api/auth/claude-code/start` from `21st.dev`, breaks when upstream retires (P0 hidden upstream dependency, see CLAUDE.md footgun) | Either: (a) localhost loopback redirect, or (b) self-hosted sandbox endpoint, or (c) feature flag fallback — choose one and document in `.scratchpad/../enterprise/upstream-features.md` |

**Infrastructure hard gates:**

| # | Item | Verification |
|---|------|--------------|
| 9 | **Stand up minimum CI in `ai-coding-cli`** — at minimum `bun run ts:check + bun run build + bun audit` on PRs (sibling cluster repo has 14 workflows; this repo has 0) | `.github/workflows/ci.yml` exists and passes |
| 10 | **Enable Dependabot + secret scanning** in repo settings | Dependabot config exists |
| 11 | **Adopt `bun:test` test framework** — write the regression guard tests for items 4, 6, 14, and the §5.4 unit test scenarios | `bun test` runs and reports >0 tests |
| 12 | **Build feature flag infrastructure** per §5.7 — `src/main/lib/feature-flags.ts` + Drizzle schema + migration | `isFeatureEnabled('ENTERPRISE_AUTH_ENABLED')` returns false by default |
| 13 | **Convert this strategy doc to OpenSpec** under `openspec/changes/replace-21st-auth-with-enterprise-sso/` (see prior review final report Section P0-4) | `openspec change list` shows the entry |

**Environment / dependency hard gates:**

| # | Item | Verification |
|---|------|--------------|
| 14 | **Patch Electron to `~39.8.7`** (current is `~39.8.6`) | `package.json` shows the bump |
| 15 | **Cross-link with `.scratchpad/../enterprise/upstream-features.md`** — verify all F1-F10 upstream dependencies have either a "keep upstream" or "replace" decision before Phase 1 begins | Inventory has decisions for all rows |

### Phase 0.5: Electron 41 Upgrade + MSAL Node v5

This was previously "identical to v5 Phase 0.5" but the v2 review found the Envoy strategy specifically requires coordination with MSAL Node v5 (see H9 in review):

1. **Upgrade Electron** from `~39.8.6` → `~41.x` (before 39 EOL on 2026-05-05). Re-test session resume, streaming, and the `validateSender` boundary.
2. **Pin MSAL Node v5.x** (NOT v3 as v1 said). MSAL Node jumped v3→v5 directly; v5 requires Node 20+ (Electron 41 bundles Node 20+, so this works), removes `proxyUrl`/`customAgentOptions`, moves `protocolMode` to system config, renames `fromNativeBroker → fromPlatformBroker`. See [MSAL Node v5 migration guide](https://learn.microsoft.com/entra/msal/javascript/node/v5-migration).
3. **Pin `@azure/msal-node-extensions` to a verified version** (v1 said `^5.1.2` — verify on npm before committing). Note: this is a NATIVE module and must be added to `electron-rebuild` target list in `package.json` postinstall.
4. **Audit corporate proxy code paths** — MSAL Node v5 forces a custom `INetworkModule` if you talk through a proxy. If no current proxy code exists, this is a no-op; if it does, write the migration in this phase.

### Phase 1: Cluster-Side Setup

**This is the major divergence from v5.** Most setup happens in the cluster repo, not the Electron app.

**Cluster work (in `talos-ai-cluster` repo) — in dependency order:**

1. **Confirm Envoy Gateway version is v1.7.1** (already verified in `cluster-crossref.md` — no upgrade needed). Document the constraint "HTTPRoute-scoped policies only until v1.8.0 fixes #8649".

2. **Create Entra app registration(s)** per §2.2. Add the new SOPS variables (`litellm_envoy_oidc_client_id`, `litellm_envoy_oidc_client_secret`, optionally `litellm_envoy_native_client_id`) — DO NOT reuse `litellm_entra_*` names which are owned by LiteLLM's existing Entra SSO.

   > **Operational companion:** [`entra-app-registration-1code-api.md`](./entra-app-registration-1code-api.md) is the click-by-click walkthrough of the v2.1 single-app-two-platforms design, validated against `deploy/kubernetes/envoy-auth-policy/app/securitypolicy.yaml` and `src/main/lib/enterprise-auth.ts`. Use it alongside §2.2 when actually executing the Entra portal work.

3. **Configure Entra Token configuration → Optional claims**: add `email`, `preferred_username`, `tid`, `oid`, `azp` for both ID tokens and access tokens.

4. **Add the secret to `cluster.yaml`** following the cluster's existing makejinja workflow (NOT the bespoke `sops --encrypt --age=$AGE_RECIPIENT` command from v1, which is foreign to this repo). Reference `templates/config/kubernetes/apps/ai/litellm/app/secret.sops.yaml.j2:59-65` for the existing pattern. Then `task render` to regenerate the SOPS-encrypted output. Cluster cross-ref §6 for exact steps.

   **4.5. SMOKE TEST `forwardAccessToken` + `passThroughAuthHeader` interaction.** ✅ **COMPLETED 2026-04-08 — OUTCOME A (FULL PASS).** See `envoy-claims-validation.md` "Smoke Test Results" section for verbatim output. Empirically confirmed:
   - Garbage Bearer → HTTP 401 (confirms `jwt.optional: true` tolerates missing JWTs only, rejects invalid ones)
   - No auth header → HTTP 302 to Entra authorize (with PKCE S256 and HMAC-signed state — both enabled by default in Envoy Gateway v1.7.1)
   - Real Entra Bearer → HTTP 200 with original CLI Bearer passed through **character-for-character unchanged** to upstream, AND `x-user-oid`/`x-user-tid`/`x-user-azp` headers populated from JWT claims
   - **The architecture's identity propagation model works as designed.**

   **Smoke test runbook (for reference when running against a new cluster or reproducing):** See `.scratchpad/../enterprise/envoy-smoke-test.md` for the full copy-paste-safe procedure including Entra app setup, Flux/GitOps deployment, test commands, and teardown.

   **Reproducibility notes captured during the 2026-04-08 run:**
   - The test app's Entra manifest MUST have `requestedAccessTokenVersion: 2` — new app registrations default to `null` (v1), which issues `aud = api://<client>` tokens that fail v2 audience validation. This is a new Phase 1 hard requirement — see §2.2 update.
   - The SecurityPolicy's `jwt.optional: true` field is load-bearing. If omitted, browser requests with no Bearer get "Jwt issuer is not configured" instead of the 302 redirect. Verify the deployed policy has this field set: `kubectl get sp <name> -n <ns> -o jsonpath='{.spec.jwt.optional}'` → `true`.
   - Envoy Gateway v1.7.1 enables PKCE by default on the OIDC flow (confirmed empirically — redirect includes `code_challenge_method=S256` without `pkceEnabled: true` being explicitly set). The `pkceEnabled: true` line in §3 is no longer load-bearing for v1.7.1+; keep it for defensive clarity.
   - State parameter is a JSON-encoded `{url, csrf_token, flow_id}` object that's HMAC-signed — mitigates concurrent OIDC tab race (§4.10) natively.

5. **Add the SecurityPolicy CRD** (§3 above) to `templates/config/kubernetes/apps/ai/litellm/app/securitypolicy.yaml.j2`. Wrap in a `#% if litellm_envoy_oidc_enabled %#` Jinja2 block following the cluster's `hubble_ui_oidc_enabled` pattern at `kube-system/cilium/app/securitypolicy.yaml.j2:1`.

6. **Add the CiliumNetworkPolicy lock-down (§3.1 Control 1)** as a new resource in `templates/config/kubernetes/apps/ai/litellm/app/ciliumnetworkpolicy.yaml.j2`.

7. **Update the HTTPRoute (§3.1 Control 2)** to add the `RequestHeaderModifier` filter stripping inbound `x-user-*` headers.

8. **Update the LiteLLM configmap** (§2.3) to add the new `user_header_mappings` entries.

9. **Add Flux Kustomization `dependsOn`** so SOPS secret reconciles BEFORE SecurityPolicy, and SecurityPolicy reconciles BEFORE the LiteLLM HelmRelease pod restart. Without explicit dependsOn, Flux can race the resources and fail intermittently.

10. **Force LiteLLM pod rollout** via `kubectl rollout restart deployment/litellm -n ai` after configmap change reconciles, OR add a checksum annotation to the deployment template that includes the configmap content. Without this, `user_header_mappings` change is in etcd but not loaded into the running pod → audit silently broken until the next deploy.

11. **Verify Flux reconciliation:** `flux get kustomizations -A` and `kubectl describe securitypolicy litellm-dual-auth -n ai` (look for `Accepted: True`).

12. **Browser auth smoke test:** Open `https://llms.<domain>` — should redirect to Entra → callback → LiteLLM admin loads.

13. **Enumerate blast radius and exempt readiness probes.** The new SecurityPolicy attaches to the LiteLLM HTTPRoute, which is also called by:
- LiteLLM's own readiness/liveliness probes (they call `/health/liveliness` from kubelet — not via gateway, so unaffected unless the route forces gateway-only)
- Open WebUI (internal cluster traffic — bypasses Envoy if it uses ClusterIP; check `open-webui` HTTPRoute)
- Langfuse (if it calls LiteLLM for cost tracking)
- n8n / GitHub Actions / cron jobs that POST to LiteLLM directly
- Any backup/migration scripts

   For each consumer, decide: (a) it goes through the gateway and gets enterprise auth, (b) it has a separate exempted HTTPRoute, or (c) it uses the ClusterIP directly and is whitelisted in the §3.1 CiliumNetworkPolicy. Document the decision per consumer.

**App work (in `ai-coding-cli` repo):**

1. **Build `enterprise-auth.ts`** per §5.3.1 Step A — new file, NOT yet wired in. Includes MSAL Node `PublicClientApplication` config with `clientCapabilities: ["CP1"]` and the loopback redirect setup. Unit tests via `bun:test`.

2. **Build `enterprise-store.ts`** — wraps `@azure/msal-node-extensions` for cross-platform persistence. Unit tests for the Linux fallback hierarchy (see §7.1.1).

3. **Install MSAL Node v5:**
   ```bash
   bun add @azure/msal-node@^5.x @azure/msal-node-extensions@<verified-version> jose@^5.x
   ```
   Update `package.json` postinstall to add `@azure/msal-node-extensions` to the `electron-rebuild` target list (alongside `better-sqlite3` and `node-pty`).

4. **Wire the Strangler Fig adapter** (§5.3.1 Step B). Adds the feature flag branch to `auth-manager.ts` constructor. All 20 call sites stay unchanged — they still call `getAuthManager()` and get a delegating instance.

5. **Migrate `getCurrentUser()` consumers** (§5.3.1 Step C) to read `user.oid` instead of `user.id`. Use a `Legacy21stUser | EnterpriseUser` type union to make the migration safe.

6. **Modify existing `buildClaudeEnv()` in `src/main/lib/claude/env.ts`** to call `applyEnterpriseAuth()` per §5.4. Update the 5 call sites to handle the new `tokenFile` cleanup.

7. **Implement claims challenge handler** middleware for CAE — note this is for the LiteLLM→Graph downstream hop only, NOT the Electron→LiteLLM edge (CAE doesn't apply at the edge — see §7.4).

8. **Test CLI auth end-to-end:**
   - Spawn `claude-code` with `applyEnterpriseAuth()` providing the token via 0600 file
   - Verify Envoy Gateway accepts the Bearer (passThroughAuthHeader skips OIDC)
   - Verify JWT validation succeeds
   - Verify LiteLLM receives `x-user-oid` header with the correct OID
   - Verify the 0600 tmpfile is unlinked after spawn
   - Verify NO token appears in any log line (regression guard)

### Phase 2: LiteLLM Settings UI

1. **Settings UI** for LiteLLM proxy URL (`https://llms.<domain>`) — add to existing Settings dialog
2. **Connection test** procedure:
   - `GET /health/liveliness` (no auth) — verifies network reachability
   - `GET /health` with Bearer — verifies enterprise auth pipeline end-to-end
   - On failure, surface the specific failure mode (network, JWT validation, header mapping) to help users self-diagnose
3. **Env injection** for spawned CLIs — wired in Phase 1 step 6, surfaced in UI here
4. **Disaster recovery: graceful failure mode** — see §6.2 Disaster Recovery (replaces v1's "offline fallback to direct API keys" which was a silent security regression)
5. **Migration wizard** for users currently signed in with 21st.dev — guided flow that:
   - Detects an existing 21st.dev token
   - Walks the user through Entra sign-in
   - Verifies LiteLLM connection
   - Removes the 21st.dev credential
   - Logs a migration audit event

### Phase 3: Slack Integration via LiteLLM MCP (Multi-Step)

> **v1 mistake corrected:** v1 said "Add `slack_mcp` to LiteLLM config" as if it were a one-line change. Cluster cross-ref confirmed: NO Slack MCP exists in the cluster today. This is a multi-step deployment.

**Cluster work:**

1. **Register a Slack OAuth app** for the workspace. Note the client ID and secret.
2. **Add `slack_mcp` to `templates/config/kubernetes/apps/ai/litellm/app/configmap.yaml.j2`** under `mcp_servers:`:
   ```yaml
   mcp_servers:
     slack_mcp:
       url: "https://mcp.slack.com/mcp"
       transport: "http"
       auth_type: "bearer_token"  # NOT "oauth" — match the foundry_mcp pattern
       extra_headers: ["Authorization"]  # Forward CLI bearer for OBO
       description: "Slack workspace search and messaging"
   ```
3. **Add Slack OAuth client secret to `cluster.yaml`** + `secret.sops.yaml.j2`.
4. **Add a Cilium FQDN egress rule** allowing LiteLLM pods to reach `mcp.slack.com` (currently NOT in the allow list — `cluster-crossref.md` confirmed). Edit `templates/config/kubernetes/apps/ai/litellm/app/ciliumnetworkpolicy.yaml.j2` egress section.
5. **Reconcile + verify** with `kubectl logs litellm-* -n ai | grep slack_mcp`.

**App work:** No app changes needed — Slack MCP is automatically discovered via LiteLLM's MCP gateway. Per-user identity propagated via `x-user-oid` header.

### Phase 4: Microsoft 365 via Existing `foundry_mcp` MCP

> **v1 mistake corrected:** v1 referred to `microsoft_foundry_mcp`. The actual configmap name is **`foundry_mcp`** (`configmap.yaml.j2:1254`), and it uses `auth_type: "bearer_token"` + `extra_headers: ["Authorization"]` for **on-behalf-of (OBO) token forwarding** — NOT Envoy-injected identity headers. The strategy must integrate with this existing pattern.

1. **The existing `foundry_mcp` already covers** Microsoft Graph tools via OBO. No new MCP server needed.
2. **Verify OBO works with Entra-issued tokens.** When 1Code sends a Bearer issued for `api://litellm/.default`, LiteLLM's OBO flow exchanges it for a Graph-scoped token. Verify in a dev tenant.
3. **CAE handling lives in LiteLLM Python middleware** (not Envoy and not the Electron app for this hop). When Graph returns `401 WWW-Authenticate: Bearer claims="..."`, LiteLLM must catch the challenge, perform OBO with the challenge claims, and retry. This is the actual application of `clientCapabilities: ["cp1"]` — see §7.4.
4. **Optional: Direct Graph API via a new tRPC router** — only build this if Foundry MCP coverage is insufficient for a specific feature. Document the decision.
5. **Permission prompts** for write scopes (`Mail.Send`, `Chat.ReadWrite`, etc.) per v5 S-H4 — these go in the Settings UI, not the Strangler-Fig auth code.

### 6.2 Disaster Recovery

**v1's "offline fallback to direct API keys" was unsafe** — bypassing Envoy bypasses enterprise audit/budget controls and creates a silent security regression. v2 replaces this with a structured DR plan:

| Failure | Detection | User-facing behavior | Operator response |
|---------|-----------|---------------------|-------------------|
| **DR-1: Cluster unreachable (network partition)** | `https://llms.<domain>` connection refused / DNS NXDOMAIN | UI banner: "Enterprise services unreachable. Sign-in / new chats disabled. Existing chat history is local and unaffected." | Verify cluster connectivity; the app does NOT silently fall back to direct API |
| **DR-2: Entra outage (Azure AD down)** | MSAL `acquireTokenSilent` fails with `endpoint_not_available` | UI banner: "Microsoft sign-in unavailable. Cached tokens valid until <expiry>." Existing tokens continue to work until expiry. | Wait for Azure AD recovery |
| **DR-3: LiteLLM down (gateway up, backend down)** | `https://llms.<domain>/health` returns 503 | UI banner: "AI services unavailable. Will retry in 30s." | Investigate LiteLLM pod; auto-retry from app |
| **DR-4: SOPS age key compromise** | Operator notification | None (operator action only) | Re-encrypt all SOPS secrets with new age key; force Flux reconcile; rotate the OIDC client secret as belt-and-braces |
| **DR-5: Auto-update regression breaks auth** | Failure rate spike in app telemetry | None — server-side kill switch | Set `LITELLM_PROXY_ENABLED=false` server-side feature flag (read at app startup); affected users fall back to non-enterprise mode until they update |

**Key principle:** The app NEVER silently falls back to a less-secure mode. All fallbacks are visible to the user and audit-logged.

---

## 7. Security Considerations

All security requirements from `../enterprise/auth-fallback.md` v5 Section 7 apply, with these Envoy-specific additions/modifications:

### 7.1 Token Storage

Inherited from v5 Section 7.1:
- Remove plaintext fallback in `AuthStore`
- Encrypt MCP OAuth tokens in `~/.claude.json`
- Add integrity protection to SQLite credential storage
- `keytar` deprecated, use `keyring-node` if `safeStorage` insufficient

### 7.1.1 Linux Key Store Fallback Hierarchy

`@azure/msal-node-extensions` uses platform-native secure stores: DPAPI on Windows, Keychain on macOS, libsecret on Linux. Linux is fragile because libsecret may be missing on headless servers, minimal containers, NixOS without `services.gnome.gnome-keyring.enable = true`, etc. Define the fallback hierarchy explicitly:

1. **Tier 1 (preferred):** libsecret via D-Bus + GNOME Keyring/KWallet — actual encryption with OS user authentication
2. **Tier 2 (degraded):** Electron `safeStorage` with the basic Linux backend — **document explicitly that this is obfuscation, not encryption** (uses a hardcoded password — sometimes called "v10"/"v11" — known not to be real encryption)
3. **Tier 3 (refuse):** Hard refusal with operator-friendly error if both unavailable. Better to fail loudly than to silently store tokens in plaintext.

A startup check MUST log the chosen tier so operators can audit. The setting should be visible in the Settings UI under "About → Security."

### 7.2 OAuth Flow Security

**Reduced scope from v5:**
- Per-provider state isolation (S-H2) — **NOT NEEDED** (only one OAuth flow: Entra via MSAL)
- Concurrent OAuth contention — **NOT NEEDED** (MSAL handles its own loopback)
- Custom URI scheme dispatcher — **MOSTLY NOT NEEDED** (only legacy `21st.dev` deep links remain, will be deleted; the `claude-code.ts:178-220` upstream sandbox redirect dependency MUST be resolved in Phase 0 — see hard gate #8)

**Still required:**
- PKCE with S256 challenge (MSAL handles automatically for the desktop flow; **must be explicitly enabled** for Envoy's browser flow via `oidc.pkceEnabled: true` — see §3 SecurityPolicy YAML)
- `iss` validation (MSAL handles for Entra; Envoy validates against the configured issuer URL)
- `aud` validation — **see §C1 fix:** v2 tokens carry `aud = client_id GUID`, NOT `api://litellm`
- Token endpoint origin validation (MSAL handles)
- `azp` (authorized party) claim validation — Envoy `jwt_authn` does NOT do this natively, so it must be enforced in LiteLLM middleware against an allowlist of approved client IDs (see H13 / §3 `claimToHeaders` `x-user-azp`)

### 7.3 Envoy Gateway Security

- **Envoy Gateway version pin:** **>= v1.7.1** (cluster currently on v1.7.1; do NOT downgrade). Constraint: HTTPRoute-scoped policies only until v1.8.0 fixes #8649.
- **OIDC client secret rotation:** See §7.3.1 for procedure.
- **JWT `audiences` validation:** ONLY the web API client ID GUID(s) — see §C1 fix.
- **Cookie attributes:** `httpOnly: true`, `secure: true`, **`sameSite: Strict`** (NOT `Lax` as v1 said), **`domain: llms.<domain>`** (pinned to single host).
- **Stat prefix monitoring:** Envoy Gateway v1.7.1+ stat prefix `http.<listener>.securitypolicy/<ns>/<name>.oauth_*` — wired to PrometheusRule alerts (see §7.6 observability plan).
- **CiliumNetworkPolicy lock-down:** §3.1 Control 1 — load-bearing for the trust boundary.

### 7.3.1 OIDC Client Secret Rotation Procedure

Envoy Gateway does **NOT** support hot-reloading client secrets — a rotation requires SecurityPolicy reconcile, which restarts the OIDC handler and **invalidates every active session cookie**. Plan accordingly:

1. **Cadence:** Quarterly (90 days max) — match Entra's Conditional Access policy and the cluster's secret-rotation cadence.
2. **Out-of-band rotation procedure:**
   - Provision new client secret in Entra portal
   - Wait ~5 minutes for Entra propagation
   - Update `cluster.yaml` with the new secret value
   - `task render` to regenerate SOPS-encrypted secret
   - `git commit` + Flux reconcile
   - Verify new SecurityPolicy generation with `kubectl describe`
   - Revoke old client secret in Entra portal
3. **Forced re-auth side effect:** Schedule rotations OUTSIDE business hours (Saturday morning) to minimize user impact.
4. **Runbook alert:** When secret age > 80 days, page the operator. Track via Prometheus rule on the SOPS file mtime or the Entra app's `keyCredentials[0].endDateTime`.

### 7.4 Enterprise Compliance

- **Continuous Access Evaluation (CAE):** **NOT effective at the Electron→LiteLLM edge.** CAE is only supported for Microsoft first-party resources (Graph, Exchange, SharePoint, Teams) per [Microsoft CAE scenarios](https://learn.microsoft.com/entra/identity/conditional-access/concept-continuous-access-evaluation#scenarios). The custom `api://litellm` resource cannot emit CAE claim challenges. Setting `clientCapabilities: ["cp1"]` on the MSAL client is harmless and **only matters downstream** when LiteLLM calls Microsoft Graph (Phase 4). The "CAE protocol" the strategy cross-references must run **inside LiteLLM's Python middleware** for Graph calls — Envoy can't intercept `insufficient_claims` responses (§4.3 already admits this).
- **Effective revocation latency for the Electron→LiteLLM path:** `access_token.exp` (default 60 min) + JWKS cache freshness (5 min per §3) ≈ **65 min worst case** before a deactivated user is locked out. To shorten this further, set Entra Token Lifetime Policy to 30 min for the web API app.
- **Audit logging for auth events** — see §7.7 for schema. Must be in app + LiteLLM, NOT relying on Envoy access logs.
- **Conditional Access compatibility:** Entra tenant CA policies are enforced via the OIDC flow (browser path) and via MSAL Node interactive sign-in (CLI path). Both are honored.
- **WAM broker support for AAL2/AAL3** if required by Conditional Access — MSAL Node v5 uses `fromPlatformBroker` (renamed from `fromNativeBroker`).

### 7.5 Defense in Depth

- **Envoy is the first line of defense** but NOT the only one — see §3.1 for the CiliumNetworkPolicy lock-down + HTTPRoute header strip
- LiteLLM should still enforce per-user budgets and rate limits, **keyed on `x-user-oid`** (NOT `x-user-email`)
- Application code should NOT trust headers blindly — LiteLLM middleware should validate `x-user-azp` against an allowlist
- Use Trusted Types API in renderer for additional XSS hardening
- Add CSP `connect-src 'self'` to prevent XSS-based cookie exfiltration via cross-origin `fetch({credentials: 'include'})`

### 7.6 Effective Revocation Latency (NEW v2)

| Path | Worst-case latency | Mitigation |
|------|-------------------|------------|
| Electron → LiteLLM (CLI bearer) | `token.exp + JWKS_TTL` ≈ 65 min | Entra Token Lifetime Policy → 30 min; `cacheDuration: 300s` on JWKS (set in §3) |
| Browser → LiteLLM admin (OIDC cookie) | `cookie.sessionLifetime` (8 h) — or shorter if access token expires | `refreshToken: true` so Envoy auto-refreshes on each request |
| LiteLLM → Microsoft Graph | Real-time via CAE | LiteLLM Python middleware honors `WWW-Authenticate: Bearer claims="..."` (Phase 4) |
| MSAL Node cache | `extendedLifetimeEnabled: false` enforces no stale tokens | Set explicitly in MSAL config |

**Document this in the user-facing security model.** For high-security deployments where ~1 hour revocation latency is unacceptable, add an "Emergency revocation" runbook: revoke at Entra → force pod restart on Envoy Gateway → user is denied next request.

### 7.7 Audit Log Requirements (NEW v2)

The strategy must enforce structured audit logging — Section 7.4 mentions it but never specifies what. STRIDE-R (Repudiation) is otherwise undefended.

**Events to log:**
- `auth.signin.success` — user signed in via interactive MSAL flow
- `auth.signin.failure` — sign-in failed (with sanitized error code, NOT token contents)
- `auth.token.refresh` — silent refresh succeeded
- `auth.token.refresh.failure` — silent refresh failed (will trigger interactive re-auth)
- `auth.cae.challenge` — CAE claim challenge received from Graph (Phase 4)
- `auth.cli.spawn` — CLI subprocess spawned with enterprise auth
- `auth.signout` — user signed out

**Schema (structured JSON):**
```json
{
  "event": "auth.signin.success",
  "ts": "2026-04-08T12:34:56.789Z",
  "oid": "11111111-1111-1111-1111-111111111111",
  "tid": "22222222-2222-2222-2222-222222222222",
  "azp": "33333333-3333-3333-3333-333333333333",
  "request_id": "abcdef-12345",
  "source_ip": "from X-Forwarded-For",
  "user_agent": "1Code/0.0.73 macOS",
  "decision": "allow",
  "redacted_token_hash": "sha256:..."  // for correlation, never the token itself
}
```

**Retention:** ≥ 90 days for SOC 2.
**Storage:** Separate from app logs (Loki + immutable bucket). Log shipper from Electron must NOT include token contents.
**Verification:** A `bun:test` regression guard must assert that no audit log line contains a substring matching the JWT regex `eyJ[A-Za-z0-9_-]+\.`.

### 7.8 STRIDE Threat Model (NEW v2)

| STRIDE | Threat | Control | Status |
|--------|--------|---------|--------|
| **S**poofing | Co-tenant pod forges `x-user-oid` to LiteLLM | §3.1 CiliumNetworkPolicy + RequestHeaderModifier | Mitigated |
| **S**poofing | Token replay across tenant apps via shared `aud` | `azp` claim validation in LiteLLM middleware (§7.5) | Mitigated |
| **T**ampering | Network MITM strips/replaces Authorization header | TLS 1.2+ + HSTS at gateway | Mitigated |
| **T**ampering | Inbound `x-user-*` header injection | §3.1 Control 2 (HTTPRoute filter) | Mitigated |
| **R**epudiation | Audit gap — user denies an action | §7.7 audit log schema with `oid` + `request_id` | Mitigated |
| **I**nformation disclosure | Token leak via process env (`ps eww`) | §4.9 stdin/file handoff | Mitigated |
| **I**nformation disclosure | Token leak via debug logs | Phase 0 hard gates 5+6 (remove all 4 token preview logs) | Mitigated |
| **I**nformation disclosure | Cookie theft via XSS in LiteLLM admin UI | `httpOnly + Strict + Domain` cookie + CSP `connect-src 'self'` | Partial — depends on LiteLLM CSP enforceability |
| **D**enial of service | JWKS endpoint blip causes mass 401s | `cacheDuration: 300s` + alerting | Partial — see §7.6 |
| **E**levation of privilege | Dead `auth:get-token` IPC handler exposes Entra token via XSS | Phase 0 hard gates 1-4 (delete handler + regression test) | Mitigated |
| **E**levation of privilege | Confused deputy via shared `audiences` list | §7.5 `azp` allowlist | Mitigated |
| **E**levation of privilege | Compromised dev box reads tokens from MSAL Node cache | OS-level keystore (DPAPI/Keychain/libsecret) | Partial — Linux fallback hierarchy in §7.1.1 |

---

## 8. Cross-Repo Coordination

The Envoy Gateway architecture has a **deeper coupling between the desktop app and the cluster repo** than the v5 strategy. Both repos must deploy in coordination.

> **v1's `denyRedirect: true` rollback was schema-invalid.** Envoy Gateway's `denyRedirect` is a struct (`{headers: [{name, stringMatch}]}`), NOT a boolean. `kubectl apply` would reject the rollback itself. v2 replaces the entire rollback approach with a JWT-only-first deployment pattern.

### Deployment Order (v2 — Two-Step Pattern)

| Order | Repo | Action | Rollback |
|-------|------|--------|----------|
| 1a | `talos-ai-cluster` | Deploy SecurityPolicy with **`jwt:` block ONLY** (no `oidc:`) — enforces Bearer tokens, returns 401 to browser requests. Safe because no users are using the admin UI yet. Also deploy §3.1 CiliumNetworkPolicy + HTTPRoute filter at the same time. | `kubectl delete securitypolicy litellm-dual-auth -n ai && kubectl delete ciliumnetworkpolicy litellm-restrict-port-4000 -n ai && git revert <httproute-edit>` |
| 1b | `talos-ai-cluster` | Update LiteLLM configmap with `user_header_mappings` for `x-user-oid` + `x-user-email`. Force pod restart. | Revert configmap, force pod restart |
| 1c | `talos-ai-cluster` | Patch the SecurityPolicy to add the `oidc:` block — enables browser flow. | `kubectl patch securitypolicy litellm-dual-auth -n ai --type=json -p='[{"op":"remove","path":"/spec/oidc"}]'` (returns to JWT-only state) |
| 2 | `ai-coding-cli` | Ship Electron app with MSAL Node + `applyEnterpriseAuth()` and feature flags OFF by default | App ships safely; flag stays OFF |
| 3 | `ai-coding-cli` | **Per-tenant rollout:** flip `ENTERPRISE_AUTH_ENABLED=true` for one user, validate, then expand | `setFeatureFlag('ENTERPRISE_AUTH_ENABLED', false)` |
| 4 | `ai-coding-cli` | Flip `LITELLM_PROXY_ENABLED=true` for the same canary user, validate end-to-end | `setFeatureFlag('LITELLM_PROXY_ENABLED', false)` (falls back to direct API path) |
| 5 | `ai-coding-cli` | Migration wizard for existing users | Roll back app version (auto-update) |
| 6 | `ai-coding-cli` | Phase D Strangler Fig: delete legacy 21st.dev branch from `auth-manager.ts` after 2+ weeks of stable rollout | `git revert` of the deletion PR |

### 8.1 Cross-Repo Compatibility Matrix

| Cluster state | App state | Behavior | Required action |
|---------------|-----------|----------|-----------------|
| Pre-Phase 1 (no SecurityPolicy) | Any | App uses direct API, no enterprise auth | Normal — no Phase 1 yet |
| Phase 1a/b (JWT-only, no OIDC) | App without enterprise auth | App can't use LiteLLM via Envoy (no Bearer to send) — must use direct API path or admin UI | Wait for Phase 1c before flipping app feature flag |
| Phase 1c (JWT + OIDC) | App without enterprise auth | App still uses direct API; admin UI works via browser OIDC | Flip app feature flag when ready |
| Phase 1c (JWT + OIDC) | App WITH enterprise auth (flag ON) | Full dual-auth, both flows work | Steady state |
| **Cluster ahead** of app | App lacks enterprise auth code yet | LiteLLM admin UI works via browser; CLI via app falls back to direct API | OK — no breakage |
| **App ahead** of cluster | Cluster missing SecurityPolicy | App with feature flag ON gets connection failures to LiteLLM | Either keep app feature flag OFF OR roll cluster forward first |
| Cluster v1.7.x + app on Electron 39 | OK | Steady state | OK |
| Cluster v1.7.x + app on Electron 41 + MSAL v5 | OK | Steady state | OK |

**Steady-state version constraints:**
- Cluster: Envoy Gateway >= v1.7.1 (HTTPRoute-scoped policies only)
- App: Electron >= 41.x, MSAL Node >= v5.x, app version >= the one shipping `applyEnterpriseAuth()`
- Cluster repo `cluster.yaml` MUST have `litellm_envoy_oidc_enabled: true` (Jinja2 flag, follows existing `hubble_ui_oidc_enabled` pattern)

### Feature Flags Required

**In Electron app** (built in Phase 0 hard gate #12, see §5.7):
- `LITELLM_PROXY_ENABLED` — toggles Envoy/LiteLLM routing vs direct API
- `ENTERPRISE_AUTH_ENABLED` — toggles MSAL Node vs legacy 21st.dev auth (Strangler Fig)

**In cluster** (Jinja2 makejinja flag, follows `hubble_ui_oidc_enabled` pattern):
- `litellm_envoy_oidc_enabled` — guards the entire SecurityPolicy CRD render

### Release Train Document

Create `docs/release-train.md` listing:
- Phase 1 cluster prerequisites (with verification commands)
- Phase 1 app version (which Electron build supports the new flow)
- Cross-repo compatibility matrix (above)
- Rollback procedures per phase
- Smoke test commands (the §6 Phase 1 Step 4.5 forwardAccessToken curl tests)
- Acceptance criteria checklist for steady-state cutover

---

## 9. Decision Matrix: Choose This Architecture or v5?

> **v2 honesty pass:** v1's matrix had two dishonest cells. The version-pin question was a precondition not a tradeoff (resolved — cluster is on v1.7.1). The "operational complexity — already deployed" cell hid that only single-auth OIDC is proven, not dual-auth. This pass also adds the missing question "what if the cluster is unavailable?" which is the single most important question for a local-first desktop app.

| Question | Choose Envoy Gateway | Choose v5 MSAL-in-Electron |
|----------|----------------------|----------------------------|
| LiteLLM running OSS edition with >5 users? | Yes — bypasses SSO limit | If Enterprise license, either works |
| Want centralized identity for multiple internal apps? | Yes — gateway pattern scales | No — 1Code-only, either works |
| Existing dual-auth (OIDC+JWT) experience in this cluster? | **NO** — single-auth OIDC is proven via Hubble UI; this would be the cluster's first dual-auth deployment | Not applicable |
| Need first-class Slack/Microsoft Graph features in app UI? | Less mature — relies on MCP discovery and on-behalf-of forwarding | More mature — direct API integration |
| Have bandwidth to coordinate deployments across two repos? | Yes — release train doc + 8.1 compatibility matrix | No — v5 is simpler from app side only |
| Want to minimize new files in the Electron app? | Yes — ~4 new files vs ~12 | Trade-off: more Electron code, less cluster work |
| Need per-user budgets and rate limiting? | Yes — both work via LiteLLM | Yes — both work via LiteLLM |
| **What if the cluster is unavailable?** (NEW v2) | App is degraded — sign-in disabled, cached tokens valid until expiry; no silent fallback to direct API (see §6.2 DR-1) | App is fully functional via direct API path until enterprise mode is needed |
| Bus factor / cross-repo blast radius | Higher — single mistake in either repo can break auth | Lower — Electron-side change is reviewable in one PR |
| Auth-related code that ships in the desktop binary | ~4 files (smaller attack surface in the app) | ~12 files (more code to audit, but isolated) |
| Cluster team and app team are the same person? (CLAUDE.md says yes for this repo) | Lowers the cross-repo coordination cost — same human owns both | Either works |
| Effective revocation latency | ~65 min worst case (token TTL + JWKS cache) — see §7.6 | Same; CAE doesn't help on the Electron→LiteLLM hop in either |
| Smoke test required before Phase 1? | YES — `forwardAccessToken` + `passThroughAuthHeader` interaction is undocumented (§6 Phase 1 Step 4.5) | No |

### Recommendation (Updated v2)

**Use this architecture (Envoy Gateway dual-auth) IF:**
- The same person owns both the cluster and the app (true for this repo per CLAUDE.md — bus factor concern is moot)
- You want the same auth pattern to serve future internal apps (not just 1Code)
- You accept that the cluster becomes part of the desktop app's critical path
- You're willing to run the §6 Phase 1 Step 4.5 smoke test before Phase 1
- The smaller Electron-side surface area is worth the larger cluster-side surface area

**Use v5 strategy (MSAL-in-Electron) IF:**
- You want maximum flexibility for the Electron app to evolve independently
- You need the desktop app to function even when the cluster is unreachable
- You need richer Microsoft Graph / Slack integration than MCP-via-OBO provides
- You want to avoid being the first user of dual-auth `passThroughAuthHeader + jwt.optional` in production for this cluster

**Either way:** All Phase 0 cleanup work (the 15 hard gates in §6), the Electron 41 upgrade, the MSAL Node v5 upgrade, the test framework introduction, and the CI/CD foundation are required. Those don't depend on which architecture you choose. The Phase 0 hard gates also fix the inherited dead `auth:get-token` IPC handler and the `claude-code.ts:178-220` upstream sandbox dependency that BOTH strategies inherit.

---

## 10. References

### Envoy Gateway

- [Envoy Gateway OIDC Authentication task](https://gateway.envoyproxy.io/docs/tasks/security/oidc/)
- [Envoy Gateway JWT Authentication task](https://gateway.envoyproxy.io/docs/tasks/security/jwt-authentication/)
- [SecurityPolicy extension types](https://gateway.envoyproxy.io/docs/api/extension_types/) (formerly `/latest/api/extension_types/`)
- [Envoy Gateway v1.7.0 release notes](https://gateway.envoyproxy.io/news/releases/notes/v1.7.0/) — released 2026-02-05
- **[Envoy Gateway v1.7.1 release tag](https://github.com/envoyproxy/gateway/releases/tag/v1.7.1) — released 2026-03-12; THIS is the version pin per §2.1**
- [Envoy Gateway Discussion #2425 — Combining OIDC and JWT](https://github.com/envoyproxy/gateway/discussions/2425) — maintainer `arkodg` endorses `passThroughAuthHeader` + `jwt.optional` combo on 2025-08-11
- [Envoy issue #30053 — Refresh token cookie expiry bug](https://github.com/envoyproxy/envoy/issues/30053) — **CLOSED 2024-03-20, fix included in Envoy ≥1.31** (historical, see §4.1)
- [Envoy Gateway issue #7315 — OIDC cookie size redirect loop](https://github.com/envoyproxy/gateway/issues/7315) — OPEN
- [Envoy Gateway issue #8649 — Gateway + route policy conflict](https://github.com/envoyproxy/gateway/issues/8649) — OPEN, targeted to v1.8.0-rc.1 due 2026-04-22
- Envoy Gateway source-of-truth Go types: [`api/v1alpha1/oidc_types.go`](https://github.com/envoyproxy/gateway/blob/main/api/v1alpha1/oidc_types.go) and [`api/v1alpha1/jwt_types.go`](https://github.com/envoyproxy/gateway/blob/main/api/v1alpha1/jwt_types.go)

### Microsoft Entra ID

- [Microsoft Entra App Registration tutorial](https://learn.microsoft.com/entra/identity-platform/quickstart-register-app)
- **[Microsoft Entra access token claims reference](https://learn.microsoft.com/entra/identity-platform/access-token-claims-reference) — authoritative for `aud`, `oid`, `tid`, `azp`, `preferred_username` semantics**
- **[Microsoft Entra claims validation guidance](https://learn.microsoft.com/entra/identity-platform/claims-validation) — explicit warning against using `preferred_username` for authorization, and the v2.0 `aud = client_id GUID` rule (load-bearing for §C1)**
- [Continuous Access Evaluation scenarios](https://learn.microsoft.com/entra/identity/conditional-access/concept-continuous-access-evaluation#scenarios) — confirms CAE is first-party only, not custom APIs
- [Claims challenges and client capabilities](https://learn.microsoft.com/entra/identity-platform/claims-challenge)
- [MSAL Node Electron tutorial](https://learn.microsoft.com/entra/identity-platform/tutorial-v2-nodejs-desktop)
- [MSAL Node v5 migration guide](https://learn.microsoft.com/entra/msal/javascript/node/v5-migration) — required reading before bumping pin
- [Configure group claims and app roles](https://learn.microsoft.com/security/zero-trust/develop/configure-tokens-group-claims-app-roles#group-overages) — `groupMembershipClaims` manifest setting

### Existing Cluster Reference (verified during review)

- `/Users/jason/dev/ai-k8s/talos-ai-cluster/templates/config/kubernetes/apps/kube-system/cilium/app/securitypolicy.yaml.j2` — single-auth OIDC pattern (Hubble UI). Proves the OIDC half. **NOT a dual-auth example.**
- `/Users/jason/dev/ai-k8s/talos-ai-cluster/templates/config/kubernetes/apps/ai/litellm/app/configmap.yaml.j2` — LiteLLM configuration with `user_header_mappings` mechanism at line 1185. Existing entries: `X-OpenWebUI-User-Id`, `X-OpenWebUI-User-Email`. New entries `x-user-oid`, `x-user-email` must be ADDED in Phase 1, not assumed-present.
- `/Users/jason/dev/ai-k8s/talos-ai-cluster/templates/config/kubernetes/apps/ai/litellm/app/secret.sops.yaml.j2:59-65` — existing Entra SSO secret consuming `litellm_entra_*` variable names. **Do not reuse these for Envoy OIDC.**
- `/Users/jason/dev/ai-k8s/talos-ai-cluster/docs/guides/litellm-entra-sso-setup.mdx` — existing LiteLLM-direct Entra SSO guide
- `/Users/jason/dev/ai-k8s/talos-ai-cluster/docs/guides/hubble-ui-entra-setup.mdx` — Hubble UI Entra setup pattern
- ~~`/Users/jason/dev/ai-k8s/talos-ai-cluster/docs/guides/entra-id-setup.mdx`~~ — **WRONG REFERENCE in v1.** This file documents Kubernetes API server OIDC via kubelogin, NOT app-level Entra. Removed in v2.

### Review Artifacts

- `/Users/jason/dev/ai-stack/ai-coding-cli/.full-review/envoy-gateway-review/05-final-report.md` — comprehensive review final report (46 findings)
- `/Users/jason/dev/ai-stack/ai-coding-cli/.full-review/envoy-gateway-review/cluster-crossref.md` — cluster repo state grounding
- `/Users/jason/dev/ai-stack/ai-coding-cli/.full-review/envoy-gateway-review/codebase-crossref.md` — ai-coding-cli codebase grounding
- `/Users/jason/dev/ai-stack/ai-coding-cli/.full-review/envoy-gateway-review/entra-claims-validation.md` — Entra docs audit (R-E1, R-E2 critical)
- `/Users/jason/dev/ai-stack/ai-coding-cli/.full-review/envoy-gateway-review/envoy-claims-validation.md` — Envoy Gateway docs + source audit
- `/Users/jason/dev/ai-stack/ai-coding-cli/.full-review/envoy-gateway-review/01-architecture.md` — structural integrity review
- `/Users/jason/dev/ai-stack/ai-coding-cli/.full-review/envoy-gateway-review/02-security.md` — OWASP + threat-model review
- `/Users/jason/dev/ai-stack/ai-coding-cli/.full-review/envoy-gateway-review/03-operations-testing.md` — ops reality check

### Companion Document

- `.scratchpad/../enterprise/auth-fallback.md` (v5) — MSAL-in-Electron alternative architecture
- `.scratchpad/../enterprise/upstream-features.md` — catalog of upstream-dependent features (F1-F10)

---

## Appendix A: Comparison to v5 Strategy

### What's Identical

- Phase 0 foundation work (cleanup, CI, tests) — but with corrected counts (4 token logs not 2; 15 hard gates not 8)
- Phase 0.5 Electron 41 upgrade
- MSAL Node integration with `clientCapabilities: ["cp1"]` — but pinned to v5.x (NOT v3.8 as v1 said)
- CAE protocol (heartbeat + lifetime cap + sessionId resume) — but **only effective on the LiteLLM→Graph downstream hop**, NOT the Electron→LiteLLM edge (corrected in §7.4)
- Linux `safeStorage` layered strategy — explicit fallback hierarchy in §7.1.1
- Drizzle hybrid schema
- Strangler Fig migration of `auth-manager.ts` — now with explicit per-method migration table in §5.3.1
- All security requirements in Section 7 (now with §7.6 revocation latency and §7.7 audit + §7.8 STRIDE)

### What's Removed (vs v5)

- Per-provider OAuth state isolation (S-H2 — `flow-registry.ts`)
- Custom URI scheme dispatcher refactor for Slack
- Slack PKCE OAuth flow in Electron
- Microsoft Graph direct API integration in Electron (delivered via existing `foundry_mcp` instead)
- 4 tRPC routers: `slack.ts`, `microsoft.ts`, `slack-auth.ts`, `microsoft-auth.ts`
- LiteLLM virtual key management (Envoy provides identity headers via JWT claims)

### What's Added (cluster + app)

- Envoy Gateway SecurityPolicy CRD (cluster-side, §3)
- CiliumNetworkPolicy lock-down for LiteLLM port 4000 (cluster-side, §3.1 Control 1) — **CRITICAL — without this, every §7 claim collapses**
- HTTPRoute `RequestHeaderModifier` filter stripping inbound `x-user-*` headers (cluster-side, §3.1 Control 2)
- 1-2 Entra ID app registrations (web + optional native) — single-app-two-platforms is also valid (§2.2)
- Cluster-side LiteLLM configmap updates with NEW `x-user-oid` mapping (§2.3)
- Cluster-side LiteLLM pod restart trigger (§2.3 — configmap change does NOT auto-restart)
- Cross-repo deployment coordination (§8 + §8.1 compatibility matrix)
- Release train documentation (`docs/release-train.md`)
- Cluster prerequisite verification (Envoy Gateway >= v1.7.1, NOT v1.7.0; HTTPRoute-only constraint)
- New SOPS variable names distinct from existing LiteLLM SSO (`litellm_envoy_oidc_*`)
- Feature flag infrastructure (§5.7) — does not exist in the codebase today
- Phase 1 Step 4.5 `forwardAccessToken` smoke test (§6) — REQUIRED, see `envoy-claims-validation.md`
- Disaster recovery plan (§6.2) — replaces v1's unsafe "offline fallback to direct API"
- Audit log schema (§7.7) — replaces v1's vague "audit logging" mention
- STRIDE threat model (§7.8) — replaces v1's checklist-not-a-model

### Net Effect (v2 — Honest Counts)

| Metric | v5 Strategy | This Architecture (v2) | Notes |
|--------|------------|------------------------|-------|
| New files in Electron app | ~12 | ~4 | `enterprise-auth.ts`, `enterprise-store.ts`, `litellm-client.ts`, 2 routers, `feature-flags.ts` |
| Modified files in Electron app | ~5 | ~5-7 | `auth-manager.ts`, `auth-store.ts`, `claude/env.ts`, `claude.ts`, `claude-code.ts`, `db/schema/index.ts`, `package.json` |
| New tRPC routers | 5 | 2 | `enterprise-auth.ts`, `litellm.ts` |
| OAuth providers actively running in Electron | 4 (Entra, Slack, MCP, future) | 2 (Entra primary, MCP-OAuth legacy for non-LiteLLM MCP) | |
| New cluster-side YAML files | ~1 | ~3 | `securitypolicy.yaml.j2`, `ciliumnetworkpolicy.yaml.j2` (new resource), `httproute.yaml.j2` edit |
| New SOPS variables | ~3 | ~3 | `litellm_envoy_oidc_client_id`, `_secret`, `litellm_envoy_native_client_id` |
| Cross-repo coupling | Low | High | v2 makes this explicit in §8.1 |
| Maturity of Microsoft Graph integration | High (direct API) | Medium (via existing `foundry_mcp` OBO) | |
| Maturity of Slack integration | High (PKCE + MCP) | Low → Medium (multi-step Phase 3 — see §6 Phase 3) | |
| LiteLLM OSS SSO 5-user limit | Bypassed | Bypassed | |
| Effective revocation latency | ~65 min | ~65 min | Same — CAE doesn't apply at the edge in either |

> **v1 marketing claim retired:** v1 said "~3000 → ~800 lines of new code." That number had no methodology and counted nothing the reviewer could verify. v2 replaces it with the file/router counts above. The honest TL;DR remains "fewer new files in Electron, more cluster-side work, complexity shifted not eliminated."

---

## 11. Revision History

### v2 (2026-04-08) — Comprehensive Review Pass

This revision applies findings from the comprehensive review at `.full-review/envoy-gateway-review/`. The review surfaced **46 findings (7 Critical, 18 High, 17 Medium, 4 Low)**. v2 applies all 24 edits from the action plan in the final report.

**Critical (P0) corrections — would have failed production on first deploy:**

1. **§3 — `aud` claim audience** — v1 listed `api://litellm` in `jwt.audiences`. Microsoft v2 access tokens always carry `aud = <client_id GUID>`, never the Application ID URI. Source: [Microsoft claims-validation docs](https://learn.microsoft.com/entra/identity-platform/claims-validation#validate-the-audience). Without this fix, every CLI request would fail JWT validation. Confirmed by `entra-claims-validation.md` R-E1.
2. **§3 + §2.3 — `preferred_username` as authorization key** — v1 keyed LiteLLM budgets on the `preferred_username` claim. Microsoft explicitly documents this as "never use for authorization decisions." v2 re-keys to `oid` (immutable per-tenant GUID) with `preferred_username` retained for display only. Confirmed by `entra-claims-validation.md` R-E2.
3. **§3.1 (NEW) — Cluster header forgery defense** — v1 made Envoy the source of identity but did not lock down LiteLLM ingress at the network level. Any pod in the `ai` namespace could `curl -H 'x-user-oid: ceo@corp.com' http://litellm:4000/...` bypassing Envoy entirely. v2 adds CiliumNetworkPolicy + HTTPRoute `RequestHeaderModifier` filter as load-bearing controls. Confirmed by `02-security.md` C-2.
4. **§8 — `denyRedirect: true` rollback was schema-invalid** — v1 used `denyRedirect` as a boolean toggle. It is actually `OIDCDenyRedirect{ Headers []OIDCDenyRedirectHeader }`. v2 replaces the entire rollback with a JWT-only-first deployment pattern (deploy `jwt:` block alone, then patch in `oidc:`). Confirmed by `envoy-claims-validation.md` Correction A.
5. **§6 Phase 0 hard gate #1-4 — `auth:get-token` IPC handler** — v1 listed deletion as a Phase 0 task. v2 promotes it to a hard gate that blocks all enterprise auth work. With enterprise tokens flowing, the dead handler would become an XSS-to-Entra-session pivot. Confirmed by `02-security.md` C-1.
6. **§4.9 (NEW) + §5.4 — `ANTHROPIC_AUTH_TOKEN` env var exposure** — v1 injected the bearer as a process env variable, exposing it via `/proc/<pid>/environ` (Linux), `ps eww` (macOS), `NtQueryInformationProcess` (Windows). v2 switches to stdin/file handoff. Confirmed by `02-security.md` C-3.
7. **§6 Phase 1 Step 4.5 (NEW) — `forwardAccessToken` smoke test** — v1 assumed the interaction between `passThroughAuthHeader: true` and `forwardAccessToken: true` works as intended, but this combined behavior is not explicitly documented anywhere. Code reading suggests it works, but v2 adds a mandatory 30-minute smoke test before Phase 1 ships. Confirmed by `envoy-claims-validation.md` "Unverified" section.

**High (P1) corrections:**

1. **§1 + executive summary — "already proven via Hubble UI" softened** — v1's repeated claim is misleading. The cluster's Hubble UI policy is single-auth OIDC; this would be the **first dual-auth deployment** in this cluster. Cluster cross-ref confirmed via repo-wide grep returning zero `passThroughAuthHeader|forwardAccessToken|jwt:|claimToHeaders` matches.
2. **§2.2 — SOPS variable names** — v1 used `litellm-oidc-secret` which would silently break LiteLLM's existing Entra SSO at `secret.sops.yaml.j2:59-65`. v2 introduces `litellm_envoy_oidc_*` distinct names. Confirmed by `cluster-crossref.md`.
3. **§6 Phase 4 — `microsoft_foundry_mcp` → `foundry_mcp`** — v1 had the wrong MCP server name and the wrong auth model (claimed "via Envoy headers"; reality is `auth_type: bearer_token` + `extra_headers` for OBO). v2 corrects both. Confirmed by `cluster-crossref.md`.
4. **§5.4 — `buildClaudeEnv()` collision** — v1 proposed a "new" function with this name. The function already exists in `src/main/lib/claude/env.ts` (~277 lines, 5 call sites, load-bearing `STRIPPED_ENV_KEYS` logic). v2 rewrites §5.4 as in-place modification. Confirmed by `codebase-crossref.md` and `01-architecture.md` H2.
5. **§8.1 (NEW) — Cross-repo compatibility matrix** — v1 had no playbook for "cluster ahead of app" or vice versa. v2 adds the matrix.
6. **§6 Phase 0 hard gate #5 — Token preview log count** — v1 inherited "remove token preview logs (count 2)" from v5. Direct grep of `claude.ts` reveals 4 leak sites (lines 203, 247, 1540, 1634). The lines 203 and 247 reveal 30 chars (`slice(0,20) + ... + slice(-10)`) which is more than enough fingerprint. v2 corrects the count and adds explicit line numbers.
7. **§6 Phase 0 hard gate #8 — `claude-code.ts:178-220` upstream sandbox dependency** — v1 didn't mention this. It's a P0 hidden upstream dependency that breaks both this strategy and the v5 strategy when `21st.dev` retires. v2 makes it a Phase 0 hard gate with three resolution options.
8. **§5.3.1 (NEW) — Strangler Fig per-method migration table** — v1 said `auth-manager.ts` "becomes an adapter" in one paragraph. v2 lists every public method, the current behavior, the enterprise replacement, and the migration step. Confirmed by `01-architecture.md` H1.
9. **§6 Phase 0.5 — MSAL Node version pin** — v1 pinned `^3.8.0`. Current is v5.x with breaking changes (Node 20+, `proxyUrl` removed, `protocolMode` moved, `fromNativeBroker` renamed). v2 bumps to `^5.x` and coordinates with Electron 41 upgrade. Confirmed by `entra-claims-validation.md` R-E4.
10. **§7.4 + §7.6 — CAE clarification** — v1 implied CAE protects the Electron→LiteLLM edge. CAE only applies to Microsoft first-party resources (Graph, Exchange, etc.), NOT custom `api://litellm`. v2 documents the actual ~65min revocation latency at the edge. Confirmed by `entra-claims-validation.md` R-E3.
11. **§7.3.1 (NEW) — OIDC client secret rotation procedure** — v1 mentioned rotation but didn't define it. v2 adds quarterly cadence, out-of-band procedure, and forced re-auth side effect.
12. **§3 cookie attributes** — v1 used `sameSite: Lax` and unspecified domain. v2 sets `sameSite: Strict` and `domain: llms.<domain>` (pinned to single host).
13. **§7.5 + §3 — `azp` claim validation** — v1 didn't mention `azp`. v2 adds it to `claimToHeaders` and requires LiteLLM middleware to validate against an allowlist (defense against confused deputy across tenant apps).
14. **§6 Phase 1 — Flux reconcile ordering + LiteLLM pod restart** — v1 said "Flux reconciles automatically." v2 adds explicit `dependsOn` requirements and the `kubectl rollout restart` step (configmap changes do not auto-restart pods).
15. **§6 Phase 1 — SOPS workflow correction** — v1 used a bespoke `sops --encrypt --age=$AGE_RECIPIENT` command foreign to this cluster. The actual cluster workflow is `cluster.yaml` + `task render` + `.sops.yaml` regex. v2 corrects this. Confirmed by `cluster-crossref.md`.
16. **§6 Phase 1 — Blast radius enumeration** — v1 didn't list the consumers affected by attaching SecurityPolicy to the LiteLLM HTTPRoute (Open WebUI, Langfuse, n8n, readiness probes, etc.). v2 requires per-consumer decisions.
17. **§6 Phase 3 — Slack MCP multi-step deployment** — v1 said "add `slack_mcp` to LiteLLM config" as if it were one line. Cluster cross-ref confirmed: NO Slack MCP exists today, the FQDN egress allow list doesn't include `mcp.slack.com`, and a Slack OAuth app needs to be registered. v2 makes Phase 3 a 5-step task.

**Medium (P2) corrections also applied:**
- §7.1.1 explicit Linux key store fallback hierarchy
- §5.6 documented coexistence of legacy MCP OAuth + new enterprise auth
- §3 PKCE explicitly enabled
- §4.10 concurrent OIDC tab race documented
- §7.6 effective revocation latency table
- §7.7 audit log schema
- §7.8 STRIDE threat model
- §6.2 disaster recovery plan
- §1.5 trust model with three boundaries (TB-1, TB-2, TB-3)
- §6 Phase 1 step 11 enumerated readiness probe / consumer impact
- Appendix A "3000 → 800 lines" claim retired in favor of file/router counts
- §10 references corrected (`entra-id-setup.mdx` was wrong; replaced with `litellm-entra-sso-setup.mdx` and `hubble-ui-entra-setup.mdx`)
- §10 added `cluster-crossref.md` and other review artifacts

**What this revision did NOT change:**
- The core architectural premise (`passThroughAuthHeader + jwt.optional`) — verified correct via Envoy Gateway Go source and maintainer endorsement
- The choice of MSAL Node + Envoy Gateway combination
- The Strangler Fig pattern for `auth-manager.ts`
- The decision to deliver Slack/Microsoft features via LiteLLM MCP gateway
- The dual-app-registration recommendation (softened from "required" to "recommended for ops")

### v2.1 (2026-04-08) — Smoke Test Empirical Validation

Inline addendum after running the `forwardAccessToken` smoke test against the live Talos AI cluster. Changes:

- **§6 Phase 1 Step 4.5** — Marked smoke test as COMPLETED with OUTCOME A (FULL PASS). The `passThroughAuthHeader` + `forwardAccessToken` interaction is now empirically validated: CLI Bearer passes through character-for-character unchanged to the upstream, `claimToHeaders` populates `x-user-oid`/`x-user-tid`/`x-user-azp` from JWT claims, and browser requests without auth fall through to the Entra OIDC redirect correctly. §C7 "Unverified" flag in `envoy-claims-validation.md` is resolved.

- **§2.2 — `requestedAccessTokenVersion: 2` is now a HARD REQUIREMENT**, not a "confirm the default". Empirically discovered: new Entra app registrations default to `null` (v1), which silently issues v1.0 tokens even from the `/oauth2/v2.0/token` endpoint (because token format is resource-scoped, not endpoint-scoped — see [Microsoft Learn: access tokens token formats](https://learn.microsoft.com/entra/identity-platform/access-tokens#token-formats)). Without this manifest edit, the strategy fails 100% of CLI requests on first deploy. The v2 doc's §2.2 note about "(default for new v2.0 endpoint apps)" was wrong and is now corrected.

- **§2.2 optional claims list corrected** — `oid`, `tid`, `azp` are NOT in the Entra "Add optional claim" dialog because they are **default v2.0 access token claims** per [Microsoft's Access Token Claims Reference](https://learn.microsoft.com/entra/identity-platform/access-token-claims-reference#payload-claims). Only `email` needs to be explicitly added (requires Microsoft Graph email permission, which Entra adds automatically when the checkbox is selected in the dialog). The v2 doc listed `oid/tid/azp` as optional claims to add — they cannot be added and don't need to be.

- **§3 SecurityPolicy `pkceEnabled: true`** — Still recommended for defensive clarity, but Envoy Gateway v1.7.1 empirically enables PKCE S256 by default on the OIDC flow without requiring explicit configuration. Documented as a bonus finding in `envoy-claims-validation.md`.

- **§4.10 Concurrent OIDC tab race** — Empirically observed that Envoy Gateway v1.7.1 uses a JSON-encoded state parameter wrapping `{url, csrf_token, flow_id}` that is HMAC-signed. This mitigates the concern natively; the gotcha in §4.10 is less severe than originally written. Downgraded from Medium concern to "defensive note".

- **Smoke test deployment pattern** — Resources were deployed via Flux/GitOps in the cluster repo (templatized Jinja2 + `cluster.yaml` + SOPS), not direct `kubectl apply`. Clean rollback via `git revert` is proven to work.

### v2 (2026-04-08) — Comprehensive Review Pass

### v1 (2026-04-08) — Initial Draft

Initial draft. Created in response to the v5 review's recommendation to evaluate an alternative architecture (gateway-edge auth) that bypasses LiteLLM's OSS SSO 5-user limit. Reviewed and superseded by v2 within hours.

---

**End of Document v2**
