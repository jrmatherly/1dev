## Why

An 8-agent comprehensive code review (`.full-review/05-final-report.md`, 2026-04-12) identified 112 de-duplicated findings across security, performance, code quality, CI/CD, documentation, testing, architecture, and best practices. Cross-referencing each finding against the codebase confirmed 6 P0 items that block production deployment (SSRF via signedFetch, unrestricted shell.openExternal, undeployed SecurityPolicy, disabled CiliumNetworkPolicy default-deny, stale Phase 0 gates doc, non-blocking audit gate), plus 12 high-impact/low-effort quick wins, 12 medium-term improvements, and 8 long-term roadmap items. Addressing these findings now — while the codebase is stable at TS baseline 0, Phase 0 15/15, and v0.0.82 freshly released — provides the best risk-to-effort ratio before production deployment.

## What Changes

### Phase A — Immediate (P0, before production)
- **URL allowlist on signedFetch/streamFetch** — restrict `api:signed-fetch` and `api:stream-fetch` IPC handlers to the configured API base URL origin. Add regression guard. [S-C1, T-C1]
- **Scheme validation on shell.openExternal** — create `safeOpenExternal()` utility restricting to `https:`/`http:`/`mailto:` schemes. Apply to all 6 call sites (especially the unvalidated `external.openExternal` tRPC endpoint). Add regression guard. [S-C2, T-C2]
- **Promote SecurityPolicy from draft** — rename `securitypolicy.draft.yaml` → `securitypolicy.yaml`, add to `kustomization.yaml`. [S-C3, CD-C4] *Cross-repo: `deploy/`*
- **Enable CiliumNetworkPolicy default-deny** — set `enableDefaultDeny: { egress: true, ingress: true }`. [S-H2, CD-H1] *Cross-repo: `deploy/`*
- **Fix Phase 0 gates page** — update `docs/enterprise/phase-0-gates.md` subtitle from "12 of 15" to "15 of 15". [D-C1]
- **Make bun audit blocking for HIGH+ severity** — change CI audit step from `|| true` to fail on high-severity direct-dependency advisories. [CD-C1]

### Phase B — Quick Wins (high impact, low effort)
- **Cache AuthStore token in memory** — eliminate sync disk I/O + crypto on every `getValidToken()` call in legacy auth path. [P-C1]
- **Cache getFlag() results** — load all flag overrides into a Map at startup, invalidate on set/clear. [P-C2]
- **Add FK indexes** — `chats.projectId`, `subChats.chatId` + `bun run db:generate`. [P-C3]
- **Add SQLite pragmas** — `busy_timeout=5000`, `synchronous=NORMAL`, `cache_size=-8000`. [P-M4]
- **Fix stale TS baseline docs** — update `docs/conventions/quality-gates.md` from "~87" to "0". [D-C2]
- **Add WebkitAppRegion type augmentation** — create `.d.ts` file, remove 41 `@ts-expect-error` comments. [BP-H3]
- **Delete makeKeyPreview duplicate** — import from `key-service.ts` in `provisioning.ts`. [H-2]
- **Remove @prisma/client from vite externals** — leftover from upstream. [BP-M2]
- **Remove or apply loggedProcedure** — dead middleware in tRPC setup. [BP-M1]
- **Fix stale upstream features doc** — update any remaining `21st.dev` base URLs. [D-H5]
- **Set readOnlyRootFilesystem: true** — add emptyDir for /tmp in k8s deployment. [CD-H2] *Cross-repo: `deploy/`*
- **Pin Dockerfile base images** — pin `oven/bun:1` and `gcr.io/distroless/nodejs22-debian12` to digest hashes. [CD-H4]

### Phase C — Medium-term (next 2-4 sprints)
- **Remove unsafe-eval from CSP** — make CSP dynamic based on PostHog configuration. [S-H1]
- **Add SAST to CI** — CodeQL or Semgrep + Trivy container scanning. [CD-C2]
- **Extract claude.ts into sub-modules** — prompt-parser, session-manager, mcp-resolver, tool-executor (3,298-line god object). [C-1]
- **Create safeJsonParse() utility** — replace 8+ unguarded JSON.parse sites in DB deserialization. [H-4, S-M3]
- **Add authedProcedure tRPC middleware** — centralized auth guard for defense-in-depth. [S-H4, A-6]
- **Add renderer bundle splitting** — manualChunks for Monaco/mermaid/katex/cytoscape (15MB bundle). [P-H5]
- **Test mcpServerUrlSchema** — 97-line SSRF prevention function with zero tests. [T-H3]
- **Fill architecture doc stubs** — 5 of 8 pages are stubs, content exists in CLAUDE.md/memories. [D-H1]
- **Re-verify sandbox: true compatibility** — test with current trpc-electron. [S-H3]
- **Address 96 `as any` casts** — systematic sweep per-directory. [H-3]
- **Reduce verbose debug logging** — audit console.log/error for infra URL exposure. [C-3]
- **Add SOPS .gitignore guards** — protect against accidental plaintext credential commit. [CD-H3]

