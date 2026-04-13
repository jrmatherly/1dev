# 1Code (ai-coding-cli) — Enterprise Fork

## Purpose
Local-first Electron desktop app for parallel AI-assisted development. Enterprise fork under apollosai.dev branding, being decoupled from upstream `1code.dev` backend.

## Tech Stack
- Electron ~41.2.0 (Node.js 24.14, Chromium 146, V8 14.6), electron-vite 5, electron-builder 26
- React 19.2.5, TypeScript 6.0.2 (upgraded from 5.9.3 on 2026-04-10), Tailwind CSS 4, Bun
- @anthropic-ai/claude-agent-sdk 0.2.104, Codex CLI 0.118.0, Ollama
- 7 Drizzle tables, 22 tRPC routers (incl. enterprise-auth), better-sqlite3, node-pty (lazy-loaded)
- **20 test files in `tests/regression/`** (19 regression guards + 1 frontmatter shim unit test) + 20 service test files in `services/1code-api/tests/` = **231 tests across 40 files** (221 pass + 10 skipped integration tests needing docker-compose harness, 2026-04-12).

## Current State (2026-04-12, post-§7 claude.ts decomposition)
- **Phase 0:** 15/15 hard gates complete
- **TS baseline: 0 errors** (reduced from 32 → 0 on 2026-04-11). Baseline file = 0; CI fails on ANY new TS error.
- **`as any` casts in src/: 96 → 3 (97% elimination)** via Phase C §8.7 sweep 2026-04-12. Only 2 legitimate SDK streaming-message escapes in claude.ts remain with justification comments.
- **claude.ts decomposition (§7):** 3,309 → 2,503 lines (−24%) via 4 new modules in `src/main/lib/claude/`: `prompt-parser` (97), `session-manager` (59), `mcp-resolver` (528), `tool-executor` (240). Target <1,000 not met — remaining bulk is the 2,003-line chat subscription handler (observer-state coupled); further decomposition deferred to P3 roadmap entry.
- **Tailwind 4.2.2:** Upgraded from 3.4.19 on 2026-04-10.
- **Vite 7.3.2 (Phase A):** Upgraded from 6.4.2 on 2026-04-10. Phase B blocked on `electron-vite 6.0.0` stable.
- **TypeScript 6.0.2:** Upgraded from 5.9.3 on 2026-04-10.
- **Electron 41.2.0:** Upgraded from 40.8.5. Auto-updater end-to-end pending packaged-build verification.
- **sandbox: true** — Empirically validated 2026-04-12 via `bun run dev` runtime test; BrowserWindow renders cleanly, tRPC IPC round-trips, contextBridge exposures intact, SDK streaming sessions complete with M:END reason=ok.
- **1code-api service + LiteLLM provisioning:** Fully shipped. `services/1code-api/` with Fastify+tRPC+Drizzle/PostgreSQL. Container: `ghcr.io/jrmatherly/1code-api`.
- **Enterprise auth:** Wired into auth-manager via Strangler Fig adapter pattern (`enterpriseAuthEnabled` flag). `authedProcedure` middleware added 2026-04-12 for signOut/refreshToken/openExternal.
- **Project-orchestrator skill** (added 2026-04-11): routing-layer skill with Step-0 hard-rule gate.
- **Dev auth bypass:** `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env`
- **Centralized roadmap:** `docs/operations/roadmap.md` — single source of truth
- **Release pipeline:** GitHub Actions `release.yml` 3-OS matrix. Current: **v0.0.85** (published 2026-04-13 — first release with full container-build pipeline green including Trivy + Cosign).
- **Active OpenSpec changes (1 as of 2026-04-13 post-archive):**
  - `upgrade-vite-8-build-stack` (15/50, Phase B blocked on electron-vite 6.0.0)
- **Recently archived:**
  - 2026-04-13 `security-hardening-and-quality-remediation` (81/81 tasks, +18 requirements promoted to baselines; created `electron-security-hardening` + `sqlite-performance` baselines; expanded `credential-storage` 7→8, `self-hosted-api` 11→17, `documentation-site` 5→9; §7 chat-handler residual tracked as P3 roadmap entry)
