## 1. Phase A — Immediate Security + CI (P0)

- [x] 1.1 Create `src/main/lib/safe-external.ts` with `safeOpenExternal()` utility — validates URL scheme (`https:`, `http:`, `mailto:` only), throws on blocked schemes
- [x] 1.2 Replace `shell.openExternal` at `src/main/lib/trpc/routers/external.ts:132` with `safeOpenExternal()`
- [x] 1.3 Replace `shell.openExternal` at `src/main/auth-manager.ts:378` with `safeOpenExternal()`
- [x] 1.4 Replace `shell.openExternal` at `src/main/lib/enterprise-auth.ts:141` with `safeOpenExternal()`
- [x] 1.5 Replace `shell.openExternal` at `src/main/lib/mcp-auth.ts:258` with `safeOpenExternal()`
- [x] 1.6 Replace `shell.openExternal` at `src/main/lib/oauth.ts:809` with `safeOpenExternal()`
- [x] 1.7 Replace `shell.openExternal` at `src/main/lib/git/git-operations.ts:626` with `safeOpenExternal()`
- [x] 1.8 Add `tests/regression/open-external-scheme.test.ts` — scans `src/main/` for direct `shell.openExternal` imports outside `safe-external.ts`
- [x] 1.9 Add URL origin allowlist to `api:signed-fetch` handler in `src/main/windows/main.ts` — validate against `getApiUrl()` origin before attaching auth token
- [x] 1.10 Add URL origin allowlist to `api:stream-fetch` handler in `src/main/windows/main.ts` — same validation as 1.9
- [x] 1.11 Add `tests/regression/signed-fetch-allowlist.test.ts` — verifies signedFetch handler contains URL origin validation
- [x] 1.12 Update `docs/enterprise/phase-0-gates.md` — change subtitle from "12 of 15 complete" to "15 of 15 complete", update table to show all 15 gates as Done
- [x] 1.13 Update `.github/workflows/ci.yml` audit step — replace `|| true` with severity-gated failure (fail on high-severity direct-dependency advisories only)
- [ ] 1.14 Rename `deploy/kubernetes/1code-api/app/securitypolicy.draft.yaml` → `securitypolicy.yaml` *(cross-repo: cluster)*
- [ ] 1.15 Add `securitypolicy.yaml` to `deploy/kubernetes/1code-api/app/kustomization.yaml` resources list *(cross-repo: cluster)*
- [ ] 1.16 Change `deploy/kubernetes/1code-api/app/ciliumnetworkpolicy.yaml` — set `enableDefaultDeny: { egress: true, ingress: true }` *(cross-repo: cluster)*
- [ ] 1.17 Verify CiliumNetworkPolicy allow rules cover all legitimate traffic (DNS, PostgreSQL, LiteLLM, health probes, Envoy Gateway ingress) *(cross-repo: cluster)*
- [x] 1.18 Run all 6 quality gates after Phase A changes: `bun run ts:check && bun run lint && bun run build && bun test && bun audit && (cd docs && bun run build)`

## 2. Phase B — Quick Wins: Performance

- [ ] 2.1 Add in-memory token cache to `src/main/auth-manager.ts` for legacy auth path — cache decrypted token, invalidate on write/logout
- [ ] 2.2 Add in-memory flag cache to `src/main/lib/feature-flags.ts` — load all overrides into `Map` at startup, update cache on `setFlag()`/`clearFlag()`
- [ ] 2.3 Add index declaration for `chats.projectId` in `src/main/lib/db/schema/index.ts`
- [ ] 2.4 Add index declaration for `subChats.chatId` in `src/main/lib/db/schema/index.ts`
- [ ] 2.5 Run `bun run db:generate` to produce the FK index migration
- [ ] 2.6 Add SQLite pragmas (`busy_timeout=5000`, `synchronous=NORMAL`, `cache_size=-8000`) to database initialization in `src/main/lib/db/index.ts`
- [ ] 2.7 Run `db-schema-auditor` subagent to verify schema ↔ migration ↔ doc consistency after index + pragma changes

