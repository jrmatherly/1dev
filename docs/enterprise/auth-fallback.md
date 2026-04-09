---
title: Enterprise Auth Fallback (MSAL-in-Electron)
icon: shield-question
---

> **Fallback strategy.** This is the MSAL-in-Electron v5 fallback. The
> CHOSEN strategy is [Envoy Gateway dual-auth](./auth-strategy.md).
> Promoted from `.scratchpad/enterprise-auth-integration-strategy.md`.

# Enterprise Auth & Integration Strategy

**Document:** `.scratchpad/enterprise-auth-integration-strategy.md`
**Created:** 2026-04-07
**Last reviewed:** 2026-04-08 (comprehensive 5-phase review, 11 reviewers, 135 findings)
**Status:** Draft v5 — corrections applied from `.full-review/05-final-report.md`
**Context:** 1Code fork evolving into enterprise internal AI coding tool

## Risk Posture

> **NO AUTOMATED TEST SUITE.** Per `CLAUDE.md`: "No Jest/Vitest/Playwright configured. `bun run build` is the only full validation beyond `ts:check`." This document adds ~800 lines of security-critical code; **Phase 0 MUST introduce `bun:test` before any auth migration begins**. See Section 5.11 Test Strategy.
>
> **NO CI/CD INFRASTRUCTURE.** No `.github/` directory; the entire release pipeline is one developer running `bun run release` from a local Mac. **Phase 0 MUST introduce GitHub Actions** with `bun audit + ts:check + build` gates.
>
> **ALTERNATIVE ARCHITECTURE EXISTS.** A separate document at `.scratchpad/../enterprise/auth-strategy.md` proposes a dual-auth Envoy Gateway pattern that eliminates ~70% of this strategy's MSAL-in-Electron complexity. The two documents represent parallel architectural choices — review both before committing.

## Glossary

| Term | Expansion |
|------|-----------|
| **MSAL** | Microsoft Authentication Library — Microsoft's official OAuth/OIDC client library |
| **CAE** | Continuous Access Evaluation — Microsoft Entra's near-real-time token revocation protocol |
| **PKCE** | Proof Key for Code Exchange (RFC 7636) — OAuth security extension for public clients |
| **OIDC** | OpenID Connect — identity layer on top of OAuth 2.0 |
| **CP1** | Client Protocol 1 — MSAL capability marker for CAE readiness (sent as `xms_cc` claim) |
| **WAM** | Web Account Manager — Windows broker for token management |
| **SLSA** | Supply-chain Levels for Software Artifacts — provenance framework |
| **SBOM** | Software Bill of Materials — dependency inventory |
| **DPAPI** | Data Protection API — Windows credential encryption |
| **AAL2/3** | Authenticator Assurance Level 2/3 (NIST 800-63B) — multi-factor / hardware-bound auth |
| **RFC 9700** | OAuth 2.0 Security Best Current Practice (Jan 2025) |
| **RFC 8252** | OAuth 2.0 for Native Apps |
| **RFC 9207** | OAuth 2.0 Authorization Server Issuer Identification |

---

## Executive Summary

This document reassesses 1Code's authentication and integration architecture in light of its new purpose as an **enterprise internal tool**. The upstream 21st.dev auth system is being retired, and the app is being evolved to prioritize **LiteLLM AI Gateway routing**, **Microsoft 365 integration**, and **Slack integration** for internal company employees.

**Key recommendation:** Build a modular credential/integration architecture that supports LiteLLM proxy configuration, Microsoft OAuth via MSAL, and Slack via MCP — but do NOT complete the original `credential-manager.ts` as-is. Instead, design a new system tailored to these specific enterprise needs.

---

## 1. Current Auth Systems — Disposition

### 1.1 21st.dev Auth (`auth-manager.ts` + `auth-store.ts`)

**Decision: ARCHIVE → Refactor via Strangler Fig Pattern**

| Aspect | Detail |
|--------|--------|
| **Current purpose** | Authenticate users with 21st.dev backend for subscription/plan management |
| **Usage** | **9 files, ~42 call sites** (corrected from "13/35" — verified via grep) across main process, IPC handlers, and 6 tRPC routers |
| **Disposition** | Archive originals to `docs/design/`. Create new `enterprise-auth.ts` with same interface contract, migrate call sites incrementally. |

**What's reusable:**
- `AuthStore` class — pattern for encrypted credential storage via `safeStorage` (OS keychain). **Security note:** The plaintext fallback when `safeStorage.isEncryptionAvailable()` returns false must be removed for enterprise use. Check `safeStorage.getSelectedStorageBackend()` and refuse to store credentials if it returns `basic_text`. (See Security Section 7.1)
- `AuthManager` class — solid singleton pattern with token refresh scheduling, deep link auth flow
- IPC bridge — `auth:is-authenticated`, `auth:get-user`, `auth:logout` handlers in `windows/main.ts`
- The 35 call sites show exactly where auth is consumed — this is the integration map for our replacement

**What must change:**
- Remove all `21st.dev` API endpoints (`/api/auth/desktop/exchange`, `/api/auth/desktop/refresh`, `/api/user/profile`, `/api/desktop/user/plan`)
- Replace with Microsoft Entra ID SSO (since the company is Microsoft-heavy)
- Remove PostHog analytics and Sentry integration tied to 21st.dev user plans
- **Add server-side token revocation on logout** (not just local credential clearing)

**Migration approach (Strangler Fig — per architecture review):**

> **Do NOT refactor `auth-manager.ts` in place across 42 call sites.** Instead:
> 1. Create `enterprise-auth.ts` exposing the same interface — actual `AuthManager` methods are: `isAuthenticated()`, `getUser()`, `getValidToken()` (async), `getAuth()?.token` (sync), `setOnTokenRefresh()`, `startAuthFlow()`, `logout()`. **NOTE:** No `getToken()` method exists — earlier doc revisions cited a fictional method.
> 2. Create an adapter that delegates to the new implementation while the old one still exists
> 3. Migrate call sites incrementally per-router
> 4. The old auth continues to work during development — no big-bang risk
> 5. **Define exit criteria:** All 9 importing files migrated → delete `auth-manager.ts` + `auth-store.ts` (Strangler Fig retirement)

**Blast radius of removal (files that import AuthManager):**
```
src/main/index.ts                          — init, deep link handler
src/main/windows/main.ts                   — IPC handlers (8 call sites)
src/main/lib/trpc/routers/voice.ts         — auth gating for voice features
src/main/lib/trpc/routers/sandbox-import.ts — auth token for sandbox API
src/main/lib/trpc/routers/debug.ts         — logout handler
src/main/lib/trpc/routers/claude-code.ts   — token for Claude Code binary
src/main/lib/trpc/routers/chats.ts         — token for remote API calls
src/main/lib/trpc/routers/anthropic-accounts.ts — user info for account linking
src/preload/index.ts                       — IPC bridge definitions
```

### 1.2 Anthropic Accounts (`anthropic-accounts.ts` router)

**Decision: KEEP**

Manages Anthropic API keys for direct Claude access. Stores encrypted tokens in SQLite via `safeStorage`. Multi-account support. This remains essential even with LiteLLM — users may need direct Anthropic access for development/testing.

**Security note:** Token preview logging at `claude.ts` **lines 200-204 AND lines 244-248** (TWO occurrences — multi-account path AND legacy fallback path) leaks first 20 + last 10 characters of OAuth tokens to console. **Both must be removed.** (See Security Section 7.5)

### 1.3 Claude Token (`claude-token.ts`)

**Decision: KEEP**

Reads Claude Code CLI OAuth credentials from the OS keychain (macOS Keychain, Windows DPAPI, Linux Secret Service). This is how the app discovers the user's Claude Code authentication. Essential for the Claude Code binary integration.

### 1.4 MCP OAuth (`oauth.ts` + `mcp-auth.ts`)

**Decision: KEEP**

Handles OAuth 2.0 with PKCE for authenticated MCP servers. The `CraftOAuth` class is a well-implemented OAuth flow with local callback server.

**Security notes:**
- Fixed callback port (`8914`) creates port-squatting risk. Should use ephemeral port (port 0) per RFC 8252 Section 7.3. (See Security Section 7.2)
- MCP OAuth tokens stored as plaintext in `~/.claude.json` (written by `mcp-auth.ts:460,505` via `claude-config.ts:writeClaudeConfig()` — `oauth.ts` itself is in-memory only). Should encrypt or move to `safeStorage`. (See Security Section 7.1)
- Pending OAuth state is in-memory only — flows fail silently after app restart during auth.

### 1.5 Credential Manager (`credential-manager.ts`)

**Decision: DELETE — But extract the architectural patterns**

The file is 891 lines of dead code with 8 missing dependencies. However, the *design* is sound:
- Unified credential facade with provider-specific auth flows
- Token expiry checking with 5-minute refresh window
- Re-auth marking when tokens fail
- Singleton pattern with `getSourceCredentialManager()`

