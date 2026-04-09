---
title: Envoy Gateway Dual-Auth Smoke Test
icon: flask-conical
---

> **Reproducible runbook.** Empirically validated 2026-04-08 against the
> Talos AI cluster (Outcome A — full pass). Promoted from
> `.scratchpad/forwardaccesstoken-smoke-test.md`.

# `forwardAccessToken` + `passThroughAuthHeader` Smoke Test Runbook

**Document:** `.scratchpad/forwardaccesstoken-smoke-test.md`
**Created:** 2026-04-08
**Purpose:** Empirically validate the linchpin assumption of `../enterprise/auth-strategy.md` v2 (§6 Phase 1 Step 4.5) BEFORE committing to Phase 1 implementation
**Time budget:** ~60 minutes (45 minimum if everything works first try)
**Cluster context (verified live):** Talos AI cluster, Envoy Gateway v1.7.1, echo server at `https://echo.aarons.com`, Entra tenant `f505346f-75cf-458b-baeb-10708d41967d`
**Reference implementation:** `kube-system/hubble-ui-oidc` SecurityPolicy (proven OIDC config in this exact cluster)

---

## What This Test Answers

The Envoy Gateway dual-auth pattern uses two flags simultaneously:
- `oidc.passThroughAuthHeader: true` — "skip OIDC when a Bearer header is present"
- `oidc.forwardAccessToken: true` — "forward the OIDC session access token to upstream"

**The unanswered question:** When a CLI request arrives with `Authorization: Bearer <cli-token>`, does `forwardAccessToken: true` overwrite the inbound token with Envoy's own session token? Or does `passThroughAuthHeader: true` cause the OIDC filter to be skipped entirely (so `forwardAccessToken` has nothing to forward)?

**Why it matters:** If Envoy overwrites the CLI Bearer, LiteLLM sees a different identity than the user intended, breaking per-user budgets and audit attribution. Code reading from Envoy Gateway Go source strongly suggests the strategy's assumption is correct (the OIDC filter is skipped, original Bearer passes through), but **no upstream documentation explicitly confirms this for the combined config**. Discussion #2425 doesn't discuss it. We need empirical proof before Phase 1.

---

## Pre-flight Verification (Already Confirmed Live)

The reviewer ran these checks against the live cluster on 2026-04-08 — you do NOT need to re-run them, but they're listed here so you can spot-check if anything has drifted.

| Check | Expected | Verified |
|-------|----------|----------|
| Envoy Gateway version | `>= v1.7.1` | ✓ `mirror.gcr.io/envoyproxy/gateway:v1.7.1` |
| Echo pod running | `Running` in `default` ns | ✓ `echo-6bdd978d88-2nl97` Running 9d |
| Echo HTTPRoute accepted | `Accepted: True`, `ResolvedRefs: True` | ✓ |
| Gateway `envoy-external` programmed | `Programmed: True` | ✓ at 172.31.9.81 |
| `https://echo.aarons.com/` reachable | HTTP 200 | ✓ 184ms |
| Echo response shape | top-level `headers` object with lowercase keys | ✓ |
| Echo echoes Authorization header | Bearer token round-trips unchanged | ✓ |
| `securitypolicies` (sp) CRD installed | `gateway.envoyproxy.io/v1alpha1` | ✓ |
| Reference SecurityPolicy exists | `kube-system/hubble-ui-oidc` Accepted | ✓ |
| Existing OIDC secret format | `Opaque` Secret with `client-secret` key | ✓ |

If anything above has changed before you run the test, stop and re-verify before proceeding.

---

## Working Directory & Shell Notes

**Always start in the cluster repo directory** so `kubectl` picks up the correct kubeconfig (mise/direnv exports `KUBECONFIG=./kubeconfig` when you `cd` into this directory):

```bash
cd ~/dev/ai-k8s/talos-ai-cluster
```

**All curl commands use single quotes around URLs** to prevent shell expansion mishaps. **All values are hardcoded** — there are no shell variables to forget to export.

**Paste one command at a time.** Do not paste multi-line blocks except where explicitly noted as a heredoc.

---

## Stage 1 — Final Pre-flight (~2 min)

Run these three sanity checks. They MUST all pass before proceeding.

### 1.1 Echo server reachable, no Authorization header by default

```bash
curl -s 'https://echo.aarons.com/' | jq '.headers.authorization // "no-auth-header"'
```

**Expected output:**
```
"no-auth-header"
```

If you get any other output (HTTP error, "could not resolve host", JSON parse error), STOP. Diagnose DNS / cluster connectivity before proceeding.

### 1.2 Echo server echoes a test Bearer header unchanged

```bash
curl -s -H 'Authorization: Bearer SANITY_CHECK_123' 'https://echo.aarons.com/' | jq '.headers.authorization'
```

**Expected output:**
```
"Bearer SANITY_CHECK_123"
```

If the echoed value differs from what you sent, something between you and the upstream is rewriting headers. STOP and investigate before this distorts the smoke test results.

### 1.3 Confirm there is no existing SecurityPolicy on the echo HTTPRoute

```bash
kubectl get securitypolicies -n default
```

**Expected output:**
```
No resources found in default namespace.
```

If you see an existing `echo-*` SecurityPolicy, delete it first (`kubectl delete sp <name> -n default`) so the test starts from a clean baseline.

---

## Stage 2 — Create Throwaway Entra App Registration (~15 min)

**This is a manual step in the Microsoft Entra portal.** All other stages are automated.