## 3. Phase B — Quick Wins: Types + Code Quality

- [ ] 3.1 Create `src/renderer/types/css.d.ts` with `WebkitAppRegion` module augmentation for React CSSProperties
- [ ] 3.2 Remove all 41 `@ts-expect-error` comments for WebkitAppRegion across `src/renderer/`
- [ ] 3.3 Verify TS baseline remains at 0 after removing @ts-expect-error comments
- [ ] 3.4 Delete local `makeKeyPreview` function in `services/1code-api/src/services/provisioning.ts`
- [ ] 3.5 Import `_makeKeyPreview` from `./key-service` in `services/1code-api/src/services/provisioning.ts`
- [ ] 3.6 Remove `"@prisma/client"` from `rollupOptions.external` in `electron.vite.config.ts`
- [ ] 3.7 Remove or apply `loggerMiddleware` in `src/main/lib/trpc/index.ts` — either delete it or apply it to a procedure subset
- [ ] 3.8 Run all 6 quality gates after Phase B changes

## 4. Phase B — Quick Wins: Documentation

- [ ] 4.1 Update `docs/conventions/quality-gates.md` — change TS baseline reference from "~87" to "0"
- [ ] 4.2 Verify `docs/enterprise/upstream-features.md` has no remaining `21st.dev` references — update to `apollosai.dev` if found
- [ ] 4.3 Run `cd docs && bun run build` to verify docs build passes after documentation fixes

## 5. Phase B — Quick Wins: Deployment

- [ ] 5.1 Set `readOnlyRootFilesystem: true` in `deploy/kubernetes/1code-api/app/helmrelease.yaml`
- [ ] 5.2 Add `emptyDir` volume mount for `/tmp` in the HelmRelease pod spec
- [ ] 5.3 Pin `oven/bun:1` base image to specific digest in `services/1code-api/Dockerfile`
- [ ] 5.4 Pin `gcr.io/distroless/nodejs22-debian12` base image to specific digest in `services/1code-api/Dockerfile`
- [ ] 5.5 Add Dockerfile comment documenting why each digest is pinned and when to update
- [ ] 5.6 Add `.gitignore` entries for unencrypted SOPS files: `*.dec.yaml`, `*.unencrypted.yaml`, `*.cleartext.yaml`

## 6. Phase C — CSP + CI Security