**What to extract before deletion:**
- The `CredentialId` type design (credential type + workspace + source ID)
- The `authenticate()` dispatch pattern (provider detection → flow selection)
- The `refresh()` pattern with automatic credential update
- The `markSourceNeedsReauth()` pattern for UI state updates

These patterns should inform the new enterprise integration architecture (Section 5).

---

## 2. LiteLLM AI Gateway/Proxy Integration

### 2.0 CRITICAL: LiteLLM Supply Chain Security

> **In March 2026, LiteLLM PyPI versions 1.82.7 and 1.82.8 were compromised** in a supply chain attack. The malicious versions deployed credential harvesting, Kubernetes lateral movement, and persistent backdoors. CVE-2026-35029 (privilege escalation via unrestricted `/config/update` endpoint) also affects all versions before 1.83.0.
>
> **Minimum requirements for enterprise deployment:**
> - Pin to version **>= 1.83.0** (fixes both CVEs)
> - Verify PyPI package checksums or deploy from vetted container image
> - Restrict `/config/update` endpoint to admin-only access
> - Rotate the master key on a scheduled basis
> - Subscribe to [LiteLLM security advisories](https://docs.litellm.ai/blog/security-hardening-april-2026)
>
> References: [LiteLLM Security Update March 2026](https://docs.litellm.ai/blog/security-update-march-2026), [CVE-2026-35029](https://advisories.gitlab.com/pkg/pypi/litellm/CVE-2026-35029/), [Datadog analysis](https://securitylabs.datadoghq.com/articles/litellm-compromised-pypi-teampcp-supply-chain-campaign/)

### 2.1 What LiteLLM Provides

LiteLLM is an OpenAI-compatible proxy that sits between the app and AI providers:

```
1Code App  →  LiteLLM Proxy (>= 1.83.0, TLS required)  →  Anthropic / OpenAI / Ollama / Azure / etc.
```

**Key capabilities for enterprise use:**
- **Virtual keys** — employees get proxy keys; real API keys never leave the server
- **Per-user/team budgets** — daily/weekly/monthly spend limits with soft alerts
- **Model access control** — restrict which models each team/user can call
- **Rate limiting** — multi-instance aware, per-key/team limits
- **Spend tracking** — real-time cost by user/team/tag/key
- **SSO** — Okta, Azure AD, OneLogin for dashboard access
- **Guardrails** — PII masking (Presidio) — **mandatory for enterprise** to prevent sending PII/proprietary code to external AI providers
- **Fallback/retry** — automatic failover across deployments

### 2.2 Integration Pattern for 1Code

**Environment-level (Phase 1 — simplest):**

Each AI CLI tool (Claude Code binary, Codex binary) reads base URL env vars. The Electron app sets these before spawning child processes:

```typescript
// In terminal/env.ts or claude/env.ts before spawning CLI tools:
// IMPORTANT: Append /anthropic for native Anthropic API passthrough
env.ANTHROPIC_BASE_URL = `${settings.litellmProxyUrl}/anthropic`;  // e.g., "https://litellm.internal:4000/anthropic"
env.ANTHROPIC_API_KEY = settings.litellmVirtualKey;  // virtual key (format: sk-<random>, e.g., sk-tXL0wt5-lOOVK9sfY2UacA)

env.OPENAI_BASE_URL = `${settings.litellmProxyUrl}/v1`;
env.OPENAI_API_KEY = settings.litellmVirtualKey;
```

> **Correction (from LiteLLM validation review):** LiteLLM supports both OpenAI-format translation AND Anthropic-native passthrough at `/anthropic/v1/messages`. Claude Code should use the `/anthropic` path suffix so it can use the native Anthropic API directly without translation. See [LiteLLM Claude Code quickstart](https://docs.litellm.ai/docs/tutorials/claude_responses_api).
>
> **Security note:** TLS is mandatory for any non-localhost proxy connection. The settings UI should validate the URL scheme and warn/block if `http://` is used with a non-loopback address.

**tRPC router-level (Phase 2 — deeper):**

The `claude.ts`, `codex.ts`, and `ollama.ts` routers can accept a configurable base URL from app settings, passing it when initializing SDK clients.

### 2.3 LiteLLM Config for Our Stack

```yaml
# litellm_config.yaml (deployed on company infrastructure)
# WARNING: master_key MUST be injected via environment variable, NEVER hardcoded in this file.
# The master key grants full admin access to the proxy (key generation, model access, budget bypass).
model_list:
  - model_name: claude-sonnet-4-20250514
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-opus-4-20250514
    litellm_params:
      model: anthropic/claude-opus-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: gpt-4
    litellm_params:
      model: gpt-4
      api_key: os.environ/OPENAI_API_KEY

  - model_name: o3
    litellm_params:
      model: o3
      api_key: os.environ/OPENAI_API_KEY

  - model_name: llama3
    litellm_params:
      model: ollama/llama3
      api_base: http://ollama-host:11434

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
```

### 2.4 What 1Code Needs to Implement

| Component | Location | What to Build |
|-----------|----------|---------------|
| **Settings UI** | `src/renderer/features/settings/` | LiteLLM proxy URL + virtual key input fields. Validate TLS for non-localhost. |
| **Settings storage** | Drizzle DB table (encrypted via `safeStorage`) | Proxy URL, encrypted virtual key. **Not** Jotai/Zustand. |
| **Env injection** | `src/main/lib/claude/env.ts`, `terminal/env.ts` | Set `ANTHROPIC_BASE_URL` (with `/anthropic` suffix), `OPENAI_BASE_URL` (with `/v1` suffix) |
| **SDK client config** | `claude.ts`, `codex.ts`, `ollama.ts` routers | Pass `baseURL` to SDK constructors when proxy is configured |
| **Connection test** | New tRPC procedure | `GET /health/liveliness` for basic check (no auth required), `GET /health` for full model check (requires bearer token). **Note:** LiteLLM uses `/health/liveliness` (not `/health/liveness`) — this is the actual endpoint name. |
| **Admin link** | Settings UI | Deep link to LiteLLM dashboard for key/budget management |
| **Offline fallback** | All AI routers | If proxy unreachable, fall back to direct API keys (extend existing `checkOfflineFallback` pattern from `claude.ts`) |

**Estimated effort:** Small-Medium. Mostly configuration wiring, no new auth flows needed. **However**, LiteLLM virtual key assignment requires knowing who the user is — see Phase ordering in Section 5.3.

---

## 3. Microsoft 365 Integration

### 3.1 What's Available

**Microsoft Graph API** (`https://graph.microsoft.com`) provides unified access to:

| Service | Read Scope | Write Scope |
|---------|-----------|-------------|
| Mail (Outlook) | `Mail.Read` | `Mail.ReadWrite`, `Mail.Send` |
| Calendar | `Calendars.Read` | `Calendars.ReadWrite` |
| OneDrive | `Files.Read`, `Files.Read.All` | `Files.ReadWrite` |
| SharePoint | `Sites.Read.All` | `Sites.ReadWrite.All` |
| Teams channels | `ChannelMessage.Read.All` (admin consent) | `ChannelMessage.Send` (delegated) |
| Teams chats | `Chat.Read` | `Chat.ReadWrite` |
| User profile | `User.Read` | `User.ReadWrite` |

> **Security note:** Start with **read-only scopes** on the narrowest possible resource set. Implement a permission prompt before each MCP tool invocation that writes data (`Mail.Send`, `Chat.ReadWrite`). Prompt injection from emails or shared documents could cause AI to exfiltrate data from any resource the user can access.

### 3.2 Authentication for Electron

**Package:** `@azure/msal-node` >= 3.x (NOT `msal-browser` — explicitly unsupported in Electron). Actively maintained, v5.1.x as of April 2026. Ensure NOT on any 2.x version below 2.9.2 (CVE-2024-35255 elevation-of-privilege).

```typescript
import { PublicClientApplication } from '@azure/msal-node';
import { shell } from 'electron';

// NOTE: clientId must be loaded from config/env, never hardcoded.
// Validate that it is not a placeholder value like 'YOUR_CLIENT_ID'.
const pca = new PublicClientApplication({
  auth: {
    clientId: process.env.ENTRA_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${tenantId}`,
  }
});

// Interactive login — opens system browser
// IMPORTANT: Register redirect URI as http://localhost (no port, no 127.0.0.1) in Entra admin center.
// MSAL Node handles the loopback server internally — do NOT reuse the MCP OAuth redirect pattern.
// The MSAL loopback server and the existing oauth.ts server (port 8914) are INDEPENDENT — do not share ports.
const authResponse = await pca.acquireTokenInteractive({
  scopes: ['User.Read', 'Mail.Read'],
  openBrowser: async (url) => { await shell.openExternal(url); },
  successTemplate: '<h1>Signed in!</h1>',
});