- **Upgrade execution order:** ~~E41~~ ✅ → ~~TS6~~ ✅ → ~~Vite7-A~~ ✅ → ~~TW4~~ ✅ → ~~Shiki4~~ ✅ → Vite8-B (blocked)
- **New main-process utilities (2026-04-12 Phase C §7+§8):**
  - `src/main/lib/claude/prompt-parser.ts` — `parseMentions()` extracted from claude.ts
  - `src/main/lib/claude/session-manager.ts` — `activeSessions`, `pendingToolApprovals`, `PLAN_MODE_BLOCKED_TOOLS`, `hasActiveClaudeSessions`, `abortAllClaudeSessions`, `clearPendingApprovals`
  - `src/main/lib/claude/mcp-resolver.ts` — `workingMcpServers`, 3 mtime caches, `mcpCacheKey`, `readProjectMcpJsonCached`, `getServerStatusFromConfig`, `fetchToolsForServer`, `getAllMcpConfigHandler`, `clearMcpResolverCaches`
  - `src/main/lib/claude/tool-executor.ts` — `createCanUseTool(ctx)` factory for the canUseTool callback (captures isUsingOllama, mode, subChatId, safeEmit, parts)
  - `src/main/lib/safe-json-parse.ts` — typed safeJsonParse<T>() returning T | null
  - `src/main/lib/trpc/index.ts` `authedProcedure` — centralized auth guard
  - `src/main/global.d.ts` — NodeJS.Global augmentation for `__devToolsUnlocked`, `__unlockDevTools`, `__setUpdateAvailable` (eliminates `global as any` cluster)
  - `electron.vite.config.ts` manualChunks — splits Monaco/mermaid/katex/cytoscape/shiki into lazy chunks
  - `docs/architecture/overview.md` — filled from stub (3-process model, IPC, state, AI backend integration)
- **Recently archived (2026-04-10 → 2026-04-12):** `replace-gray-matter-with-front-matter` (67/67), `upgrade-tailwind-4`, `upgrade-typescript-6`, `upgrade-shiki-4`, `implement-1code-api`, `add-1code-api-litellm-provisioning` (77/77 tasks), `upgrade-electron-41` (26/27 — task 5.3 deferred to roadmap)

## Architecture (3-tier)
- CLAUDE.md is a ~135-line thin index (links, doesn't contain content)
- `docs/` is the canonical source of truth (Operations tab has roadmap)
- `.claude/rules/` has 9 behavioral rules (2 global + 7 path-scoped)
- `openspec/specs/` has **15 capability specs (109 requirements)** as of 2026-04-13 (post-archive of security-hardening-and-quality-remediation)
- Skills/agents read from canonical docs, not CLAUDE.md

## §7 claude.ts decomposition patterns (reusable learnings)
1. **Sequential per-extraction commits** — 5 commits (one per extraction + one for verification) keeps review surgical and rollback cheap. Parallel subagents on shared mutable state (5+ Maps) would have generated merge conflicts.
2. **Re-export shim for stability** — claude.ts re-exports public API (`hasActiveClaudeSessions`, `abortAllClaudeSessions`, `workingMcpServers`, `getAllMcpConfigHandler`) from extracted modules so external importers (index.ts, windows/main.ts, anthropic-accounts.ts) never need to update their imports.
3. **Facade over module-state clears** — `clearClaudeCaches()` stays in claude.ts as a thin facade calling `clearMcpResolverCaches()` + resetting the local `cachedClaudeQuery`. External callers keep a single entry point while each module owns its caches.
4. **Factory-function lift for observer-state closures** — `createCanUseTool(ctx)` accepts 5 closure captures (isUsingOllama, mode, subChatId, safeEmit, parts) and returns the async callback. Pure factory + scoped context is the cleanest way to lift a closure out of an observable.
5. **Orphan-import pruning after handler removal** — after extracting `getAllMcpConfigHandler`, 8 imports became dead (`GLOBAL_MCP_PATH`, `readProjectMcpJson`, `fetchMcpTools`, `fetchMcpToolsStdio`, `McpToolInfo`, `fetchOAuthMetadata`, `getMcpBaseUrl`, `projectsTable`). Grep for `\b<name>\b` usage count > 1 (filters pure imports); SonarLint S1128 catches what grep misses.
6. **Honest partial completion over forced fit** — target <1,000 lines was missed by ~1,500. Reporting partial + deferring to roadmap with precise technical rationale (chat subscription observer-state coupling) is better than forcing fragile stream-lifecycle extractions.