### 2.1 Open the Entra portal

Navigate to: https://entra.microsoft.com → Identity → Applications → App registrations → **+ New registration**

> **Important:** Use a **dev/test tenant** if you have one. If `aarons.com` is your only tenant (it appears to be — same tenant that hosts your existing Hubble UI OIDC), the test app registration will live alongside production apps until you delete it in Stage 7. That's not unsafe — the test app has no permissions outside its own scope — but tag the registration with a `DELETE-ME-` prefix so you don't forget cleanup.

### 2.2 Fill out the registration form

| Field | Value |
|-------|-------|
| **Name** | `DELETE-ME-1code-envoy-smoke-test` |
| **Supported account types** | Accounts in this organizational directory only (Single tenant) |
| **Redirect URI — platform** | Web |
| **Redirect URI — value** | `https://echo.aarons.com/oauth2/callback` |

Click **Register**.

### 2.3 Copy three values from the Overview page

After creation, copy these three values to a scratch file (you'll paste them into Stage 3 / Stage 4 commands):

| Field | Where | Save as |
|-------|-------|---------|
| **Application (client) ID** | Top of Overview page | `<TEST_CLIENT_ID>` (a GUID) | 
| **Directory (tenant) ID** | Top of Overview page | should equal `f505346f-75cf-458b-baeb-10708d41967d` (your tenant) |
| **Client secret** | Created in step 2.4 below | `<TEST_CLIENT_SECRET>` | 

### 2.4 Create a client secret

Sidebar → **Certificates & secrets** → **Client secrets** tab → **+ New client secret**

| Field | Value |
|-------|-------|
| Description | `smoke-test-DELETE` |
| Expires | **1 day** (we'll delete it in Stage 7 anyway) |

Click **Add**. **Immediately copy the `Value` column** (NOT `Secret ID`). You will not be able to see this again after leaving the page. Save it as `<TEST_CLIENT_SECRET>`.

### 2.5 Configure optional claims

> **IMPORTANT CORRECTION (v2 of this runbook):** The original instructions said to check `email`, `preferred_username`, `tid`, `azp`. **`tid`, `azp`, and `oid` are NOT in the Add optional claim dialog** — and **they shouldn't be**. Per Microsoft's [Access Token Claims Reference](https://learn.microsoft.com/entra/identity-platform/access-token-claims-reference#payload-claims), these three claims are **always present by default in v2.0 access tokens** and cannot be configured as optional. The "Optional claims" feature only exists for claims that AREN'T in the default set (`email`, `upn`, `family_name`, `given_name`, `ipaddr`, etc.) — see [Optional Claims Reference: v2.0-specific set](https://learn.microsoft.com/entra/identity-platform/optional-claims-reference#v20-specific-optional-claims-set).

Sidebar → **Token configuration** → **+ Add optional claim** → **Token type: Access** →
Check: `email`, `idtyp` → **Add**.

Why only these two:
- **`email`** — per Microsoft docs, `email` for managed users must either be requested via the `email` OpenID scope OR added as an optional claim. Our client_credentials token request does not include the `email` scope, so we configure it as optional here. **Note:** for client_credentials (app-only) tokens, `email` will still be absent because there's no user — but we add the optional claim anyway for consistency with the production user-flow tokens.
- **`idtyp`** — identifies app-only tokens (`"idtyp": "app"`) explicitly. Useful confirmation that our smoke test is using a client_credentials app token, not a user token.

**DO NOT look for:**
- `oid` → already default for all v2.0 access tokens (as the subject identifier)
- `tid` → already default for all v2.0 access tokens
- `azp` → already default for all v2.0 access tokens (listed in the main payload claims table as "only present in v2.0 tokens")
- `aud`, `iss`, `exp`, `iat`, `nbf`, `sub`, `ver` → all default for v2.0

These will NOT appear in the Add optional claim dialog. That is **expected and correct behavior**, not a missing feature.

**⚠️ Entra portal quirk — the "Turn on Microsoft Graph email permission" checkbox:**

When you click Add after checking `email` and `idtyp`, Entra shows a dialog warning: *"Some of these claims (email) require OpenID Connect scopes to be configured through the API permissions page or by checking the box below."* with a checkbox labeled "Turn on the Microsoft Graph email permission (required for claims to appear in token)."

**Check the box, then click the blue Add button at the TOP of the inner dialog** (not the bottom Add button, which belongs to the outer claim selection panel). This should auto-add the `Microsoft Graph / email` permission to API permissions.

**Known portal quirk:** Sometimes the checkbox doesn't actually auto-add the permission, even when checked. If after completing this step you see:
- A yellow warning triangle next to `email` in the Token configuration Optional claims table
- A banner saying "These claims (email) require OpenID Connect Scopes to be configured through the API Permissions Page. **Go to API Permissions**"
- `Microsoft Graph / email` NOT present in the API permissions page

...then you need to add it manually:

1. Click the "Go to API Permissions" link in the banner (or go to API permissions in the sidebar)
2. **+ Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Scroll or filter to find `email` (it's under the "OpenId permissions" group in some tenants, or appears directly under the search filter)
4. Check `email` — description: "View users' email address"
5. Click **Add permissions** at the bottom

You should now see `Microsoft Graph / email` in the Configured permissions list alongside `User.Read`. **Do NOT click "Grant admin consent" yet** — save that for Stage 2.7 after you've added the `test_access` permission, so a single click covers all three permissions.

> **Note for client_credentials smoke test:** The `email` claim will still be **null** in your test token because client_credentials produces app-only tokens with no user. We configure this anyway for two reasons: (1) removes the warning banner so the setup "looks right", and (2) matches the production user-flow setup so we're not testing a different config than what Phase 1 will use. The smoke test itself validates `oid`/`tid`/`azp` which are default v2.0 claims unaffected by this warning.

**Expected token claims for client_credentials flow** (for your reference when you decode in Stage 3.5):

| Claim | Source | Expected value in smoke test |
|-------|--------|------------------------------|
| `aud` | Default v2.0 | `<TEST_CLIENT_ID>` GUID (the C1 finding validation) |
| `iss` | Default v2.0 | `https://login.microsoftonline.com/f505346f-.../v2.0` |
| `oid` | Default v2.0 | **Service principal OID** GUID (NOT a user OID — this is an app-only token) |
| `tid` | Default v2.0 | `f505346f-75cf-458b-baeb-10708d41967d` |
| `azp` | Default v2.0 | `<TEST_CLIENT_ID>` GUID |
| `sub` | Default v2.0 | Same as `oid` for app-only tokens |
| `idtyp` | Optional (just added) | `"app"` — confirms app-only token |
| `preferred_username` | Default (with `profile` scope) | **Likely absent** — client_credentials doesn't request `profile` |
| `email` | Optional (just added) | **Likely absent** — no user in app-only tokens |
| `roles` | Default | **Likely absent** — you'd need to assign app roles first |

The smoke test's claim-to-header mappings (§3 of the strategy) use `oid`, `tid`, `azp` — all three of which are guaranteed default v2.0 claims — so app-only smoke tokens will work fine.

### 2.5.1 Set `requestedAccessTokenVersion: 2` in the app manifest (CRITICAL)

> **Why this is load-bearing:** Entra's token format is determined by the **resource API's manifest**, NOT the endpoint version called. New app registrations default to `requestedAccessTokenVersion: null` which issues **v1.0 tokens** even when calling `/oauth2/v2.0/token`. The strategy's SecurityPolicy `audiences` list uses GUIDs (v2.0 format), so the API must be configured for v2.0 tokens. Source: [Microsoft Learn — Access tokens: token formats](https://learn.microsoft.com/entra/identity-platform/access-tokens#token-formats) and [app manifest requestedAccessTokenVersion](https://learn.microsoft.com/entra/identity-platform/reference-microsoft-graph-app-manifest#manifest-reference).

Steps in the Entra portal:

1. Sidebar → **Manifest** (under Manage)
2. Find the `api` object → find `requestedAccessTokenVersion` inside it
3. Current value will be `null`
4. Change it to `2` (integer, not a string — no quotes)
5. Click **Save** at the top

The relevant fragment of the manifest should look like this after editing:
```json
"api": {
    "acceptMappedClaims": null,
    "knownClientApplications": [],
    "oauth2PermissionScopes": [ ... ],
    "preAuthorizedApplications": [],
    "requestedAccessTokenVersion": 2
}
```

**Propagation delay:** The change is effective within ~60 seconds. New tokens issued after that point will be v2.0. Existing cached tokens remain v1.0 until expiry. The runbook accounts for this — if you re-run Stage 3 immediately after saving the manifest and still get a v1.0 token, wait 60 seconds and try again.

**Verification at Stage 3.5:** The decoded token should show `ver: "2.0"`, `aud: "<TEST_CLIENT_ID>"` (the GUID without the `api://` prefix), `iss: "https://login.microsoftonline.com/<tenant>/v2.0"` (with the `/v2.0` suffix), and `azp: "<TEST_CLIENT_ID>"` (not null).

### 2.6 Expose an API and define a scope

Sidebar → **Expose an API** → **+ Add a scope**

When prompted for the **Application ID URI**, accept the default `api://<TEST_CLIENT_ID>` and click **Save and continue**.

Now fill out the scope form:

| Field | Value |
|-------|-------|
| Scope name | `test_access` |
| Who can consent? | Admins and users |
| Admin consent display name | `Test Access` |
| Admin consent description | `Smoke test scope, will be deleted` |
| User consent display name | `Test Access` |
| User consent description | `Smoke test` |
| State | Enabled |

Click **Add scope**.

### 2.7 Add API permission to itself + grant admin consent

Sidebar → **API permissions** → **+ Add a permission** → **My APIs** tab → click `DELETE-ME-1code-envoy-smoke-test` → **Delegated permissions** → check `test_access` → **Add permissions**.

Then click **✓ Grant admin consent for <tenant>** → confirm.

You should see two permissions in the list now:
- `Microsoft Graph / User.Read` (default, can stay)
- `DELETE-ME-1code-envoy-smoke-test / test_access` with **status = Granted for <tenant>**

### 2.8 Stage 2 done — sanity check

Verify the app registration is set up correctly:

**On the Overview page:**
- ✓ Application (client) ID copied
- ✓ Directory (tenant) ID = `f505346f-75cf-458b-baeb-10708d41967d`
- ✓ Application ID URI = `api://<TEST_CLIENT_ID>`
- ✓ Redirect URI = `https://echo.aarons.com/oauth2/callback`

**On the Manifest page (critical — this is the new Stage 2.5.1 check):**
- ✓ `"requestedAccessTokenVersion": 2` (integer, inside the `api` object)

**On the Token configuration page:**
- ✓ `email` and `idtyp` listed as optional claims for Access tokens
- ✓ NO yellow warning triangle next to `email` (means the Microsoft Graph email permission was added successfully)

**On the API permissions page:**
- ✓ `Microsoft Graph / User.Read` (default, Delegated)
- ✓ `Microsoft Graph / email` (added in Stage 2.5, Delegated)
- ✓ `DELETE-ME-1code-envoy-smoke-test / test_access` (added in Stage 2.7, Delegated)
- ✓ All three show **"Granted for <tenant>"** (green checkmark in Status column)

**On the Certificates & secrets page:**
- ✓ At least one client secret exists with description `smoke-test-DELETE` (or whatever you named it in Stage 2.4)
- ✓ The secret's **Value** is saved in your notes as `<TEST_CLIENT_SECRET>`

**On the Expose an API page:**
- ✓ Application ID URI = `api://<TEST_CLIENT_ID>`
- ✓ Scope `test_access` with state Enabled

---

## Stage 3 — Acquire a Test Access Token (~3 min)

We'll use the **client credentials flow** for simplicity. This produces an *application token*, not a *user token* — `oid` will be the service principal OID and `preferred_username` may be absent. **That's fine for this smoke test** — we're testing header forwarding behavior, not user identity. Appendix A has the device code flow if you want a real user token instead.

### 3.1 Set the three test values into your shell

Replace `<...>` with the values you copied in Stage 2.3 and 2.4:

```bash
TEST_CLIENT_ID='<your-test-app-client-id>'
TEST_CLIENT_SECRET='<your-test-app-client-secret>'
TEST_TENANT_ID='f505346f-75cf-458b-baeb-10708d41967d'
```

> **Note:** These shell variables are *only* used in Stage 3 and Stage 4. Stages 5+ use hardcoded values. The reason these stay variable: client secrets shouldn't be pasted into a runbook, and the client ID will differ for each test run.

### 3.2 Request the access token

Paste this single command (it's one line, despite the wrapping). **This command produces no visible output — that's normal.** It captures the Entra response into the `TOKEN_RESPONSE` shell variable silently:

```bash
TOKEN_RESPONSE=$(curl -s -X POST "https://login.microsoftonline.com/${TEST_TENANT_ID}/oauth2/v2.0/token" -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode "client_id=${TEST_CLIENT_ID}" --data-urlencode "client_secret=${TEST_CLIENT_SECRET}" --data-urlencode "scope=api://${TEST_CLIENT_ID}/.default" --data-urlencode 'grant_type=client_credentials')
```

**Immediately verify it worked** by checking the response shape (this DOES print output):

```bash
echo "$TOKEN_RESPONSE" | jq 'keys'
```

**Expected output (success):**
```json
[
  "access_token",
  "expires_in",
  "ext_expires_in",
  "token_type"
]
```

**Failure output (any of these and you need to diagnose):**
```json
[
  "correlation_id",
  "error",
  "error_codes",
  "error_description",
  ...
]
```

If you see the failure shape, run `echo "$TOKEN_RESPONSE" | jq .` to see the error_description and jump to the "Common errors" table at the bottom of Stage 3.4.

### 3.3 Extract the access token

**This command also produces no visible output** — it extracts the token from the JSON response into the `ACCESS_TOKEN` shell variable:

```bash
ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
```

### 3.4 Verify the token was issued

```bash
echo "$ACCESS_TOKEN" | head -c 30 ; echo '...'
```

**Expected output:**
```
eyJ0eXAiOiJKV1QiLCJub25jZSI6...
```

If you see `null` or an error message, the token request failed. Check the error response:
```bash
echo "$TOKEN_RESPONSE" | jq .
```

Common errors:
- `AADSTS7000215: Invalid client secret provided` → re-copy the secret from Entra Stage 2.4 (you may have copied the Secret ID instead of the Value)
- `AADSTS700016: Application ... not found` → wrong client ID
- `AADSTS500011: The resource principal ... was not found` → admin consent not granted in Stage 2.7

### 3.5 Decode the token's `aud` claim — empirical confirmation of v2 token format

This is the C1 finding from the review made tangible. We claim that v2 access tokens carry `aud = <client_id GUID>`, NOT the Application ID URI string.

**⚠️ macOS base64 gotcha:** JWTs use base64url encoding (URL-safe alphabet without padding). macOS's BSD `base64 -d` does NOT handle missing padding or URL-safe characters, and will silently truncate output mid-JSON causing `jq` to fail with `Unfinished JSON term at EOF`. Use the padded/translated form below:

```bash
echo "$ACCESS_TOKEN" | cut -d'.' -f2 | tr '_-' '/+' | awk '{l=length($0); printf "%s%s\n", $0, substr("====", 1, (4-l%4)%4)}' | base64 -d 2>/dev/null | jq '{aud, iss, oid, tid, azp, sub, idtyp, ver, preferred_username, email, roles}'
```

What the command does: `cut` extracts the payload segment of the JWT, `tr` translates the URL-safe alphabet back to standard base64, `awk` appends `=` padding to make the length a multiple of 4, then `base64 -d` decodes and `jq` extracts the claims we care about.

**Alternative decoders** if the shell one-liner fails for any reason:

- **Python** (handles URL-safe natively):
  ```bash
  echo "$ACCESS_TOKEN" | cut -d'.' -f2 | python3 -c "import sys, base64, json; p = sys.stdin.read().strip(); p += '=' * (4 - len(p) % 4); print(json.dumps(json.loads(base64.urlsafe_b64decode(p)), indent=2))"
  ```
- **Microsoft jwt.ms** (browser-based, client-side only, handles everything): copy token with `echo "$ACCESS_TOKEN" | pbcopy`, open https://jwt.ms, paste. Only do this for throwaway test tokens since you're pasting a secret into a browser.

**Expected output (v2.0 token — what you should see after Stage 2.5.1 manifest change):**
```json
{
  "aud": "<test-client-id>",
  "iss": "https://login.microsoftonline.com/f505346f-75cf-458b-baeb-10708d41967d/v2.0",
  "oid": "<service-principal-OID-GUID>",
  "tid": "f505346f-75cf-458b-baeb-10708d41967d",
  "azp": "<test-client-id>",
  "sub": "<same-as-oid-for-app-tokens>",
  "idtyp": "app",
  "ver": "2.0",
  "preferred_username": null,
  "email": null,
  "roles": null
}
```

**WRONG output (v1.0 token — means Stage 2.5.1 wasn't done or hasn't propagated yet):**
```json
{
  "aud": "api://<test-client-id>",    ← WRONG (has "api://" prefix)
  "iss": "https://sts.windows.net/<tenant>/",              ← WRONG (sts.windows.net, no /v2.0)
  "azp": null,                                              ← WRONG (null, azp is v2-only)
  "ver": "1.0",                                             ← WRONG (must be "2.0")
  ...
}
```

**If you see the WRONG output:**
1. Go back to Entra portal → Manifest → confirm `"requestedAccessTokenVersion": 2` is saved (integer, not string)
2. Wait 60 seconds for propagation
3. Re-run Stage 3.2 (request new token) — you MUST request a new token; the existing `$ACCESS_TOKEN` variable still holds the old v1 token
4. Re-run Stage 3.5 (decode)
5. If it's still v1.0 after waiting 2+ minutes, check the manifest one more time — sometimes the Entra portal silently fails to save the change if you navigate away before the save completes

**CRITICAL CHECK #1 — `ver` is `"2.0"`:**
- Must be exactly the string `"2.0"`. Anything else means the manifest isn't set correctly.

**CRITICAL CHECK #2 — `aud` is the GUID (not `api://...`):**
- Must be `<test-client-id>` (bare GUID)
- NOT `api://40f918eb-...` (v1 format)
- This is the empirical validation of review finding R-E1.

**CRITICAL CHECK #3 — `iss` ends in `/v2.0`:**
- Must be `https://login.microsoftonline.com/<tenant>/v2.0` (with trailing `/v2.0`)
- NOT `https://sts.windows.net/<tenant>/` (v1 issuer format — the SecurityPolicy issuer URL wouldn't match)

**CRITICAL CHECK #4 — `azp` is populated:**
- Must equal the client ID GUID
- NOT `null` (null `azp` is a v1.0 indicator)

**CRITICAL CHECK #5 — `idtyp` is `"app"`:**
- Confirms this is an application-only token (client_credentials flow).

**EXPECTED ABSENCES (do NOT worry about these):**
- `preferred_username` → **null is expected**. Per Microsoft docs, this claim requires the `profile` OpenID scope to be requested. Client_credentials doesn't include `profile`. For a user flow (Appendix A device code), it would be populated.
- `email` → **null is expected for app-only tokens**. Even though we configured it as an optional claim in Stage 2.5, there's no user email for an application token. It will populate for user tokens.
- `roles` → **null is expected** unless you assigned app roles in the Entra portal. We don't need roles for the smoke test.

**WHAT MATTERS FOR THE SMOKE TEST:** The SecurityPolicy's `claimToHeaders` section maps `oid`, `tid`, `azp` → headers. All three are default-present in v2.0 access tokens with `requestedAccessTokenVersion: 2` configured on the resource API. The smoke test validates header forwarding, not user identity presentation.

---

## Stage 4 — Deploy the Test SecurityPolicy (~5 min)

We'll attach a test SecurityPolicy to the **echo** HTTPRoute (NOT the LiteLLM HTTPRoute — we don't want to disturb production). This deployment uses direct `kubectl apply`, NOT Flux/git. Faster and self-contained.

### 4.1 Create the OIDC client secret in the cluster

```bash
kubectl create secret generic echo-smoke-oidc-secret -n default --from-literal=client-secret="${TEST_CLIENT_SECRET}"
```

**Expected output:**
```
secret/echo-smoke-oidc-secret created
```

### 4.2 Apply the SecurityPolicy

This is a multi-line heredoc — paste the entire block (from `cat <<EOF` through `EOF`) as a single shell command:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: echo-smoke-test-dual-auth
  namespace: default
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: echo
  jwt:
    optional: true
    providers:
      - name: entra-test
        issuer: https://login.microsoftonline.com/f505346f-75cf-458b-baeb-10708d41967d/v2.0
        audiences:
          - ${TEST_CLIENT_ID}
        remoteJWKS:
          uri: https://login.microsoftonline.com/f505346f-75cf-458b-baeb-10708d41967d/discovery/v2.0/keys
        claimToHeaders:
          - header: x-user-oid
            claim: oid
          - header: x-user-tid
            claim: tid
          - header: x-user-azp
            claim: azp
  oidc:
    passThroughAuthHeader: true
    provider:
      issuer: https://login.microsoftonline.com/f505346f-75cf-458b-baeb-10708d41967d/v2.0
    clientID: ${TEST_CLIENT_ID}
    clientSecret:
      name: echo-smoke-oidc-secret
    redirectURL: https://echo.aarons.com/oauth2/callback
    logoutPath: /oauth2/logout
    refreshToken: true
    scopes:
      - openid
      - email
      - profile
    forwardAccessToken: true
EOF
```

**Expected output:**
```
securitypolicy.gateway.envoyproxy.io/echo-smoke-test-dual-auth created
```

> **Note on shape:** This SecurityPolicy intentionally OMITS the `pkceEnabled`, `cookie.sameSite/domain`, and `requestHeadersToRemove` fields from the strategy v2 — those are production hardening that don't affect the test outcome. Adding them adds risk of schema drift between the test policy and the working `hubble-ui-oidc` reference. Production rollout per strategy v2 §3 will add them back.

### 4.3 Verify the SecurityPolicy was accepted by Envoy Gateway

```bash
kubectl describe sp echo-smoke-test-dual-auth -n default | grep -A 3 'Conditions:'
```

**Expected output (something like):**
```
Conditions:
  Last Transition Time:  2026-04-08T...Z
  Message:               Policy has been accepted.
  Observed Generation:   1
  Reason:                Accepted
  Status:                True
  Type:                  Accepted
```

**If you see `Status: False`** with a schema validation error: STOP. Capture the exact error message — it's evidence for the review. Common causes:
- A field name typo (e.g. `passthroughAuthHeader` vs `passThroughAuthHeader`)
- An unsupported field for v1.7.1 (some fields were added in v1.8.x)
- The audience is malformed

### 4.4 Wait ~5 seconds for Envoy to reconcile

```bash
sleep 5
```

(Envoy Gateway watches SecurityPolicy resources and reconciles within seconds. Five seconds is enough.)

---

## Stage 5 — Run the Three Critical Tests (~5 min)

### Test 1 — Garbage Bearer (validates `jwt.optional` semantics)

```bash
curl -s -o /dev/null -w 'HTTP %{http_code}\n' -H 'Authorization: Bearer DEADBEEF-not-a-real-token' 'https://echo.aarons.com/'
```

**Expected:** `HTTP 401`

Why: The strategy v2 §4.8 says `jwt.optional: true` tolerates a *missing* JWT but rejects an *invalid* one. A garbage Bearer is invalid → 401. This also confirms `passThroughAuthHeader` isn't blindly forwarding any header — it correctly hands off to the JWT filter when a Bearer is present.

**If you get HTTP 200:** Envoy is forwarding the garbage token without validation. This would be a serious finding — escalate immediately.
**If you get HTTP 302:** `jwt.optional` is being misinterpreted by Envoy — also escalate.

---

### Test 2 — No Authorization header (validates OIDC fallthrough)

```bash
curl -s -o /dev/null -w 'HTTP %{http_code}\nLocation: %{redirect_url}\n' 'https://echo.aarons.com/'
```

**Expected:** `HTTP 302` with `Location: https://login.microsoftonline.com/f505346f-75cf-458b-baeb-10708d41967d/oauth2/v2.0/authorize?...`

Why: With no Bearer header, `jwt.optional: true` allows the request to fall through to the OIDC handler, which sees no session cookie and redirects to Entra.

**If you get HTTP 401:** `jwt.optional` is misconfigured (the missing-JWT case is being rejected when it shouldn't be).
**If you get HTTP 200:** OIDC isn't enforcing — neither flag is doing its job. Escalate.

---

### Test 3 — REAL Entra access token (THE LINCHPIN TEST)

This is the question we're actually here to answer.

```bash
RESPONSE=$(curl -s -H "Authorization: Bearer ${ACCESS_TOKEN}" 'https://echo.aarons.com/')
```

```bash
echo "$RESPONSE" | jq '{
  upstream_authorization: .headers.authorization,
  upstream_x_user_oid: .headers["x-user-oid"],
  upstream_x_user_tid: .headers["x-user-tid"],
  upstream_x_user_azp: .headers["x-user-azp"],
  http_method: .method,
  path: .path
}'
```

**Three possible outcomes — read carefully and decide which one you got:**

#### ✅ Outcome A — PASS (architecture works as designed)

```json
{
  "upstream_authorization": "Bearer eyJ0eXAi...<same-as-ACCESS_TOKEN>",
  "upstream_x_user_oid": "<service-principal-guid>",
  "upstream_x_user_tid": "f505346f-75cf-458b-baeb-10708d41967d",
  "upstream_x_user_azp": "<TEST_CLIENT_ID>",
  ...
}
```

**Key check:** `upstream_authorization` is **identical** to the value of `$ACCESS_TOKEN`. To prove it:

```bash
test "$(echo "$RESPONSE" | jq -r '.headers.authorization')" = "Bearer ${ACCESS_TOKEN}" && echo "✅ PASS — Bearer pass-through verified" || echo "❌ FAIL — Bearer was rewritten"
```

If you see `✅ PASS`: the architecture's identity model works. `passThroughAuthHeader: true` skips the OIDC filter, `forwardAccessToken: true` has no effect on the CLI path, and the original CLI Bearer reaches the upstream untouched. **Strategy v2 §C7 unverified flag is resolved. Phase 1 is unblocked.**

#### 🚨 Outcome B — Bearer overwritten (architecture identity model fails)

```json
{
  "upstream_authorization": "Bearer eyJ<SOMETHING-DIFFERENT>...",
  ...
}
```

If `upstream_authorization` differs from `$ACCESS_TOKEN`, Envoy is overwriting the inbound Bearer. The `forwardAccessToken: true` flag is replacing the user's token with Envoy's own session token even on the `passThroughAuthHeader` path. **This invalidates the strategy's identity propagation design.** Phase 1 cannot proceed without one of:
- Drop `forwardAccessToken: true` and rely solely on `claimToHeaders` for identity
- Accept that CLI and browser identities flow differently and update LiteLLM middleware accordingly
- Escalate to Envoy Gateway maintainers for clarification

#### ⚠️ Outcome C — Some other unexpected behavior

If you see HTTP 401 from the curl (the response is empty, jq complains about parsing), then your real Entra token was rejected. This usually means audience mismatch:

```bash
# Re-verify the aud claim matches what's in the SecurityPolicy
echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.aud'
echo "$TEST_CLIENT_ID"
```

These two values MUST be equal. If they're not, the token was issued for a different audience than the SecurityPolicy expects.

If you see something else entirely, capture the full output and the Envoy access logs:

```bash
kubectl logs -n network -l app.kubernetes.io/name=envoy-gateway --tail=50
```

### 5.1 Document the outcome RIGHT NOW (before tearing down)

```bash
cat > /tmp/smoke-test-result.txt <<EOF
forwardAccessToken smoke test result — $(date -u +%Y-%m-%dT%H:%M:%SZ)
========================================================================

Test 1 (garbage Bearer): [paste curl output above]
Test 2 (no auth header): [paste curl output above]
Test 3 (real Entra Bearer): [paste full jq output above]

Token aud claim:        [paste output of: echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d | jq '.aud']
Test client ID:         [paste $TEST_CLIENT_ID]
Bearer pass-through:    [PASS / FAIL based on Outcome A check]

Outcome:    [A / B / C]
Verdict:    [PROCEED / RE-DESIGN / ESCALATE]
EOF
cat /tmp/smoke-test-result.txt
```

You'll copy this into the review document in Stage 8.

---

## Stage 6 — Tear Down (~3 min)

**Critical: do this immediately after Stage 5 even if results are clean.** Don't leave test resources in production.

### 6.1 Delete the test SecurityPolicy

```bash
kubectl delete sp echo-smoke-test-dual-auth -n default
```

**Expected:** `securitypolicy.gateway.envoyproxy.io "echo-smoke-test-dual-auth" deleted`

### 6.2 Delete the test secret

```bash
kubectl delete secret echo-smoke-oidc-secret -n default
```

**Expected:** `secret "echo-smoke-oidc-secret" deleted`

### 6.3 Verify echo is back to normal (no auth required)

```bash
curl -s -o /dev/null -w 'HTTP %{http_code}\n' 'https://echo.aarons.com/'
```

**Expected:** `HTTP 200`

### 6.4 Unset shell variables

```bash
unset ACCESS_TOKEN TOKEN_RESPONSE TEST_CLIENT_ID TEST_CLIENT_SECRET TEST_TENANT_ID
```

### 6.5 In the Entra portal — delete the test app registration

1. Open https://entra.microsoft.com → App registrations → All applications
2. Find `DELETE-ME-1code-envoy-smoke-test`
3. Click **Delete**
4. Confirm

> **If you cannot delete it immediately** (e.g. mid-meeting), at minimum revoke the client secret: Certificates & secrets → click the row → trash icon. The app registration without a working secret is harmless.

### 6.6 Spot-check audit log (optional, recommended)

If `aarons.com` is your production Entra tenant, browse to **Microsoft Entra → Monitoring → Sign-in logs** and confirm the only entries from `DELETE-ME-1code-envoy-smoke-test` are the token requests you generated. If you see anything unexpected, investigate.

---

## Stage 7 — Document Findings in the Review (~2 min)

Append the result to `entra-claims-validation.md` so it's permanently traceable from the review:

```bash
cat /tmp/smoke-test-result.txt >> /Users/jason/dev/ai-stack/ai-coding-cli/.full-review/envoy-gateway-review/envoy-claims-validation.md
```

Then open `.full-review/envoy-gateway-review/envoy-claims-validation.md` in your editor and:
1. Move the appended block from the bottom into the "Unverified" section, replacing the existing placeholder
2. Update the file's TL;DR with the verdict (PROCEED / RE-DESIGN / ESCALATE)

Also update the strategy doc itself:

1. Open `.scratchpad/../enterprise/auth-strategy.md`
2. Find §6 Phase 1 step 4.5 (the smoke test step)
3. Add a one-line note: `**Smoke test status: ✅ PASSED 2026-04-08** — see envoy-claims-validation.md` (or `❌ FAILED` with the details)

---

## Decision Tree — What To Do Based on the Outcome

| Outcome | `upstream_authorization` value | Action |
|---------|------------------------------|--------|
| ✅ **A — PASS** | Identical to `$ACCESS_TOKEN` (Bearer pass-through verified) | Proceed to Phase 0 hard gates. Update strategy v2 §6 Phase 1 step 4.5 with "PASSED YYYY-MM-DD". Mark `envoy-claims-validation.md` "Unverified" section as resolved. |
| 🚨 **B — Bearer overwritten** | Different from `$ACCESS_TOKEN` (Envoy rewrote it) | Architecture's identity model is wrong. Two paths forward: (1) drop `forwardAccessToken: true`, accept that the OIDC browser path will need a different identity propagation mechanism; (2) keep `forwardAccessToken: true`, accept that CLI and browser identities flow differently, update LiteLLM middleware to handle both. Either path is a strategy v3 revision. |
| ⚠️ **C — 401 on Test 3 (audience mismatch)** | N/A — request rejected | Stage 3.5 token decode and Stage 4.2 audience config got out of sync. Re-run Stage 3 with the correct client ID, or re-apply Stage 4 with the correct audience. Then re-run Stage 5 Test 3. |
| ⚠️ **C — 401 on Test 1 (expected)** | N/A | This is fine — confirms `jwt.optional` correctly rejects invalid JWTs. Continue to Test 2 and Test 3. |
| ⚠️ **C — Anything else** | Unexpected | Capture full curl output + Envoy logs (`kubectl logs -n network -l app.kubernetes.io/name=envoy-gateway --tail=50`). Escalate to the review with the evidence. |

---

## Total Time Budget

| Stage | Activity | Time |
|-------|----------|------|
| 1 | Final pre-flight | 2 min |
| 2 | Entra app registration (manual portal) | 15 min |
| 3 | Acquire test token | 3 min |
| 4 | Deploy test SecurityPolicy | 5 min |
| 5 | Run three tests | 5 min |
| 6 | Tear down | 3 min |
| 7 | Document findings | 2 min |
| **Total** | **(if everything works first try)** | **~35 min** |

Budget **60-90 minutes** including the inevitable shell-paste-mishap recovery, the "wait, did I copy the secret value or the secret ID" Entra moment, and the 5-minute think-time when interpreting the Test 3 jq output.

---

## Appendix A — User Token via Device Code Flow (Optional)

The main runbook uses client credentials flow, which produces an *application* token (no user identity). If you want a *user* token that matches the production CLI flow more closely, replace Stage 3 with this device code flow.

### A.1 Pre-step — enable public client flows on the test app

In the Entra portal (Stage 2 app):
- Sidebar → **Authentication** → scroll to **Advanced settings** → **Allow public client flows** → toggle **Yes** → **Save**

### A.2 Initiate device code flow

```bash
DEVICE_RESPONSE=$(curl -s -X POST "https://login.microsoftonline.com/${TEST_TENANT_ID}/oauth2/v2.0/devicecode" -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode "client_id=${TEST_CLIENT_ID}" --data-urlencode "scope=api://${TEST_CLIENT_ID}/.default openid offline_access")
```

### A.3 Display the user-facing prompt

```bash
echo "$DEVICE_RESPONSE" | jq -r '"Open this URL: \(.verification_uri)\nEnter code: \(.user_code)"'
```

Open the URL in a browser, enter the code, sign in with your user account, accept the consent prompt.

### A.4 Poll for the access token

```bash
DEVICE_CODE=$(echo "$DEVICE_RESPONSE" | jq -r '.device_code')
INTERVAL=$(echo "$DEVICE_RESPONSE" | jq -r '.interval')
while true; do
  sleep "$INTERVAL"
  POLL=$(curl -s -X POST "https://login.microsoftonline.com/${TEST_TENANT_ID}/oauth2/v2.0/token" -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:device_code' --data-urlencode "client_id=${TEST_CLIENT_ID}" --data-urlencode "device_code=${DEVICE_CODE}")
  if echo "$POLL" | jq -e '.access_token' > /dev/null; then
    ACCESS_TOKEN=$(echo "$POLL" | jq -r '.access_token')
    echo '✅ Got user access token'
    break
  fi
  if echo "$POLL" | jq -e '.error == "authorization_pending"' > /dev/null; then
    echo "Waiting for sign-in..."
    continue
  fi
  echo "Error: $POLL"
  break
done
```

After the loop exits successfully, `$ACCESS_TOKEN` contains a real user token. Continue to Stage 4.

The user token differs from the application token in:
- `oid` will be your user OID, not the service principal OID
- `preferred_username` will be your UPN/email (not null)
- `email` will be your email if your tenant configured the email optional claim
- `azp` will still be `<TEST_CLIENT_ID>`

This makes Test 3 results more representative of the actual production CLI flow.

---

## Appendix B — Why The Strategy Document Lists This as Step 4.5 (Not Step 1)

The strategy v2 §6 Phase 1 puts the smoke test BETWEEN cluster steps 4 (deploy SOPS secret) and 5 (deploy SecurityPolicy CRD), not before everything. The reason: in production, you want the secret deployed before the SecurityPolicy references it. But for the smoke test, we're using direct `kubectl apply` (not Flux), so the order doesn't matter — we create the secret in Stage 4.1 and the policy in Stage 4.2 of THIS runbook.

If you choose to do the smoke test through the Flux/git path (more "real" but slower) instead, follow the strategy doc's order: secret first, then SecurityPolicy. Use the `task render` workflow + `git push` instead of `kubectl apply`.

---

## Appendix C — Cleanup Verification Checklist

After Stage 6, verify NOTHING was left behind:

```bash
# In the cluster
kubectl get sp -A | grep echo-smoke
# Expected: (no output)

kubectl get secret -n default | grep oidc
# Expected: (no output, unless other unrelated oidc secrets exist)

# In Entra portal — manual check
# 1. App registrations → All applications → search "DELETE-ME-1code-envoy-smoke-test"
#    Expected: not found
# 2. Sign-in logs → filter by app → search "DELETE-ME-1code-envoy-smoke-test"
#    Expected: only your test token requests, no surprises
```

If anything is left behind, remove it before proceeding to Phase 0.

---

**End of Runbook**