// Silent renewal from cache
const silentResponse = await pca.acquireTokenSilent({
  account: authResponse.account,
  scopes: ['User.Read'],
});
```

**Token persistence:** `@azure/msal-node-extensions` (v5.1.2, April 2026) provides cross-platform encrypted cache (macOS Keychain, Windows DPAPI, Linux libsecret) — aligns with existing `safeStorage` pattern.

### 3.3 Microsoft MCP Servers

| Server | Source | Capabilities |
|--------|--------|-------------|
| **Microsoft Enterprise MCP** (preview) | `https://mcp.svc.cloud.microsoft/enterprise` | Tools: `microsoft_graph_suggest_queries`, `microsoft_graph_get`, `microsoft_graph_list_properties`. **Read-only, limited to Entra ID/directory data** (users, groups, apps, devices). NOT broad M365 data. **Preview URL may change — revalidate at implementation time.** |
| **Community Graph MCP** | `elyxlz/microsoft-mcp` (45 stars, last updated June 2025) | Outlook, Calendar, OneDrive, Contacts via Graph API. Multi-account support. Moderate maintenance. |
| **Azure MCP Server** | `microsoft/mcp` catalog | Azure service management |

### 3.4 Integration Approaches

> **Architecture review correction:** MCP-first is premature for Microsoft Graph. The Enterprise MCP server is preview, read-only, and limited to Entra directory data. Enterprise use cases (sending mail, creating events, posting to Teams) require write operations.

**Recommended: Direct Graph API first (via tRPC router), MCP as supplementary read channel.**

- **Primary:** New tRPC router `microsoft.ts` with procedures for mail, calendar, Teams, OneDrive. Uses `@microsoft/microsoft-graph-client` with MSAL auth provider.
- **Supplementary:** Register Microsoft Enterprise MCP server for AI-assisted natural language queries against directory data.

### 3.5 Enterprise SSO via Entra ID

If the company uses Microsoft Entra ID (Azure AD):
- Register the app as "Mobile and desktop application" in Entra admin center
- Set redirect URI to `http://localhost` (no port, no `127.0.0.1` — Entra does exact host match but allows any port for localhost)
- Authority: `https://login.microsoftonline.com/{tenantId}` for single-tenant
- Supports Conditional Access, MFA, federated identity automatically
- **Enable Continuous Access Evaluation (CAE)** — when API returns `401` with `www-authenticate` containing `claims` challenge, pass claims to `acquireTokenSilent` for fresh token. Required for enterprise compliance.
- **This can serve as the replacement for the 21st.dev user login** — employees SSO with their corporate Microsoft account
- **Consider WAM (Web Account Manager) broker** on Windows or ASWebAuthenticationSession on macOS for device-based Conditional Access evaluation

### 3.6 Required npm Packages

```
@azure/msal-node              ^3.8.0   — OAuth (latest April 2026; do NOT confuse with msal-node-extensions v5)
@azure/msal-node-extensions   ^5.1.2   — Encrypted token cache (NATIVE module — must add to electron-rebuild)
@microsoft/microsoft-graph-client ^3.x — Graph API typed client
jose                          ^5.x     — JWT validation library (recommended over jsonwebtoken)
```

