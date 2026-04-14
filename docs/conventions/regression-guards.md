---
title: Regression Guards
icon: shield
---

# Regression Guards {subtitle="bun:test structural guards under tests/regression/"}

The fork maintains structural regression guards that protect invariants established by Phase 0 hard gates, the brand taxonomy, and the documentation-site capability. Each guard is a single-file `bun:test` test that walks the codebase and fails if a protected invariant is violated.

## Current Inventory (34 guards + 1 unit test = 35 files) {#current-inventory}

| File | Protects | Motivated by |
|------|----------|-------------|
| `auth-get-token-deleted.test.ts` | Dead `auth:get-token` IPC handler stays deleted | Phase 0 gates #1-4 |
| `token-leak-logs-removed.test.ts` | No token preview / credential fragments in logs across `src/main/` | Phase 0 gates #5-6 |
| `credential-manager-deleted.test.ts` | Orphan `credential-manager.ts` stays deleted | tscheck remediation R1 |
| `gpg-verification-present.test.ts` | GPG signature verification in Claude binary download script | Phase 0 gate #7 |
| `no-upstream-sandbox-oauth.test.ts` | Upstream sandbox OAuth code stays removed from `claude-code.ts` | Phase 0 gate #8 |
| `feature-flags-shape.test.ts` | Feature flag key shape in `FLAG_DEFAULTS` matches spec | Phase 0 gate #12 |
| `brand-sweep-complete.test.ts` | No Tier A (upstream brand) identifiers in runtime code/scripts | rebrand-residual-sweep |
| `no-scratchpad-references.test.ts` | No `.scratchpad/` path references in tracked files | documentation-site capability |
| `mock-api-no-snake-timestamps.test.ts` | No `created_at`/`updated_at` snake_case timestamp translation in mock-api consumers | retire-mock-api-translator |
| `credential-storage-tier.test.ts` | No direct `safeStorage.*` calls outside `credential-store.ts` | harden-credential-storage |
| `enterprise-auth-module.test.ts` | MSAL enterprise auth module shape (exports, config, no CP1) | add-enterprise-auth-module |
| `enterprise-auth-wiring.test.ts` | Enterprise auth wiring invariants (exports, STRIPPED_ENV_KEYS, imports, router, no TOKEN_FILE injection) | wire-enterprise-auth |
| `login-flow-uses-msal.test.ts` | Login button wired to MSAL (no dead `/auth/desktop?auto=true` URL, `startAuthFlow()` throws typed `AuthError`, dev-only `ENTERPRISE_AUTH_ENABLED` env override scoped to `!app.isPackaged`, `auth:start-flow` IPC handler validates sender + targets `event.sender.send`, `.env.example` documents Entra vars, `login.html` uses canonical 1Code SVG with a11y attrs + accessible toast + safe text-only DOM) | wire-login-button-to-msal |
| `electron-version-pin.test.ts` | Electron version pin matches expected major version | upgrade-electron-40 |
| `mock-api-consumer-migration.test.ts` | No mock-api imports / api.agents.* / utils.agents.* in migrated consumers; message-parser.ts exports verified | migrate-mock-api-consumers |
| `1code-api-single-replica.test.ts` | 1code-api HelmRelease pins `controllers['1code-api'].replicas = 1` (prevents duplicate cron runs before distributed-lock machinery is added) | add-1code-api-litellm-provisioning (Decision 10) |
| `no-gray-matter.test.ts` | No direct `gray-matter` / `front-matter` imports in `src/main/**` outside the canonical shim at `src/main/lib/frontmatter.ts`; root `package.json` does not declare `gray-matter` | replace-gray-matter-with-front-matter |
| `open-external-scheme.test.ts` | All `shell.openExternal` calls go through `safeOpenExternal()` scheme-validator in `src/main/lib/safe-external.ts` | security-hardening Phase A |
| `signed-fetch-allowlist.test.ts` | `api:signed-fetch` / `api:stream-fetch` IPC handlers validate URL origin against `getApiUrl()` before attaching auth token | security-hardening Phase A |
| `mcp-url-ssrf-prevention.test.ts` | `mcpServerUrlSchema` blocks SSRF vectors — loopback, RFC1918 private networks, cloud metadata endpoints, IPv6 ULA/link-local, and non-http(s) schemes | security-hardening Phase C §6 |
| `spawn-env-invariants.test.ts` | Per-`ProviderMode` expected-key-set matrix for Claude CLI spawn env (subscription-direct, subscription-litellm, byok-direct, byok-litellm) + `sk-ant-*` prefix check for byok-litellm leaks | add-dual-mode-llm-routing |
| `no-entra-in-anthropic-auth-token.test.ts` | `applyEnterpriseAuth` body + project-wide scan for Entra-to-ANTHROPIC_AUTH_TOKEN assignment (bind-then-assign forbidden in either direction) | remediate-dev-server-findings |
| `no-legacy-litellm-proxy-url.test.ts` | No legacy LiteLLM proxy URL constants in runtime code | add-dual-mode-llm-routing |
| `no-migrate-legacy.test.ts` | Legacy `migrateLegacy` code path stays removed (dual-mode routing) | add-dual-mode-llm-routing |
| `raw-logger-concurrent-writes.test.ts` | Shape guard for singleton-promise pattern in `raw-logger.ts` (`logsDirPromise` replaced `logsDir: string \| null` — prevents concurrent-write race) | remediate-dev-server-findings Group 2 |
| `no-legacy-oauth-byok-leak.test.ts` | BYOK accounts skip the legacy OAuth token fallback in `getClaudeCodeToken()` (early-return branch before fallback, literal `"byok"` comparison) | remediate-dev-server-findings Group 6 |
| `aux-ai-provider-dispatch.test.ts` | `src/main/lib/aux-ai.ts` shape: DI factory exports, per-ProviderMode-kind branches, customerId header, model resolution precedence (flag → modelMap → default), `auxAiEnabled` kill-switch in both factories, hardcoded max_tokens/temperature, 25-char truncated fallback | remediate-dev-server-findings Group 13 |
| `no-apollosai-aux-ai-fetch.test.ts` | Zero references to `apollosai.dev/api/agents/generate-commit-message` or `apollosai.dev/api/agents/sub-chat/generate-name` in `chats.ts` or `aux-ai.ts`; positive control verifies chats.ts delegates to aux-ai | remediate-dev-server-findings Group 14 |
| `signed-fetch-cache.test.ts` | `checkUpstreamGate` + `isUpstreamDisabled` helpers exist, silent `\|\| "https://apollosai.dev"` fallback removed, `unreachableCache` Map with 60s TTL, `recordUnreachable` called on ECONNREFUSED/ENOTFOUND in both handlers | remediate-dev-server-findings Group 15 |
| `litellm-models-router.test.ts` | `litellmModelsRouter` shape: env-var read (not hardcoded URL), Bearer auth, 401/403 → UNAUTHORIZED, network failure → BAD_GATEWAY, malformed body → UNPROCESSABLE_CONTENT, `{ id }` projection, createAppRouter mount | add-dual-mode-llm-routing Group 8 |
| `subscription-lock-model-picker.test.ts` | `new-chat-form.tsx` declares `canAddModels` gate referencing both `accountType === "claude-subscription"` and `enterpriseAuthEnabled`; `onOpenModelsSettings` prop conditionally withheld via `canAddModels`; `activeAccount` fed by `trpc.anthropicAccounts.getActive.useQuery` | add-dual-mode-llm-routing Group 9 |
| `preferred-editor-reflects-installed.test.ts` | `preferredEditorAtom` default is `null` (not hardcoded `"cursor"`), `findInstalledEditors` uses `which`-based PATH detection, `getOsDefaults` tRPC procedure exists, fail-closed filter prevents uninstalled editors from appearing | fix-preferred-editor-detection |
| `graph-profile-404-fallback.test.ts` | `graph-profile.ts` shape: `/me/photo/$value` endpoint URL, 404 + 403 → null (no throw), `fetchAvatarDataUrl` never throws on any status, `Promise.all` parallel dispatch, `GraphProfileError` for `/me` failures only | add-entra-graph-profile |
| `graph-avatar-data-url-shape.test.ts` | `graph-profile.ts` base64 data-URL construction (`Buffer.from(arrayBuffer).toString("base64")` + `data:${contentType};base64,${base64}`), `content-type → image/jpeg` fallback, `AvatarWithInitials` component FNV-1a determinism (2166136261 offset + 16777619 prime, no `Math.random`), initials fallback chain (displayName → email local-part → "?") | add-entra-graph-profile |
| `frontmatter-shim-shape.test.ts` (unit test, not a guard) | Round-trip behavior of the canonical frontmatter shim across standard YAML, empty frontmatter, empty string, BOM-prefixed input, and a sample agent fixture | replace-gray-matter-with-front-matter |

## Adding a New Guard

Use the `new-regression-guard` skill (`.claude/skills/new-regression-guard/SKILL.md`) to scaffold. It mirrors the existing walker pattern and enforces:

- **File-level allowlists** (not line-number) — survives edits within the allowlisted file
- **Every allowlist entry has a comment** explaining why the file is exempt
- **Structured error messages** with count, file:line list, truncated snippet, actionable next step, and a reference to the motivating change
- **Side-effect free**, no network access, runs in <200ms
- **Update this page** (`docs/conventions/regression-guards.md`) — the canonical guard inventory — and any mirror surface that cites a count

## Running

```bash
bun test                                              # all guards
bun test tests/regression/brand-sweep-complete.test.ts  # single guard
```
