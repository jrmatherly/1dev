---
title: Entra ID App Registration for 1code-api
icon: key-round
---

# Entra ID App Registration — `1code-api` Setup Guide

This guide walks through creating and configuring the **Microsoft Entra ID app registration** required by the self-hosted `1code-api` backend and its companion pieces (Envoy Gateway, LiteLLM, Electron desktop app).

It is the **operational companion** to [`auth-strategy.md`](./auth-strategy.md) (v2.1 — Envoy Gateway dual-auth), which explains _why_ this design was chosen. This page tells you _what to click_ and _what to paste where_, validated against the checked-in code.

> **TL;DR** — One app registration. Two platform configurations (Web + Mobile/desktop). v2.0 access tokens. Three secrets to copy into `cluster-secrets`. Done.

## Why one registration (not two)

The auth strategy went through several revisions. The [**v2.1 single-app-two-platforms**](./auth-strategy.md#22-entra-app-registration-changes) design is the one actually implemented in the repo:

| Component | Role | Redirect URI | Uses client secret? |
|-----------|------|--------------|---------------------|
| **Envoy Gateway (OIDC flow)** | Browser users hitting LiteLLM admin UI | `https://<litellm-hostname>/oauth2/callback` | **Yes** (web platform) |
| **Envoy Gateway (JWT flow)** | Validates Bearer tokens from desktop app | _(no redirect — token validator)_ | No |
| **Electron desktop app (MSAL Node)** | Acquires tokens for the CLI path | `http://localhost` | **No** (public client) |
| **1code-api** | Trusts `x-user-*` headers from Envoy | _(never talks to Entra directly)_ | No |

All three flows above target the **same `client_id` GUID**, because Entra v2.0 access tokens always carry `aud = <client_id>` regardless of which platform requested them. The v1 strategy doc said "two app regs for two audiences" — [that turned out to be wrong for v2 tokens](./auth-strategy.md#47-two-app-registrations-for-two-audiences-is-wrong-for-v2-tokens).

> **The 1code-api itself never talks to Entra ID.** It is a trust-the-edge service — Envoy Gateway validates the JWT, strips claims into `x-user-oid` / `x-user-tid` / `x-user-email` / `x-user-name` headers via `claimToHeaders`, and `services/1code-api/src/auth.ts` treats those headers as authenticated identity. Defense-in-depth comes from a `CiliumNetworkPolicy` locking the pod's ingress to the Envoy Gateway pod selector only.

## Where each value lands in the repo

Before clicking anything, know where the outputs go. This is the contract the guide below satisfies:

| Value you produce | Used by | File / config key |
|-------------------|---------|-------------------|
| **Application (client) ID** (GUID) | Envoy `SecurityPolicy`, LiteLLM, Electron MSAL | `${ENTRA_CLIENT_ID}` — `deploy/kubernetes/envoy-auth-policy/app/securitypolicy.yaml`, `deploy/kubernetes/1code-api/app/helmrelease.yaml`, `src/main/lib/enterprise-auth.ts` |
| **Directory (tenant) ID** (GUID) | All three | `${ENTRA_TENANT_ID}` — same locations |
| **OIDC issuer URL** | Envoy JWT + OIDC providers | `${ENTRA_ISSUER_URL}` — must equal `https://login.microsoftonline.com/<tenant>/v2.0` |
| **Client secret** (web platform only) | Envoy OIDC flow (browser → LiteLLM) | `entra-oidc-client-secret` Secret, key `client-secret` — see `deploy/kubernetes/envoy-auth-policy/app/secret.sops.yaml` |
| **`http://localhost` redirect** | Electron MSAL Node loopback | N/A — Entra config only |
| **`https://<litellm-hostname>/oauth2/callback` redirect** | Envoy OIDC browser flow | `securitypolicy.yaml` `spec.oidc.redirectURL` |

Keep a scratchpad open — you will paste these five values into secrets after finishing the portal work.

## Prerequisites

- An **Entra ID tenant** where you have at least **Cloud Application Administrator** rights. The cluster repo's working tenant is tracked in [`cluster-facts.md`](./cluster-facts.md).
- A hostname already decided for **LiteLLM** (e.g., `llms.example.com`). This must match `${LITELLM_HOSTNAME}` in `cluster-secrets`.
- (Optional) A hostname decided for the **1code-api** (e.g., `api.example.com`). This becomes `${APP_HOSTNAME}` — it does NOT appear in the app registration itself, but you should know it for end-to-end smoke testing.

## Step 1 — Create the app registration

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com) as a **Cloud Application Administrator** (or higher).
2. Navigate to **Identity → Applications → App registrations**.
3. Select **New registration**.
4. Fill in:
   - **Name**: `1Code Enterprise (apollosai)` — or any descriptive name. This is the tenant-wide display name shown during consent.
   - **Supported account types**: **Accounts in this organizational directory only (Single tenant)**. Do NOT pick multi-tenant unless you explicitly want cross-tenant users — the Envoy JWT provider is pinned to a single issuer URL.
   - **Redirect URI (optional)**: leave blank for now — we will add two platform configs in Step 3.
5. Select **Register**.
6. On the **Overview** page, copy these values to your scratchpad:
   - **Application (client) ID** → this becomes `${ENTRA_CLIENT_ID}`
   - **Directory (tenant) ID** → this becomes `${ENTRA_TENANT_ID}`
   - The **OIDC issuer URL** is always `https://login.microsoftonline.com/<tenant-id>/v2.0` → this becomes `${ENTRA_ISSUER_URL}`

> Do NOT pick "Accounts in any organizational directory". The `SecurityPolicy` hardcodes a tenant-specific issuer URL, and wildcard issuers are [not supported by Envoy's JWT filter](./auth-strategy.md#46-envoy-jwt_authn-does-not-wildcard-issuers).

## Step 2 — Force v2.0 access tokens via the manifest

This is the single most failure-prone step. Skip it and everything breaks with obscure "signature validation" errors because Entra will issue v1.0 tokens whose `iss` claim has a totally different format (`https://sts.windows.net/<tenant>/` instead of `https://login.microsoftonline.com/<tenant>/v2.0`).

1. In the app registration, select **Manage → Manifest**.
2. Find the property `accessTokenAcceptedVersion` (Azure AD Graph manifest) **or** `requestedAccessTokenVersion` inside the `api` object (Microsoft Graph manifest format — both are valid; the portal uses one or the other depending on the tenant).
3. Change the value from `null` to `2`.
4. Select **Save**.

**Verification (mandatory before moving on):**

- After the guide is finished, acquire a test token and decode it at [https://jwt.ms](https://jwt.ms).
- Confirm:
  - `ver: "2.0"`
  - `iss: "https://login.microsoftonline.com/<tenant-id>/v2.0"` (**note the `/v2.0` suffix** — without it, v1.0 was issued)
  - `aud: "<client-id-guid>"` (**NOT** `api://...`)

The Envoy `SecurityPolicy` hardcodes `audiences: [${ENTRA_CLIENT_ID}]` — if the token has any other `aud`, you get a 401 at the gateway and nothing reaches `1code-api`.

> Reference: [Microsoft — Access tokens in the identity platform (token formats)](https://learn.microsoft.com/entra/identity-platform/access-tokens#token-formats).

## Step 3 — Add the two platform configurations

Navigate to **Manage → Authentication → Add a platform**.

### 3a. Web platform (for Envoy Gateway browser OIDC flow)

1. Select **Web**.
2. **Redirect URIs**: add `https://<litellm-hostname>/oauth2/callback`, substituting your real hostname (e.g., `https://llms.example.com/oauth2/callback`).
3. **Front-channel logout URL**: leave blank unless you plan to wire global sign-out.
4. **Implicit grant and hybrid flows**: leave **both checkboxes unchecked** — the OIDC handler uses the authorization code flow, not implicit.
5. Select **Configure**.

### 3b. Mobile and desktop applications platform (for Electron MSAL Node)

1. Back on the **Authentication** page, select **Add a platform** → **Mobile and desktop applications**.
2. Under **Custom redirect URIs**, enter exactly:

   ```
   http://localhost
   ```

   - **No port number**. MSAL Node picks an ephemeral port at runtime per [RFC 8252 §7.3 loopback redirect](https://www.rfc-editor.org/rfc/rfc8252#section-7.3); Entra ignores the port when matching loopback redirects.
   - **Do NOT** add `https://login.microsoftonline.com/common/oauth2/nativeclient` — that's an embedded-webview default for WPF/UWP. Node/Electron uses a system browser via `shell.openExternal()` and needs the loopback URI.
3. Select **Configure**.

### 3c. Enable public client flow

1. Still on the **Authentication** page, scroll down to **Advanced settings**.
2. Set **Allow public client flows** to **Yes**.
3. Select **Save**.

This flag is mandatory for MSAL Node — without it, interactive token acquisition fails with an `invalid_client` error.

> Reference: [Microsoft — Tutorial: Electron desktop app with MSAL Node](https://learn.microsoft.com/entra/identity-platform/tutorial-v2-nodejs-desktop) (canonical source for `http://localhost` redirect).

## Step 4 — Create a client secret (web platform only)

Required because Envoy Gateway's OIDC filter performs a confidential-client authorization code exchange.

1. Navigate to **Manage → Certificates & secrets → Client secrets**.
2. Select **New client secret**.
3. **Description**: `Envoy Gateway OIDC — rotate 2027-04` (or your rotation reminder).
4. **Expires**: pick the shortest period your ops policy allows. 6 or 12 months is typical.
5. Select **Add**.
6. **Copy the secret VALUE immediately** — not the Secret ID. The value is shown exactly once and is unrecoverable after you navigate away.

Paste it into your password manager or straight into the SOPS-encrypted secret file (see Step 7 below).

> The 1code-api and the Electron desktop app do **not** use this secret. It is only for Envoy Gateway's browser OIDC flow. The desktop app is a public client (PKCE + loopback, no secret).

## Step 5 — Configure API permissions and scopes

The desktop client (via MSAL Node in `src/main/lib/enterprise-auth.ts:38`) requests these scopes by default:

```
openid profile email offline_access
```

All four are **standard OIDC/OAuth2 scopes** — none are custom. You do NOT need to expose an API or add `api://...` scopes for the current Phase 1 implementation.

### 5a. Granted permissions (confirm they are pre-granted)

1. Navigate to **Manage → API permissions**.
2. You should see `User.Read` already listed (Microsoft Graph, delegated). This is auto-added for every new app registration.
3. That's sufficient. The OIDC scopes (`openid`, `profile`, `email`, `offline_access`) are always consentable without explicit API permissions — they are part of the OpenID Connect protocol.

### 5b. (Optional) Expose an API for future Phase 2 work

If you later want to issue narrower access tokens with custom scopes (`1code.read`, `1code.admin`, etc.) instead of relying purely on OIDC:

1. Navigate to **Manage → Expose an API**.
2. Select **Add** next to **Application ID URI**. Accept the default `api://<client-id>` and save.
3. Select **Add a scope**, then fill in `1code.access`, admin consent display name, etc.

You will NOT need this for Phase 1 — skip it unless you are explicitly implementing authorization beyond "is the user authenticated?".

> Reference: [Microsoft — Expose scopes in a protected web API](https://learn.microsoft.com/entra/identity-platform/scenario-protected-web-api-expose-scopes).

## Step 6 — Configure optional claims (email)

The `email` claim is **not** in v2.0 access tokens by default for managed users (only for guests). The Envoy `SecurityPolicy` extracts `email` via `claimToHeaders`:

```yaml
# deploy/kubernetes/envoy-auth-policy/app/securitypolicy.yaml
claimToHeaders:
  - header: x-user-email
    claim: email
```

…and `services/1code-api/src/auth.ts:32` reads `x-user-email` and requires it to be non-empty for a valid session. If the claim is missing, the 1code-api returns 401 for all authenticated routes.

**Configure the optional claim:**

1. Navigate to **Manage → Token configuration**.
2. Select **Add optional claim**.
3. **Token type**: **Access**.
4. Check **email**.
5. Select **Add**.
6. **Repeat** for Token type: **ID** (optional but recommended — the desktop app reads ID token claims too, per `enterprise-auth.ts:44`).
7. When prompted "Turn on the Microsoft Graph `email` permission", select **Yes**. This adds `User.Read` with email scope implicitly.

### Claims you do NOT need to add

These are default claims in v2.0 access tokens — they are NOT present in the "Add optional claim" dialog because they're always emitted:

- `oid` — Entra object ID (the identity key)
- `tid` — Tenant ID
- `azp` — Authorized party (client that got the token)
- `name` — Display name (requires the `profile` scope, which MSAL Node requests automatically)

Do not be confused by their absence in the picker. They will be in the token.

> Reference: [Microsoft — Optional claims reference](https://learn.microsoft.com/entra/identity-platform/optional-claims-reference) and [ID token claims reference](https://learn.microsoft.com/entra/identity-platform/id-token-claims-reference).

## Step 7 — Wire the values into `cluster-secrets`

The cluster deploys via Flux v2 with `postBuild.substituteFrom: cluster-secrets`. You need to add/update these keys in the Secret the cluster repo manages (see [`cluster-facts.md`](./cluster-facts.md) for how the SOPS workflow runs):

```yaml
# cluster-secrets (applied via Flux postBuild substitution)
stringData:
  ENTRA_TENANT_ID: "<paste tenant GUID from Step 1>"
  ENTRA_CLIENT_ID: "<paste client GUID from Step 1>"
  ENTRA_ISSUER_URL: "https://login.microsoftonline.com/<tenant-id>/v2.0"
  APP_HOSTNAME: "api.example.com"              # 1code-api public FQDN
  LITELLM_HOSTNAME: "llms.example.com"         # LiteLLM admin FQDN
  AUTH_POLICY_NAMESPACE: "ai"                  # namespace owning the OIDC client secret
```

And a **separate** Secret for the OIDC client secret (not substituted into manifests — referenced by name from `SecurityPolicy`):

```yaml
# deploy/kubernetes/envoy-auth-policy/app/secret.sops.yaml (template)
apiVersion: v1
kind: Secret
metadata:
  name: entra-oidc-client-secret
  namespace: ai
type: Opaque
stringData:
  client-secret: "<paste web platform client secret from Step 4>"
```

Encrypt it with SOPS before committing. The `SecurityPolicy` references it by name:

```yaml
# deploy/kubernetes/envoy-auth-policy/app/securitypolicy.yaml (excerpt)
oidc:
  clientSecret:
    name: entra-oidc-client-secret
    namespace: "${AUTH_POLICY_NAMESPACE}"
```

## Step 8 — End-to-end verification

After Flux applies the `envoy-auth-policy` Kustomization and the 1code-api HelmRelease:

### 8a. Decode a token at jwt.ms (the single most important check)

In a browser, visit `https://<litellm-hostname>/oauth2/authorize-test` or any LiteLLM admin path. You should be redirected to `login.microsoftonline.com`, sign in, and be redirected back. Inspect the `_entra_at` cookie (or use the browser devtools) to get the access token, then paste it into [https://jwt.ms](https://jwt.ms).

Confirm:

- [ ] `ver` = `"2.0"`
- [ ] `iss` = `"https://login.microsoftonline.com/<your-tenant-id>/v2.0"` (trailing `/v2.0` present)
- [ ] `aud` = `"<your-client-id-guid>"` (**not** `api://...`)
- [ ] `tid` = `"<your-tenant-id>"`
- [ ] `oid` is a GUID
- [ ] `email` is present (confirms Step 6 worked)
- [ ] `name` is present (confirms `profile` scope worked)
- [ ] `azp` is populated (not null)

If any of these fail, go back to Step 2 or Step 6 before touching anything else.

### 8b. Test the 1code-api CLI path (from the desktop app)

With the desktop app built and `enterpriseAuthEnabled` feature flag ON:

1. Launch 1Code, sign in via Entra. Check the main process log for `[claude-env] Enterprise auth token injected via ANTHROPIC_AUTH_TOKEN` (emitted by `src/main/lib/claude/env.ts:246`).
2. Trigger any API-backed feature (plan lookup, changelog feed).
3. Expected: the request reaches `https://<app-hostname>/api/desktop/user/plan` with the Bearer header, Envoy validates the JWT, injects `x-user-*` headers, and 1code-api returns `{ email, plan: "onecode_max", status: "active" }`.
4. Check 1code-api logs — you should see the request with `req.user.oid` populated. If you see `401 Unauthorized`, the gateway stripped the claims or the claims were never issued (check jwt.ms again).

### 8c. Test the browser OIDC path (for LiteLLM admin)

1. In an incognito window, visit `https://<litellm-hostname>/ui` (or wherever the admin UI lives).
2. Expected: 302 redirect to `login.microsoftonline.com`, sign in, 302 back to `/oauth2/callback`, set cookies, land on the admin UI.
3. If you get "Jwt issuer is not configured" instead of an OIDC redirect, `jwt.optional: true` was **not** set in the `SecurityPolicy` — see [`auth-strategy.md` §4.8](./auth-strategy.md#48-jwtoptional-true-does-not-soft-fail-invalid-jwts) for why this flag is load-bearing.

## Troubleshooting matrix

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| 401 at Envoy, `jwt.ms` shows `ver: "1.0"` | Step 2 skipped — manifest still has `accessTokenAcceptedVersion: null` | Set it to `2` and wait 5 minutes for propagation |
| 401 at Envoy, `aud` in token is `"api://<guid>"` | Using v1.0 token format OR requesting the wrong scope | Confirm Step 2 and ensure the desktop app requests `openid profile email offline_access` (not `api://.../.default`) |
| Envoy redirects to Entra but Entra returns `AADSTS50011` | Redirect URI mismatch | Recheck Step 3a — must be exactly `https://<litellm-hostname>/oauth2/callback`, no trailing slash, scheme must match |
| MSAL Node throws `invalid_client` | Public client flow not enabled | Step 3c — set **Allow public client flows** to **Yes** |
| `services/1code-api` returns 401 on every request despite valid Envoy flow | `claimToHeaders` didn't emit `x-user-email` because the `email` claim is missing | Step 6 — add `email` optional claim to the **access** token type |
| MSAL Node opens browser but localhost callback hangs | Corporate proxy intercepts loopback OR firewall blocks ephemeral port | Check `no_proxy` covers `localhost`, 127.0.0.1, `::1`; audit any `HTTPS_PROXY` env in the Electron main process |
| `jwt.ms` shows correct claims but Envoy still 401s | Envoy cache holding stale JWKS | JWKS `cacheDuration: 300s` in `securitypolicy.yaml` — wait 5 minutes or restart the Envoy pod to force re-fetch |

## Rotation runbook

**Client secret (web platform):**

1. In **Certificates & secrets**, select **New client secret** and copy the new value.
2. Update `entra-oidc-client-secret` SOPS file with the new value; commit and push.
3. Wait for Flux to reconcile (or trigger `flux reconcile kustomization envoy-auth-policy`).
4. Delete the old secret in Entra **only after** confirming Envoy is using the new one (check `kubectl logs` for the envoy-gateway pod — look for successful OIDC exchanges post-rotation).

**Tenant migration or client ID change:**

- Treat as a new app registration. Follow this entire guide from Step 1.
- Both secrets (`ENTRA_CLIENT_ID` in `cluster-secrets` + `entra-oidc-client-secret`) must be updated in the same Flux reconcile — inconsistent state causes a transient 401 storm.

## Server-side Graph client app registration (for LiteLLM provisioning)

The preceding sections cover the **public client** used by MSAL Node in the Electron desktop app. The `add-1code-api-litellm-provisioning` change introduces a **separate, confidential-client** app registration used exclusively by the 1code-api server to call Microsoft Graph's `/users/{oid}/memberOf` endpoint.

**Why a second app reg?** Per design Decision 1 of the OpenSpec change:

1. The existing public client has no client secret (by design — RFC 8252 loopback flow) and cannot perform the `client_credentials` OAuth flow needed for app-only Graph calls.
2. Adding `GroupMember.Read.All` as an application permission to the existing public client would pollute its scope surface and make rotation riskier.
3. Keeping the two roles in separate app registrations means rotating the Graph client secret has zero impact on the desktop app's JWT validation.

### Create the confidential client

1. In the Entra portal, **App registrations → New registration**.
2. Name: `1code-api-graph-client` (or similar).
3. Supported account types: match your existing 1code-api app reg (typically "single tenant").
4. Leave **Redirect URI** blank — this app never participates in an interactive flow.

### Grant `GroupMember.Read.All` Application permission

1. On the new app → **API permissions → Add a permission → Microsoft Graph → Application permissions**.
2. Select `GroupMember.Read.All`.
3. Click **Add permissions**.
4. **Click "Grant admin consent for &lt;tenant&gt;"** — a Global Administrator (or Application Administrator with the right scope) must click this button. Without admin consent, the `client_credentials` flow returns `AADSTS65001` at runtime.

### Create a client secret

1. **Certificates & secrets → Client secrets → New client secret**.
2. Description: `1code-api Graph client secret <YYYY-MM>`.
3. Expiry: 12 months recommended (set a calendar reminder for rotation).
4. **Copy the Value** column immediately — it cannot be retrieved later.

### Wire the secret into the cluster

The confidential client ID goes in the unencrypted HelmRelease env block (`AZURE_GRAPH_CLIENT_ID`). The client secret goes in the SOPS-encrypted secret (`deploy/kubernetes/1code-api/app/graph-secret.sops.yaml`) as `AZURE_GRAPH_CLIENT_SECRET`.

In the cluster repo (`talos-ai-cluster`), add `onecode_api_graph_client_id` and `onecode_api_graph_client_secret` to `cluster.yaml`; the Jinja template substitutes them into the HelmRelease and SOPS secret at reconcile time.

### Rotate the Graph client secret

1. Create a new client secret alongside the old one.
2. Update the SOPS secret with the new value and commit.
3. Flux reconciles; the pod rolling-restarts and picks up the new secret.
4. After verifying that `getUserGroups` calls succeed with the new secret, delete the old secret from the Entra portal.

Because the Graph client is consumed exclusively by the 1code-api pod (no browser flow, no downstream services), rotation is a single-pod concern — no user-visible disruption.

## Related

- [`auth-strategy.md`](./auth-strategy.md) — the chosen v2.1 Envoy Gateway dual-auth design, with the full threat model and trade-offs
- [`1code-api-provisioning.md`](./1code-api-provisioning.md) — the provisioning subsystem this confidential client powers
- [`auth-fallback.md`](./auth-fallback.md) — the v5 MSAL-in-Electron fallback (not currently deployed; kept as an escape hatch)
- [`cluster-facts.md`](./cluster-facts.md) — Talos cluster and tenant specifics (tenant ID, hostnames, Envoy Gateway version)
- [`envoy-smoke-test.md`](./envoy-smoke-test.md) — the dual-auth smoke test that empirically validated this design (2026-04-08)
- [`phase-0-gates.md`](./phase-0-gates.md) — where the enterprise auth work fits in the fork's Phase 0 plan
- [`../operations/cluster-access.md`](../operations/cluster-access.md) — how SOPS secrets are rotated in the Talos cluster
- Microsoft canonical references:
  - [Tutorial: Electron desktop app with MSAL Node](https://learn.microsoft.com/entra/identity-platform/tutorial-v2-nodejs-desktop)
  - [Access tokens in the Microsoft identity platform](https://learn.microsoft.com/entra/identity-platform/access-tokens)
  - [Configure and manage optional claims](https://learn.microsoft.com/entra/identity-platform/optional-claims)
  - [Claims validation for web APIs](https://learn.microsoft.com/entra/identity-platform/claims-validation)
  - [Desktop app code configuration](https://learn.microsoft.com/entra/identity-platform/scenario-desktop-app-configuration)