**IMPORTANT:** Earlier doc revisions confused `@azure/msal-node` versions with `@azure/msal-node-extensions`. The actual current versions (April 2026) are:
- `@azure/msal-node@^3.8.0` (NOT 5.x — that doesn't exist)
- `@azure/msal-node-extensions@^5.1.2`

**`@azure/msal-node-extensions` is a NATIVE module** — add to `package.json` postinstall script's `electron-rebuild` target list, alongside `better-sqlite3` and `node-pty`. (Phase 1 finding A-L3 / Phase 4 F-M10)

**MSAL configuration with CAE support** (Phase 4 F-M9):
```typescript
new PublicClientApplication({
  auth: {
    clientId: process.env.ENTRA_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    clientCapabilities: ['cp1']  // CRITICAL: required for CAE — see Section 7.4
  },
  system: { loggerOptions: { piiLoggingEnabled: false } },
  cache: { cachePlugin: PersistenceCachePluginFactory.create(...) }
})
```

**Estimated effort:** Medium-Large. OAuth flow, token management, UI, and tRPC router for Graph API.

---

## 4. Slack Integration

### 4.1 Official Slack MCP Server

Slack operates a hosted MCP endpoint at `https://mcp.slack.com/mcp` using JSON-RPC 2.0 over Streamable HTTP.

**Tools exposed:**
- **Search** — messages, files, users, channels
- **Messaging** — send messages, read history, thread replies
- **Canvases** — create, read, update rich documents
- **Users** — profiles, custom fields, statuses

**Auth:** OAuth 2.0 with user tokens. Authorize endpoint: `https://slack.com/oauth/v2_user/authorize`. Token exchange: `https://slack.com/api/oauth.v2.user.access`.

> **Security note:** Desktop/Electron apps are **public clients** and cannot securely store a `client_secret`. All OAuth flows must use PKCE with S256 challenge method.
>
> **✅ RESOLVED (April 2026):** **Slack released PKCE support as GA on March 30, 2026.** Desktop apps can now use `oauth.v2.access` with `code` + `code_verifier` + `client_id` — **no `client_secret` required**. This is a self-serve toggle in Slack app settings. Source: [Slack PKCE GA changelog](https://docs.slack.dev/changelog/2026/03/30/pkce/), [Using PKCE | Slack Dev Docs](https://docs.slack.dev/authentication/using-pkce/).
>
> **Critical PKCE restrictions:**
> - **User scopes only** — Desktop redirects (custom URI schemes + localhost) with PKCE cannot request bot scopes. If bot scopes are needed, use a backend proxy or the "paste token" fallback pattern.
> - **Mandatory token rotation** — Refresh tokens expire in **30 days** when using custom URI schemes, regardless of app settings. Must implement refresh logic.
> - **One-way toggle** — Enabling PKCE marks the Slack app as public client permanently. Reverting requires a Slack support ticket.
> - **PKCE mandatory for custom URI schemes** — Slack rejects custom-scheme redirects without PKCE params.

**Required scopes:**
- `search:read.public`, `search:read.private` (confirmed)
- `search:read.files` (listed in Slack docs but independently unverified — confirm during implementation)
- `chat:write`, `channels:history`, `groups:history`, `im:history`
- `canvases:read`, `canvases:write`
- `users:read`, `users:read.email`

### 4.2 Community MCP Servers

| Server | Tools | Notes |
|--------|-------|-------|
| **@modelcontextprotocol/server-slack** (archived) | 8 tools | Bot token (`xoxb-`). List channels, post/reply, reactions, history, users. |
| **korotovsky/slack-mcp-server** | 15 tools | Safest — write-disabled by default, channel-specific write restrictions. 1,400+ stars, actively maintained. |

> **Correction:** Repo name is `korotovsky/slack-mcp-server` (not `korotovsky/slack-mcp`).

### 4.3 Integration Pattern — Two Viable Paths

> **Insight from research:** Both popular Slack MCP servers (`korotovsky/slack-mcp-server` and `@modelcontextprotocol/server-slack`) **skip OAuth entirely**. They accept pre-generated tokens via environment variables (`SLACK_MCP_XOXP_TOKEN`, `SLACK_BOT_TOKEN`, etc.). Users manually paste tokens from their Slack app settings. This is the simplest, lowest-friction path.

#### Path A: Paste-Token MVP (Recommended for Phase 3 start)

**No OAuth flow in Electron app.** Users generate tokens manually in Slack (one-time setup), then paste them into 1Code's settings UI.

- Settings UI has a "Slack Token" input field (same pattern as Anthropic API key)
- Token stored via `safeStorage` in new `integration_connections` Drizzle table
- Token passed to Slack MCP server via env var when spawning
- Supports all token types: `xoxp-` (user), `xoxb-` (bot), `xoxc-`+`xoxd-` (browser session)
- **Zero OAuth code to maintain** — no client registration, no redirect handling, no refresh logic
- **Trade-off:** Users must do manual setup once (create Slack app, generate token, copy/paste)

#### Path B: First-Class OAuth with PKCE (Phase 3+ enhancement)

Full OAuth flow for users who want a smoother sign-in experience. Uses Slack's now-GA PKCE support.

**Implementation:**
1. Register Slack app as public client (one-way PKCE toggle in Slack app settings)
2. Generate `code_verifier` (43-128 random chars) and `code_challenge` = `BASE64URL(SHA256(verifier))`
3. Open system browser to authorize URL with `code_challenge`, `code_challenge_method=S256`, custom URI redirect
4. Register `twentyfirst-agents://slack-callback` via `app.setAsDefaultProtocolClient()` (app already has this pattern in `src/main/index.ts`)
5. **Validate callback per RFC 9700 (Phase 4 F-H6):**
   - **State validation:** Constant-time comparison via `crypto.timingSafeEqual`
   - **Issuer validation:** `iss === 'https://slack.com'` — Slack started returning `iss` in callbacks Q4 2025
   - **Token endpoint origin:** Exchange code at the **stored** `tokenEndpoint` only, never derived from callback URL
6. POST to `oauth.v2.access` with `code` + `code_verifier` + `client_id` (no `client_secret`)
7. **Validate ID token `aud` claim** matches client ID (RFC 9700 §4.4.2.2 / OIDC Core 3.1.3.7)
8. Store token in `integration_connections` Drizzle table
9. Implement 30-day refresh token rotation (custom URI schemes force rotation regardless of app settings)
10. **Limitation:** User scopes only — cannot request bot scopes via this flow

**Reference implementations:**
- [`googlesamples/appauth-js-electron-sample`](https://github.com/googlesamples/appauth-js-electron-sample) — canonical AppAuth-JS pattern for Electron
- Can use `@openid/appauth` library OR ~50 lines of hand-rolled code

> **Security note:** User tokens inherit the user's full workspace visibility. Consider starting with bot tokens (limited to invited channels) via Path A for tighter access control. Add rate limiting on MCP tool invocations to prevent bulk data exfiltration via prompt injection.

### 4.4 What AI Can Do With Slack

- Search messages and files across the workspace for project context
- Read channel history and threads to ground AI responses in team discussions
- Post messages, replies, and reactions on behalf of the user
- Fetch user profiles and statuses
- Create/update Canvases (via official MCP server)

### 4.5 Enterprise Considerations

- Workspace guests cannot access apps with "Agents & AI Apps" enabled
- Paid Slack plan may be required (not independently verified — confirm during implementation)
- Official MCP server respects organizational permission models
- Real-Time Search API avoids storing customer data externally
- Bot tokens are stable but limited to invited channels; user tokens inherit user's full visibility
- `korotovsky/slack-mcp-server` offers write-disable-by-default for production safety

**Estimated effort:** Small-Medium. Primarily an OAuth flow + MCP server registration. The MCP infrastructure already exists.

---

## 5. Revised Architecture Recommendation

### 5.1 Don't Revive `credential-manager.ts` — Build Targeted Solutions

The original `credential-manager.ts` was designed for a generic "Sources" system with Google/Slack/Microsoft/MCP. Our needs are more specific:

| Original Design | Our Need |
|-----------------|----------|
| Generic `LoadedSource` type | Specific integrations: LiteLLM, Microsoft, Slack |
| Google OAuth | Not needed (deprioritized) |
| Generic credential store | Use existing `safeStorage` + Drizzle DB tables per integration |
| Single unified class | Per-integration tRPC routers (consistent with existing pattern) |

### 5.2 Proposed Architecture

> **Architecture review correction:** Keep new files flat under `src/main/lib/` to match the existing convention. Do NOT introduce `lib/auth/` or `lib/integrations/` subdirectories — this creates a second organizational pattern. The codebase uses flat files (`oauth.ts`, `mcp-auth.ts`, `claude-token.ts`) exposed through `src/main/lib/trpc/routers/`.

```
src/main/
├── lib/
│   ├── enterprise-auth.ts             ← NEW: Replaces auth-manager.ts (Entra ID SSO, Strangler Fig adapter)
│   ├── enterprise-store.ts            ← NEW: Refactored from auth-store.ts (no plaintext fallback)
│   ├── microsoft-graph.ts             ← NEW: MSAL + Graph API client
│   ├── litellm.ts                     ← NEW: Proxy config, connection test, key management
│   ├── slack-auth.ts                  ← NEW: Slack OAuth flow for MCP token
│   ├── trpc/routers/
│   │   ├── enterprise-auth.ts         ← NEW: Replaces 21st.dev auth endpoints
│   │   ├── litellm.ts                 ← NEW: Proxy configuration
│   │   ├── microsoft.ts               ← NEW: Graph API procedures (primary integration path)
│   │   └── slack.ts                   ← NEW: Slack integration (if beyond MCP)
│   ├── oauth.ts                       ← KEEP: MCP OAuth (extend for Slack, add ephemeral port)
│   ├── mcp-auth.ts                    ← KEEP: MCP server connections
│   └── claude-token.ts                ← KEEP: Claude CLI token
├── auth-manager.ts                    ← KEEP during migration (Strangler Fig — delegate to enterprise-auth.ts)
└── auth-store.ts                      ← KEEP during migration (delegate to enterprise-store.ts)
```

**State management (per architecture review):** Integration state (connected accounts, tokens, refresh timestamps, sync status) must use **Drizzle DB tables** — not Jotai atoms (ephemeral, per-window) or Zustand stores (per-renderer). Follow the existing `anthropic_accounts` and `claude_code_credentials` pattern. New tables: `enterprise_credentials`, `integration_connections`. Expose connection status to renderer via tRPC queries + React Query subscriptions.

### 5.3 Implementation Phases

> **Architecture review correction:** Phase order swapped. LiteLLM virtual key assignment requires user identity for per-user budgets and model access. Entra SSO must come first.

#### Phase 0: Foundation (Week 1-2) — BLOCKING

**Per Phase 4 review: NO strategy implementation can begin until Phase 0 completes.**

**Week 1 — Security & CI fixes:**

1. **Audit checksums in download scripts (P0-2 — CRITICAL):**
   - `scripts/download-claude-binary.mjs`
   - `scripts/download-codex-binary.mjs`
   - **The strategy explicitly cites the LiteLLM March 2026 supply chain attack — same threat applies here.** Pin SHA256 hashes from upstream releases.

2. **Stand up GitHub Actions CI (P0-3 — CRITICAL):**
   - Minimum: `bun install --frozen-lockfile && bun audit --high && bun run ts:check && bun run build`
   - Multi-OS matrix: macOS arm64+x64, Windows, Linux
   - Reference: sibling Talos cluster repo has 14 working workflows to copy from

3. **Enable Dependabot + secret scanning (P0-9 — zero effort):**
   - GitHub repo settings → Security → Enable both

4. **Delete dead code:**
   - `auth:get-token` IPC handler (`windows/main.ts:434-437`) — **CVSS 9.0 vulnerability (S-C1) but it's dead code, 0 renderer callers verified via grep**. Just delete.
   - `getAuthToken` preload export (`preload/index.ts:198`)
   - `getAuthToken` type declaration (`preload/index.ts:461`)
   - `credential-manager.ts` — **890 lines** (corrected from 891), 0 importers, 7+ non-existent import paths
   - **Token preview logs at `claude.ts:200-204` AND `:244-248`** (TWO occurrences — Q-H1/S-H1 confirmed)

5. **Patch Electron** to `~39.8.7` (zero risk):
   - Per Phase 6 research: all April 2026 CVEs already patched in `~39.8.6` (your current version)
   - Latest stable 39.x as of 2026-04-08 is `39.8.7`
   - Plan major upgrade to Electron 41 in Phase 0.5 before EOL on 2026-05-05

**Week 2 — Test foundation:**

1. **Adopt `bun:test`** (P0-7 — CRITICAL):
   - Zero deps, native to toolchain
   - CI gate: `bun run ts:check && bun test && bun run build`
   - Phase-gated additions (Vitest for renderer, Playwright for E2E, MSW for HTTP mocks) per Phase 3 T-C1

2. **Write Phase 0 regression guard tests** (P0-8):
   ```typescript
   // src/main/__tests__/phase0-deletions.test.ts
   test("auth:get-token IPC handler is deleted", () => {
     const src = readFileSync("../windows/main.ts", "utf8");
     expect(src).not.toMatch(/ipcMain\.handle\s*\(\s*["']auth:get-token["']/);
   });
   test("token preview logging is removed (BOTH occurrences)", () => {
     const src = readFileSync("../lib/trpc/routers/claude.ts", "utf8");
     expect(src).not.toMatch(/decrypted\.slice\(0,\s*20\)[^}]*decrypted\.slice\(-10\)/);
   });
   test("credential-manager.ts is deleted", () => {
     expect(() => readFileSync("../lib/credential-manager.ts")).toThrow(/ENOENT/);
   });
   ```

3. **Add ESLint rule** preventing token preview log reintroduction (see Section 7.5)

4. **Harden `validateSender`** (Phase 4 F-M1):
   - Use `event.senderFrame.url` (NOT `event.sender.getURL()`)
   - Tighten `file://` validation to bundled HTML only
   - Remove subdomain wildcard for `21st.dev`
   - Restrict `localhost`/`127.0.0.1` to dev only

5. **Add host allowlist to `signedFetch`** to prevent XSS-driven token exfiltration via outbound URLs

**Week 2 also — Strategy doc fixes:**

1. **Convert this strategy to OpenSpec change proposal** (P0-4):
    - Path: `openspec/changes/replace-21st-auth-with-enterprise-sso/`
    - Files: `proposal.md`, `design.md`, `tasks.md`, `specs/{enterprise-auth,litellm-gateway,microsoft-graph,slack-integration}/`

2. **Remove `~~Spike~~` items** — both already resolved via research:
    - ~~Spike: Slack OAuth public client PKCE~~ ✅ **RESOLVED** — Slack PKCE GA as of 2026-03-30 (Section 4.1)
    - ~~Spike: Linux `safeStorage` backend~~ ✅ **RESOLVED** — VS Code/Signal/teams-for-linux patterns (Section 7.7)

3. **Quantify PostHog/Sentry removal scope** — moved here from original Phase 0 because Phase 4 confirmed it's a discrete cleanup task. Couple with CSP tightening (Phase 4 F-M14).

**Phase 0 acceptance criteria:**
- All P0 findings remediated
- CI gate passes on a representative PR
- `bun:test` runs at least 5 regression guard tests
- Strategy doc converted to OpenSpec or substantially updated
- **Outcome:** Cleaner codebase, security fixes applied, foundation in place for Phase 1

#### Phase 0.5: Electron Major Upgrade (Week 3-4) — TIME-CRITICAL

**Must complete before Electron 39 EOL on 2026-05-05.**

1. Upgrade Electron `~39.8.7` → `~41.1.1`
2. Upgrade `electron-vite` `^3.1.0` → `^5.0.0` (two major jumps)
3. Upgrade Vite `^6.4.2` → `^7.x` — removes `splitVendorChunk` dependency
4. Native module rebuilds: `better-sqlite3`, `node-pty`, future `@azure/msal-node-extensions`
5. **Add Electron Fuses** via `@electron/fuses` afterPack hook (Phase 4 F-H1):
   - `RunAsNode: false`
   - `EnableNodeOptionsEnvironmentVariable: false`
   - `EnableNodeCliInspectArguments: false`
   - `OnlyLoadAppFromAsar: true`
   - `EnableEmbeddedAsarIntegrityValidation: true` (CVE-2025-55305 mitigation)
   - `GrantFileProtocolExtraPrivileges: false`
6. **Tighten renderer CSP** (Phase 4 F-H5) — replace `unsafe-inline`/`unsafe-eval` with nonces, narrow `connect-src`
7. **Update CLAUDE.md** to remove "Vite must stay on 6.x" note (now obsolete)

#### Phase 1: Microsoft Entra ID SSO (Replace 21st.dev auth — enables all subsequent phases)
- Create `enterprise-auth.ts` using `@azure/msal-node` with Strangler Fig adapter
- Employees sign in with corporate Microsoft account
- Migrate call sites incrementally from `getAuthManager()` to new enterprise auth
- Enable Continuous Access Evaluation (CAE) for enterprise compliance
- **Outcome:** Users authenticate with corporate identity. User identity available for LiteLLM key binding.

#### Phase 2: LiteLLM Proxy Integration (Highest immediate impact for AI workflows)
- Settings UI for proxy URL + virtual key (TLS validation for non-localhost)
- Env injection for CLI tool spawning (with `/anthropic` path suffix for Claude)
- Connection test endpoint (`/health/liveliness`)
- Offline fallback to direct API keys (extend `checkOfflineFallback` pattern)
- **Outcome:** All AI tools route through company proxy with budget/access controls

#### Phase 3: Slack MCP Integration (Highest user demand)
- Slack OAuth flow with PKCE in main process (public client, no embedded `client_secret`)
- Store tokens in Drizzle DB table via `safeStorage`
- Register Slack MCP server in app config
- AI backends can search Slack, read channels, post messages
- **Outcome:** AI assistant has Slack workspace context

#### Phase 4: Microsoft 365 via Graph API (Richest integration)
- Microsoft Graph OAuth (incremental consent for Mail, Calendar, Teams, etc.)
- **Direct Graph API via `microsoft.ts` tRPC router** (primary path — MCP server is preview/read-only)
- Register Microsoft Enterprise MCP server as supplementary read channel for directory queries
- Start with read-only scopes, add write scopes with user confirmation prompts
- **Outcome:** AI assistant can access mail, calendar, Teams, OneDrive

### 5.4 What to Delete/Archive

| File | Action | Reason |
|------|--------|--------|
| `credential-manager.ts` | **Delete** | Dead code, 13 IDE errors, dependencies don't exist |
| `auth-manager.ts` | **Keep during migration** | Strangler Fig — adapter delegates to `enterprise-auth.ts` |
| `auth-store.ts` | **Keep during migration** | Adapter delegates to `enterprise-store.ts` |

### 5.5 `enterprise-auth.ts` Interface Contract

Method-by-method mapping from existing `AuthManager` to new `EnterpriseAuth`:

| `AuthManager` Method | Disposition | `EnterpriseAuth` Equivalent |
|---------------------|-------------|----------------------------|
| `isAuthenticated()` | **Keep** | `isAuthenticated()` — delegates to MSAL account cache |
| `getUser()` | **Keep** | `getUser()` — returns Entra ID user profile |
| `getToken()` | **Keep** | `getToken()` — returns access token from MSAL cache |
| `getValidToken()` | **Keep** | `getValidToken()` — silent refresh via `acquireTokenSilent`, interactive if needed |
| `getAuth()` | **Adapt** | `getAuth()` — returns `EnterpriseAuthData` (no `refreshToken` exposed) |
| `refresh()` | **Adapt** | Handled internally by MSAL's `acquireTokenSilent` |
| `startAuthFlow()` | **Adapt** | `signIn()` — uses `acquireTokenInteractive` with Entra MSAL |
| `exchangeCode()` | **Drop** | MSAL handles code exchange internally |
| `updateUser()` | **Drop** | No user profile updates needed (Entra manages profiles) |
| `fetchUserPlan()` | **Drop** | 21st.dev-specific, no equivalent |
| `logout()` | **Adapt** | `signOut()` — clears MSAL cache + calls Entra `/oauth2/v2.0/logout` for server-side revocation |
| `setOnTokenRefresh()` | **Keep** | `onTokenRefresh(callback)` — notify main process of refreshed tokens |

### 5.6 Draft Database Schema (Drizzle)

```typescript
// New tables following existing conventions from src/main/lib/db/schema/index.ts

export const enterpriseCredentials = sqliteTable("enterprise_credentials", {
  id: text("id").primaryKey().default("singleton"), // Single row for primary enterprise auth
  provider: text("provider").notNull(), // "entra_id" | "custom"
  encryptedToken: text("encrypted_token"), // Access token, encrypted via safeStorage
  accountId: text("account_id"), // MSAL account identifier (for silent refresh)
  email: text("email"), // User email from Entra ID
  displayName: text("display_name"), // User display name
  tenantId: text("tenant_id"), // Entra tenant ID
  expiresAt: integer("expires_at", { mode: "timestamp" }), // Token expiry
  connectedAt: integer("connected_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const integrationConnections = sqliteTable("integration_connections", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  type: text("type").notNull(), // "litellm" | "slack" | "microsoft_graph"
  label: text("label"), // User-visible label (e.g., "Company LiteLLM Proxy")
  encryptedConfig: text("encrypted_config"), // JSON blob encrypted via safeStorage
  // For LiteLLM: { proxyUrl, virtualKey }
  // For Slack: { accessToken, refreshToken, teamId, teamName }
  // For Microsoft Graph: { accountId, scopes[] } (tokens managed by MSAL cache)
  status: text("status").default("disconnected"), // "connected" | "disconnected" | "needs_reauth" | "error"
  statusMessage: text("status_message"), // Human-readable status
  connectedAt: integer("connected_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
```

### 5.7 Environment and Context Isolation

> Environment variables set for child processes (spawned via Node.js `child_process` in the main process) are **not** accessible from the renderer process. The app uses `contextIsolation: true` and `nodeIntegration: false` (Electron security defaults). The `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` values injected for CLI tool spawning do not leak to the renderer.

---

## 6. Open Questions for Next Iteration

1. **Identity provider:** Is the company on Microsoft Entra ID? If yes, use MSAL for app auth. If not, what SSO/IdP should we target?
2. **LiteLLM deployment:** Is LiteLLM already deployed on company infrastructure? What URL? What version? (Must be >= 1.83.0 due to March 2026 supply chain compromise)
3. **Slack workspace:** What Slack plan is the company on? (Paid plan may be required for MCP features — unverified)
4. **Microsoft 365 tenant:** Single-tenant or multi-tenant? Will we need admin consent for Teams channel reading (`ChannelMessage.Read.All`)?
5. **App registration:** Who can register apps in the company's Entra ID / Slack workspace? Any approval process?
6. **Offline access:** Should the app work when the LiteLLM proxy is unreachable? (Recommended: fallback to direct API keys)
7. **Conditional Access:** Does the company enforce device compliance (Intune), named locations, or approved client app policies? If so, we need WAM broker support.
8. **Data residency:** Are there regulatory requirements for where AI-processed code/data is stored? Do we need data processing agreements (DPAs) with AI providers?
9. **Audit logging:** Does the company require centralized audit logs for auth events (SOC 2, ISO 27001)?

---

## 7. Security Requirements (from independent security audit)

### 7.1 Token Storage

- **Remove plaintext fallback** in `AuthStore`. Refuse to store enterprise credentials when `safeStorage.getSelectedStorageBackend()` returns `basic_text` without explicit user consent. See Section 7.7 for full layered Linux strategy.
  - **Minimum Electron version:** `getSelectedStorageBackend()` was added in Electron 33. The project uses Electron ~39, so this is available.
  - **`keytar` deprecated:** `keytar` was archived read-only by Atom on March 25, 2026. Do not use for new code. If `safeStorage` proves insufficient, consider `keyring-node` (Brooooooklyn/keyring-node) as a maintained alternative — Rust-backed NAPI library, 100% keytar-compatible, adds `pass` (password-store) Linux backend support that `safeStorage` lacks.
- **Encrypt MCP OAuth tokens** in `~/.claude.json`. Move to `safeStorage`-backed store or encrypt the `_oauth` block. Set file permissions to `0600`.
- **Add integrity protection** to SQLite credential storage (HMAC or SQLCipher). Validate decrypted token format before use.

### 7.2 OAuth Flows

- **Use ephemeral ports** for OAuth callback servers (port 0 in `server.listen()`) per RFC 8252 Section 7.3.
- **Enforce PKCE with S256** on ALL OAuth flows (Microsoft, Slack, MCP). No exceptions.
- **Register `http://localhost`** (no port, no `127.0.0.1`) in Entra admin center. Let MSAL handle the loopback server.
- **Implement server-side token revocation** on logout for all providers (Microsoft `/oauth2/v2.0/logout`, Slack `auth.revoke`, LiteLLM key revocation).
- **Track refresh token age** and force re-authentication after configurable max age (e.g., 24 hours).

### 7.3 LiteLLM Proxy

- **Mandate TLS** for non-localhost proxy connections. Validate URL scheme in settings UI.
- **Pin to version >= 1.83.0** (post-supply-chain-compromise). Verify deployment artifact integrity.
- **Restrict `/config/update` endpoint** to admin-only access.
- **Consider file-based credential passing** instead of env vars (env vars visible in process listings via `ps eww`). Use temp file with `0600` permissions if CLI tools support `ANTHROPIC_API_KEY_FILE`.

### 7.4 Enterprise Compliance

- **Enable Continuous Access Evaluation (CAE)** in MSAL configuration for near-real-time token revocation.
- **Implement audit logging** for all auth events (login, logout, token refresh, failed attempts, integration connect/disconnect).
- **Require PII masking** (LiteLLM Presidio guardrails) as mandatory, not optional.
- **Document data residency** — which providers have DPAs, where code context flows.
- **Implement permission prompts** before AI writes to external services (send mail, post to Teams/Slack).

### 7.5 Immediate Code Fixes Required

- **Remove token preview logging** at `claude.ts` **lines 200-204 AND lines 244-248** (TWO occurrences — same `decrypted.slice(0, 20) + "..." + decrypted.slice(-10)` pattern in both multi-account path and legacy fallback path). Replace BOTH with `console.log("[claude-auth] Token obtained: true, length:", decrypted.length)`.

  **Add ESLint rule to prevent regression:**
  ```json
  "no-restricted-syntax": ["error", {
    "selector": "CallExpression[callee.property.name='slice'][arguments.0.value=0][arguments.1.value=20]",
    "message": "Token preview pattern banned — CWE-532"
  }]
  ```
- **Add MCP server domain allowlist** in enterprise configuration. Pin TLS certificates for critical MCP endpoints.
- **Externalize Entra client ID** from code — load from config/env, validate against placeholder patterns.

### 7.6 Resilience & Offline Mode (from architecture review)

- **Connectivity state machine** (online/degraded/offline) exposed as tRPC subscription for UI status display.
- **LiteLLM fallback** — if proxy unreachable, fall back to direct API keys. Extend existing `checkOfflineFallback` pattern from `claude.ts`.
- **Token refresh** — exponential backoff with jitter on refresh failures, not just scheduled refresh.
- **OAuth timeout handling** — system browser redirect may never complete. Add configurable timeout.

### 7.7 Linux `safeStorage` Layered Strategy (from research)

**Backend availability reality check (April 2026):**

| Platform | Backend | Reliability |
|----------|---------|-------------|
| macOS | Keychain | Reliable |
| Windows | DPAPI | Reliable |
| Linux GNOME Desktop (Ubuntu, Fedora) | `gnome_libsecret` | Reliable |
| Linux KDE Desktop (Kubuntu, KDE Neon) | `kwallet5`/`kwallet6` | Reliable |
| RHEL / Rocky / Ubuntu Server / Debian netinst | **None** | Falls back to `basic_text` (plaintext) |
| Docker/Podman containers | **None** (no D-Bus session) | Falls back to `basic_text` |
| Flatpak sandbox | Works via portal, can desync | Caveats |
| Tiling WMs (i3, sway, Hyprland, awesome) | Often `basic_text` | Unreliable pre-Electron-39 |

**Implement layered strategy (Signal-style integrity + VS Code-style UX + teams-for-linux fallback):**

**Layer 1: Backend detection at startup**
```typescript
import { safeStorage } from 'electron';

if (process.platform === 'linux') {
  // safeStorage is ready after app 'ready' event
  const backend = safeStorage.getSelectedStorageBackend();
  // Returns: 'basic_text' | 'gnome_libsecret' | 'kwallet' | 'kwallet5' | 'kwallet6' | 'unknown'

  if (backend === 'basic_text' || backend === 'unknown') {
    // Show blocking warning — see Layer 2
  }
}
```

**Layer 2: VS Code-style modal when detection fails**

Show a non-dismissible warning in the auth UI offering three paths:
1. **"Install gnome-keyring / kwallet"** — copy-paste commands per detected distro (RHEL: `sudo dnf install gnome-keyring`, Ubuntu: `sudo apt install gnome-keyring`, etc.)
2. **"Continue with reduced security"** — call `safeStorage.setUsePlainTextEncryption(true)` and mark credentials as `weakly_encrypted` in DB. Requires explicit user acknowledgment.
3. **"Don't store credentials"** — in-memory only, re-auth each launch (teams-for-linux pattern)

**Layer 3: Signal-style integrity check**

Add a `safe_storage_backend` column to credential tables. On every token load, compare stored backend with current `getSelectedStorageBackend()`:
- If backends match → decrypt and use token normally
- If backends differ (user switched DE, upgraded Plasma, moved to container) → **refuse to decrypt**, force re-auth, log the backend change
- This prevents silent security downgrades that nobody would otherwise notice

**Layer 4: CLI flag for enterprise headless deployments**

Provide a `--password-store=basic` CLI flag that sets `setUsePlainTextEncryption(true)` at startup with explicit user acknowledgment written to the DB. Document this as the approved path for headless RHEL/Ubuntu Server deployments where a keyring cannot be installed.

**Database schema addition:**
```typescript
// Add to enterpriseCredentials and integrationConnections tables:
safeStorageBackend: text("safe_storage_backend"), // 'gnome_libsecret' | 'kwallet5' | 'basic_text' | etc.
isWeaklyEncrypted: integer("is_weakly_encrypted", { mode: "boolean" }).default(false),
```

**What NOT to do:**
- ❌ Do not roll your own encryption layer with PBKDF2 over a machine-ID — this is security theater
- ❌ Do not silently use `basic_text` without user acknowledgment — users must know their credentials are not protected
- ❌ Do not use deprecated `keytar` — archived by Atom on 2026-03-25

**Real-world patterns referenced:**
- **VS Code** ([issue #185212](https://github.com/microsoft/vscode/issues/185212)) — modal dialog + `argv.json` `password-store` arg
- **Signal Desktop** ([Yingtong Li blog Aug 2025](https://yingtongli.me/blog/2025/08/13/signal-secrets.html)) — stores `safeStorageBackend` in `config.json`, refuses to decrypt on backend change
- **Teams-for-Linux** ([PR #1839](https://github.com/IsmaelMartinez/teams-for-linux/pull/1839)) — in-memory fallback when unavailable

---

## Appendix A: Research Sources

### LiteLLM
- [LiteLLM Full Documentation](https://docs.litellm.ai/llms-full.txt)
- [LiteLLM Security Hardening April 2026](https://docs.litellm.ai/blog/security-hardening-april-2026)
- [LiteLLM Claude Code Quickstart](https://docs.litellm.ai/docs/tutorials/claude_responses_api) — shows `/anthropic` passthrough
- [LiteLLM Health Checks](https://docs.litellm.ai/docs/proxy/health) — `/health` (requires auth) and `/health/liveliness` (basic check)
- [LiteLLM Virtual Keys](https://docs.litellm.ai/docs/proxy/virtual_keys) — format: `sk-` + random string
- [LiteLLM Ollama Provider](https://docs.litellm.ai/docs/providers/ollama) — streaming confirmed with caveats
- Proxy server runs on `http://0.0.0.0:4000` by default
- OpenAI-compatible API: `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`
- Anthropic passthrough: `/anthropic/v1/messages`
- Admin API: `/key/generate`, `/team/new`

### Microsoft
- [Microsoft Graph Overview](https://learn.microsoft.com/graph/overview)
- [Microsoft Graph Permissions Reference](https://learn.microsoft.com/graph/permissions-reference)
- [MSAL Node Electron Tutorial](https://learn.microsoft.com/entra/identity-platform/tutorial-v2-nodejs-desktop)
- [Microsoft MCP Server for Enterprise](https://learn.microsoft.com/en-us/graph/mcp-server/overview) — preview, read-only, Entra directory only
- [Microsoft MCP GitHub Catalog](https://github.com/microsoft/mcp)
- [Teams Messaging APIs](https://learn.microsoft.com/graph/teams-messaging-overview)
- [Microsoft CAE Documentation](https://learn.microsoft.com/en-us/entra/identity-platform/app-resilience-continuous-access-evaluation)
- [RFC 8252 Section 7.3 — Loopback Redirect](https://www.rfc-editor.org/rfc/rfc8252#section-7.3)
- Packages: `@azure/msal-node` >= 3.x, `@azure/msal-node-extensions` >= 5.x, `@microsoft/microsoft-graph-client`

### Slack
- [Slack MCP Server Overview](https://docs.slack.dev/ai/slack-mcp-server/)
- [Developing Agents | Slack](https://docs.slack.dev/ai/developing-agents)
- [Slack MCP + Real-Time Search API](https://slack.com/blog/news/mcp-real-time-search-api-now-available)
- Official MCP endpoint: `https://mcp.slack.com/mcp` (Streamable HTTP)
- Auth: OAuth 2.0, `https://slack.com/oauth/v2_user/authorize`
- Community: `@modelcontextprotocol/server-slack` (archived), `korotovsky/slack-mcp-server` (15 tools, 1,400+ stars)

### Security References
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP Transport Layer Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html)
- [RFC 9700 — OAuth 2.0 Security BCP](https://datatracker.ietf.org/doc/rfc9700/)
- [CWE-214 — Visible Sensitive Information in Process](https://cwe.mitre.org/data/definitions/214.html)
- [CWE-532 — Sensitive Information in Log File](https://cwe.mitre.org/data/definitions/532.html)
- [MCP Security Best Practices](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices)

---

## Appendix B: Review Audit Trail

This document was independently reviewed by 5 specialized agents across 2 sessions:

**Round 1 (2026-04-07) — 4 parallel agents:**

| Reviewer | Findings | Key Corrections Applied |
|----------|----------|------------------------|
| **Security Auditor** | 1 critical, 7 high, 8 medium, 2 low | LiteLLM supply chain warning, token storage hardening, PKCE enforcement, TLS mandate, audit logging, CAE |
| **Architecture Reviewer** | 6 findings | Phase order swapped (SSO first), Strangler Fig migration, flat file structure, Drizzle DB for state, offline resilience, MCP-first wrong for Graph |
| **LiteLLM Validator** | 4 confirmed, 2 corrected | `/anthropic` passthrough path, `sk-` key format, `/health/liveliness` endpoint |
| **Microsoft/Slack Validator** | 5 confirmed, 2 partially correct, 1 unverifiable | Microsoft MCP scope narrower than implied, Slack repo name corrected, paid plan unverified |

**Round 2 (2026-04-08) — superpowers:code-reviewer (cross-referenced against codebase):**

| Reviewer | Findings | Key Corrections Applied |
|----------|----------|------------------------|
| **Code Reviewer** | 2 critical, 6 important, 5 minor, 5 recommendations | Linux `safeStorage` platform guidance (C1), Slack PKCE feasibility spike (C2), Phase 0 cleanup added, method mapping table (I3), draft Drizzle schema (I2), MSAL loopback isolation (I1), context isolation note (I6), Microsoft MCP URL volatility (M5) |

**Round 3 (2026-04-08) — Spike resolution via targeted research:**

| Spike | Status | Resolution |
|-------|--------|-----------|
| **Slack PKCE public client** | ✅ RESOLVED | Slack released PKCE as GA on 2026-03-30. Self-serve toggle in app settings. Two integration paths documented: paste-token MVP (recommended) or first-class OAuth. Limitations documented (user scopes only, 30-day rotation, one-way toggle). Reference implementations provided. |
| **Linux `safeStorage`** | ✅ RESOLVED | Known issue with documented mitigations. Layered strategy adopted: VS Code modal + Signal integrity check + teams-for-linux fallback + CLI flag for headless. `keytar` alternative (`keyring-node`) identified for future-proofing. |

**Round 4 (2026-04-08) — Comprehensive 5-Phase Review (11 reviewers, 135 findings):**

| Phase | Reviewer(s) | Findings | Top Items Applied to v5 |
|-------|------------|----------|-------------------------|
| **Phase 1: Quality + Architecture** | code-reviewer + architect-review | 23 (5H, 9M, 9L) | Q-H1 second token log, Q-H2 fictional method, Q-M1 call site count, Q-M2 file misattribution |
| **Phase 2: Security + Performance** | security-auditor + performance-engineer | 30 (2C, 9H, 12M, 7L) | S-C1 dead code deletion, S-C2 corrected (already patched), S-H1-5, P-H1-4 |
| **Research: Remediation** | 4 parallel research agents | 4 critical findings remediated | S-C2 reclassified, S-H2/3 protocols documented, S-C1 dead code finding |
| **Phase 3: Testing + Documentation** | test-automation + docs-architect | 39 (5C, 14H, 13M, 7L) | T-C1 test framework, T-C2 regression guards, D-C1 OpenSpec, D-H1 glossary |
| **Phase 4: Best Practices + DevOps** | framework-pro + devops-engineer | 43 (3C, 13H, 16M, 11L) | F-H1 Electron Fuses, F-H5 CSP, F-M8/9 MSAL version corrections, D-C1/2/3 CI/CD |
| **Phase 5: Final Report** | (synthesis) | 135 cumulative | All applied to this v5 |

**Verdict (Round 4):** Strategy is fundamentally sound but had **10 Critical findings** blocking implementation. v5 applies all P0 fixes inline. Phase 0 (Foundation) is now BLOCKING — must complete before any auth migration. Alternative architecture (Envoy Gateway dual-auth) documented separately at `.scratchpad/../enterprise/auth-strategy.md`.

---

## Section 5.11: Test Strategy (NEW in v5)

> **Source: Phase 3A T-C1, T-C2, T-H1-6, T-M1-4** + Phase 4A F-H3 + Phase 4B D-C3

### Test Framework Stack

| Layer | Framework | Purpose | Phase |
|-------|-----------|---------|-------|
| **Main process** | `bun:test` | Unit + integration | Phase 0 |
| **Renderer** | `vitest ^1.6` | React 19, Jotai, React Query | Phase 1 |
| **E2E** | `@playwright/test` + Electron | OAuth flows, full app | Phase 1 |
| **HTTP mocking** | `msw` (Mock Service Worker) | Graph, LiteLLM, Slack | Phase 1 |
| **Performance** | `tinybench` | Single-flight, decrypt cost | Phase 2 |

### Required Mock Fixtures

| Fixture | Implementation | Required For |
|---------|---------------|--------------|
| Mock Entra ID | `oidc-provider` Docker container | Phase 1 |
| Mock LiteLLM | `fastify` stub serving `/health/liveliness`, `/v1/chat/completions`, `/anthropic/v1/messages` | Phase 2 |
| Mock Slack OAuth | MSW handler for `oauth.v2.access` | Phase 3 |
| Mock Microsoft Graph | MSW handler for `/me`, `/me/messages`, `/me/sendMail` | Phase 4 |
| Test secrets | `.env.test` (gitignored) | All phases |

### Test Tenant Strategy

- **Entra ID dev tenant** (`1code-dev.onmicrosoft.com`) — free tier sufficient
- **Test Slack workspace** (`1code-test.slack.com`) — free tier
- **Local LiteLLM** Docker with pinned `v1.83.0`
- **CI matrix:** macOS + Linux (safeStorage parity)

### Critical Tests Required Before Phase 1

- **T-H1:** Flow-registry state isolation (per-provider Maps, prefix mismatch rejection, cancellation, timeout)
- **T-H2:** CAE heartbeat protocol (heartbeat fires every 30s, 401 claims challenge aborts, 10-min cap, sessionId resume)
- **T-H3:** Single-flight token refresh (100 concurrent callers → 1 network call)
- **T-H4:** Entra E2E with mock IdP (Playwright + `oidc-provider`)
- **T-H5:** safeStorage backend integrity check (Signal-style mismatch detection)
- **T-H6:** Strangler Fig adapter contract (`EnterpriseAuth` interface parity with `AuthManager`)

### CI Pipeline

```yaml
# .github/workflows/ci.yml
strategy:
  matrix: { os: [ubuntu-latest, macos-latest] }
steps:
  - bun install --frozen-lockfile
  - bun audit --high                    # P0-9 CVE gate
  - bun run ts:check                    # tsgo strict
  - bun run lint                        # ESLint + token-preview rule
  - bun test                            # Unit/integration
  - bun run build                       # Compile check
  - bun test src/main/__tests__/phase0-deletions.test.ts  # P0-8 regression guards
  - bun playwright test tests/e2e/entra-flow.spec.ts      # Smoke test (Linux only)
```

**Total test infrastructure effort:** ~4 person-weeks

**BLOCKING:** Do NOT start Phase 1 (Entra SSO) until T-C1, T-C2, T-H6, and mock fixtures are in place.

---

## Section 9: Operations (NEW in v5)

> **Source: Phase 3B D-H7** + Phase 4B D-H1-8

### 9.1 Entra ID App Registration

Required app registrations in Entra admin center:

**Native client (Electron app):**
- Type: Mobile and desktop application
- Redirect URI: `http://localhost` (no port — MSAL Node loopback)
- Allow public client flows: Yes
- Required permissions: `User.Read`, `Mail.Read`, etc. (incremental consent)
- Enable CAE: `clientCapabilities: ["cp1"]` in MSAL config

**Recommendation:** Manage via Bicep or `azuread` Terraform provider, NOT manually (Phase 4 D-H6).

### 9.2 LiteLLM Deployment

- Pin to `>= 1.83.0` (post-supply-chain compromise)
- Verify PyPI signatures or use vetted container image
- Restrict `/config/update` to admin-only
- Master key in env var only, never YAML
- Enable Presidio guardrails for PII masking
- Enable HTTP/2 + TLS 1.3 session resumption

### 9.3 Per-Phase Rollback Matrix

| Phase | Rollback Mechanism | Data Migration |
|-------|-------------------|----------------|
| Phase 0 cleanup | `git revert` of deletion commits | None |
| Phase 0.5 Electron 41 | `git revert` package.json + lockfile | None |
| Phase 1 Entra SSO | Feature flag `ENTERPRISE_AUTH_ENABLED=false` → falls back to `auth-manager.ts` adapter | None — both stores coexist |
| Phase 2 LiteLLM | Settings: `LITELLM_PROXY_ENABLED=false` → use direct API keys (existing fallback) | None |
| Phase 3 Slack | Disable Slack MCP server in LiteLLM config | Token rows in `integration_connections` deactivated |
| Phase 4 Microsoft Graph | Disable Microsoft Graph router | Token rows in `integration_connections` deactivated |

### 9.4 Troubleshooting Runbooks

**Token refresh failure storm:**
- Symptom: Many users fail to refresh simultaneously
- Diagnosis: Check Entra ID throttling (HTTP 429 from STS)
- Fix: Verify single-flight pattern is working; check exponential backoff with jitter

**CAE revocation not detected:**
- Symptom: Revoked user can still access AI for up to 60 minutes
- Diagnosis: Verify `clientCapabilities: ["cp1"]` in MSAL config; check heartbeat fires
- Fix: Enable CP1; verify `/api/auth/desktop/ping` endpoint advertises CAE

**OAuth dispatcher state confusion:**
- Symptom: Unexpected callback received during flow
- Diagnosis: Check `pending*Flows` registry; verify state prefix matches provider
- Fix: Per-provider state tables (S-H2 remediation)

**Linux `safeStorage` backend changed:**
- Symptom: User reports "Session ended" after switching desktop environment
- Diagnosis: Compare stored `safe_storage_backend` to current `getSelectedStorageBackend()`
- Fix: Force re-auth (Signal pattern) — by design, prevents silent security downgrade

### 9.5 Incident Response

**S-C1 recurrence (raw token via IPC):**
- Detection: ESLint rule should catch reintroduction; CI gate fails
- Containment: Block PR merge; revert if shipped
- Eradication: Re-delete IPC handler
- Recovery: Force token rotation for affected users
- Lessons learned: Strengthen ESLint rule

**LiteLLM proxy compromise:**
- Detection: Anomalous spend logs, unexpected API calls
- Containment: Rotate master key, invalidate all virtual keys
- Eradication: Verify container image checksum, redeploy
- Recovery: Issue new virtual keys to users
- Lessons learned: SLSA provenance verification, container digest pinning

---

## Section 10: User Migration Guide (NEW in v5)

> **Source: Phase 3B D-H8**

### Breaking Changes

| Change | Impact |
|--------|--------|
| `auth-manager.ts` deleted (after Strangler Fig migration complete) | Users with cached 21st.dev tokens forcibly signed out |
| 21st.dev API endpoints removed | No more 21st.dev account linking |
| PostHog analytics removed | No more product analytics |
| Sentry crash reporting removed (or made configurable) | Crashes no longer auto-reported |

### Migration Wizard Spec

**On first launch after Phase 1 ships:**
1. Detect old `auth.dat` file in userData directory
2. Show modal: "1Code has migrated to enterprise sign-in. Please sign in with your corporate Microsoft account."
3. Trigger MSAL sign-in flow
4. On success: link existing chats/projects to new account ID
5. Delete old `auth.dat` after 7-day grace period (in case user wants to roll back)

### Data Retention

| Data | Retention |
|------|-----------|
| Old `auth.dat` file | 7 days after migration |
| Old `anthropic_accounts` rows | Retained (still needed for direct Anthropic API access) |
| Old `claude_code_credentials` row | Retained (legacy fallback) |
| Audit logs | 400 days (per Section 7.4) |

### Draft CHANGELOG Entry

```markdown
## v0.0.73 — Enterprise Auth Migration

### Breaking Changes

- **Authentication migrated to Microsoft Entra ID SSO.** Users with cached 21st.dev sessions will be prompted to sign in with their corporate Microsoft account on first launch.
- **PostHog analytics removed.** Telemetry now configurable via enterprise settings.
- **Sentry crash reporting removed by default.** Can be enabled in settings if needed.

### New Features

- **LiteLLM proxy support** — route AI traffic through company gateway with per-user budgets
- **Enterprise SSO** via Microsoft Entra ID with PKCE
- **CAE-aware token refresh** for near-real-time revocation
- **Hardened Electron binary** with Fuses + ASAR integrity (CVE-2025-55305 mitigation)
- **Upgraded to Electron 41** from 39 (EOL)

### Security Fixes

- Removed raw OAuth token exposure via IPC (CVSS 9.0 — was dead code)
- Removed token preview logging (CWE-532 / CWE-312)
- Tightened CSP (no more `unsafe-inline` / `unsafe-eval`)
- Hardened IPC sender validation (`event.senderFrame.url`)

### Known Issues

- macOS only for initial release; Windows + Linux to follow
- CAE detection requires Microsoft Entra ID free tier or higher
```

---

## Section 11: Documentation Maintenance Plan (NEW in v5)

> **Source: Phase 3B D-M1**

| Phase | File | Change |
|-------|------|--------|
| 0 | `CLAUDE.md` § Architecture | Remove `credential-manager.ts` reference |
| 0.5 | `CLAUDE.md` § Environment | Remove "Vite must stay on 6.x" note |
| 0.5 | `CLAUDE.md` § Tech Stack | Update Electron 39 → 41 |
| 1 | `CLAUDE.md` § Database | Add `enterprise_credentials`, `integration_connections` |
| 1 | `CLAUDE.md` § Important Files | Add `enterprise-auth.ts`, `flow-registry.ts` |
| 1 | `openspec/project.md` | Replace "Auth via OAuth" with "Auth via Microsoft Entra SSO" |
| 1 | `.serena/memories/codebase_structure.md` | Add new files and tables |
| 1 | `.serena/memories/environment_and_gotchas.md` | Add `@azure/msal-node-extensions` to electron-rebuild list |
| 1 | `CONTRIBUTING.md` | Update auth setup section |
| 1 | `README.md` | Add enterprise fork disclaimer |
| 1 | (new) `CHANGELOG.md` | Create with v0.0.73 entry |
| 2 | `CLAUDE.md` § Tech Stack | Add LiteLLM row |
| 3 | `CLAUDE.md` § Tech Stack | Add Slack MCP row |
| 4 | `CLAUDE.md` § Tech Stack | Add `@azure/msal-node` row |