### Phase D — Long-term (roadmap entries)
- Decompose active-chat.tsx (8,743 lines, 71 atoms, 67 useEffects). [C-2, P-H6]
- Adopt React 19 features (lazy/Suspense, useTransition, use()). [BP-H1]
- Enable additional TS strictness (noUncheckedIndexedAccess, exactOptionalPropertyTypes). [BP-H2]
- Restructure provisioning.ts transaction (external API calls outside DB transaction). [P-H3]
- Wire integration tests into CI (docker-compose + scheduled workflow). [CD-M1, T-M3]
- Add renderer test infrastructure (vitest + @testing-library/react). [T-H1]
- Empty catch block audit (~79 sites). [H-5]
- Reduce unbounded module-level Maps (LRU eviction). [P-H4]

## Capabilities

### New Capabilities
- `electron-security-hardening`: URL allowlisting for signedFetch/streamFetch, scheme validation for shell.openExternal, CSP hardening, sandbox re-evaluation — covers the Electron-specific security surface that compounds XSS into OS-level compromise
- `sqlite-performance`: FK indexes, SQLite pragmas, getFlag() caching — covers the SQLite performance optimization surface for the local-first database layer

### Modified Capabilities
- `credential-storage`: AuthStore in-memory cache requirement (P-C1 — eliminates sync disk I/O on every getValidToken() call)
- `self-hosted-api`: SecurityPolicy promotion, CiliumNetworkPolicy default-deny, readOnlyRootFilesystem, Dockerfile pin, makeKeyPreview dedup, SOPS .gitignore guards
- `documentation-site`: Phase 0 gates page fix (12/15 → 15/15), TS baseline doc fix (~87 → 0), architecture doc stubs, upstream features doc stale URLs

## Impact

**Affected code:**
- `src/main/windows/main.ts` — signedFetch/streamFetch URL allowlist (Phase A)
- `src/main/lib/trpc/routers/external.ts` — safeOpenExternal wrapper (Phase A)
- `src/main/auth-manager.ts`, `src/main/lib/enterprise-auth.ts`, `src/main/lib/mcp-auth.ts`, `src/main/lib/oauth.ts`, `src/main/lib/git/git-operations.ts` — safeOpenExternal at all shell.openExternal call sites (Phase A)
- `src/main/lib/feature-flags.ts` — getFlag() cache (Phase B)
- `src/main/lib/db/schema/index.ts` — FK indexes (Phase B)
- `src/main/lib/trpc/routers/claude.ts` — god object decomposition (Phase C, 3,298 lines)
- `src/renderer/features/agents/main/active-chat.tsx` — component decomposition (Phase D, 8,743 lines)
- `src/renderer/index.html` — CSP meta tag (Phase C)
- `electron.vite.config.ts` — remove @prisma/client, add manualChunks (Phase B + C)
- `.github/workflows/ci.yml` — audit gate, SAST integration (Phase A + C)
- `deploy/kubernetes/1code-api/app/` — SecurityPolicy, CiliumNetworkPolicy, HelmRelease, Dockerfile (Phase A + B)
- `services/1code-api/src/services/provisioning.ts` — makeKeyPreview dedup (Phase B), transaction restructure (Phase D)
- `docs/enterprise/phase-0-gates.md`, `docs/conventions/quality-gates.md`, `docs/architecture/` stubs (Phase A + B + C)
- `tests/regression/` — 3+ new guards (signedFetch allowlist, openExternal scheme, mcpServerUrlSchema) (Phase A + C)

**Dependencies:** None added or removed. Existing `posthog-js`/`posthog-node` stay (env-var-driven per PR #16).

**tRPC routers affected:** `external` (safeOpenExternal), `claude` (decomposition), potentially new `authedProcedure` middleware on all 22 routers.

**Database:** Schema change (Phase B) — FK indexes on `chats` and `subChats` tables + migration via `bun run db:generate`.

**Cross-repo (cluster):** SecurityPolicy promotion, CiliumNetworkPolicy default-deny, readOnlyRootFilesystem — changes in `/Users/jason/dev/ai-k8s/talos-ai-cluster/` deploy manifests.