- [ ] 6.1 Audit which renderer dependencies require `unsafe-eval` (PostHog, Monaco, others?)
- [ ] 6.2 Make CSP dynamic — remove `unsafe-eval` from `src/renderer/index.html` meta tag when `VITE_POSTHOG_KEY` is not set (consider using Electron's `session.webRequest.onHeadersReceived` vs. build-time template)
- [ ] 6.3 Add SAST workflow to `.github/workflows/ci.yml` — evaluate CodeQL vs Semgrep for Electron/TypeScript coverage
- [ ] 6.4 Add Trivy container scan step to `.github/workflows/container-build.yml`
- [ ] 6.5 Test `mcpServerUrlSchema` — add unit test for the 97-line SSRF prevention function in `src/main/lib/mcp/`
- [ ] 6.6 Add regression guard for mcpServerUrlSchema test coverage

## 7. Phase C — Code Quality: claude.ts Decomposition

- [ ] 7.1 Identify extraction boundaries in `src/main/lib/trpc/routers/claude.ts` (3,298 lines) — map the ~2,000-line chat handler, prompt parsing, session management, MCP resolution, and tool execution segments
- [ ] 7.2 Extract prompt-parser module from claude.ts
- [ ] 7.3 Extract session-manager module from claude.ts
- [ ] 7.4 Extract mcp-resolver module from claude.ts
- [ ] 7.5 Extract tool-executor module from claude.ts
- [ ] 7.6 Verify claude.ts < 1,000 lines after extraction
- [ ] 7.7 Run all 6 quality gates after claude.ts decomposition

## 8. Phase C — Code Quality: Miscellaneous

- [ ] 8.1 Create `src/main/lib/safe-json-parse.ts` — typed `safeJsonParse<T>()` utility returning `T | null`
- [ ] 8.2 Replace 8+ unguarded `JSON.parse()` calls at database content deserialization sites with `safeJsonParse()`
- [ ] 8.3 Add `authedProcedure` tRPC middleware to `src/main/lib/trpc/index.ts` — centralized auth guard using `authManager.isAuthenticated()`
- [ ] 8.4 Apply `authedProcedure` to enterprise-only and security-sensitive tRPC procedures (enterprise-auth, external.openExternal, credential-sensitive operations)
- [ ] 8.5 Add `manualChunks` configuration to `electron.vite.config.ts` renderer build — split Monaco, mermaid, katex, cytoscape into lazy-loaded chunks
- [ ] 8.6 Verify bundle size reduction after splitting (target: main chunk < 5MB)
- [ ] 8.7 Address 96 `as any` casts in `src/` — systematic sweep per-directory, prioritizing security-sensitive files first
- [ ] 8.8 Audit `console.log`/`console.error` calls in `src/main/` for infra URL or error payload exposure — replace with structured logging that redacts sensitive data
- [ ] 8.9 Re-verify `sandbox: true` compatibility with current `trpc-electron` version — test BrowserWindow with `sandbox: true`
- [ ] 8.10 Fill architecture doc stubs under `docs/architecture/` — migrate content from CLAUDE.md and Serena memories to canonical pages
- [ ] 8.11 Run all 6 quality gates after Phase C changes

## 9. Phase C — Documentation

- [ ] 9.1 Fill `docs/architecture/codebase-layout.md` with full `src/` tree content (currently exists in Serena codebase_structure memory)
- [ ] 9.2 Fill `docs/architecture/database.md` with 7-table schema documentation (currently exists in CLAUDE.md + Serena)
- [ ] 9.3 Fill `docs/architecture/trpc-routers.md` with 22-router documentation (currently exists in CLAUDE.md + Serena)
- [ ] 9.4 Fill `docs/architecture/tech-stack.md` with full tech stack documentation
- [ ] 9.5 Fill `docs/architecture/upstream-boundary.md` with F-entry call site documentation
- [ ] 9.6 Run `cd docs && bun run build` to verify all architecture pages build correctly

## 10. Phase D — Long-term Roadmap Items

- [ ] 10.1 Add roadmap entry: "Decompose active-chat.tsx (8,743 lines → focused components with React.memo)" — scope: Large, prereq: Phase C claude.ts decomposition complete
- [ ] 10.2 Add roadmap entry: "Adopt React 19 features (lazy/Suspense code-splitting, useTransition for streaming, use() hook)" — scope: Large, prereq: bundle splitting complete
- [ ] 10.3 Add roadmap entry: "Enable TS strictness flags (noUncheckedIndexedAccess, exactOptionalPropertyTypes)" — scope: Medium, prereq: `as any` sweep complete
- [ ] 10.4 Add roadmap entry: "Restructure provisioning.ts transaction — move external API calls outside PostgreSQL transaction boundary (saga pattern)" — scope: Medium, prereq: none
- [ ] 10.5 Add roadmap entry: "Wire integration tests into CI — docker-compose harness + scheduled workflow for 10 skipped tests" — scope: Medium, prereq: none
- [ ] 10.6 Add roadmap entry: "Add renderer test infrastructure — vitest + @testing-library/react for critical UI paths" — scope: Large, prereq: none
- [ ] 10.7 Add roadmap entry: "Empty catch block audit (~79 sites) — add structured error logging or explicit rationale comments" — scope: Medium, prereq: none
- [ ] 10.8 Add roadmap entry: "Reduce unbounded module-level Maps in active-chat.tsx — add LRU eviction or WeakMap patterns" — scope: Medium, prereq: active-chat.tsx decomposition
- [ ] 10.9 Run `/session-sync` after adding all roadmap entries to synchronize documentation surfaces
