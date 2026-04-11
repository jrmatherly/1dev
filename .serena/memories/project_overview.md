# 1Code (ai-coding-cli) — Enterprise Fork

## Purpose
Local-first Electron desktop app for parallel AI-assisted development. Enterprise fork under apollosai.dev branding, being decoupled from upstream `1code.dev` backend.

## Tech Stack
- Electron ~41.2.0 (Node.js 24.14, Chromium 146, V8 14.6), electron-vite 5, electron-builder 26
- React 19.2.5, TypeScript 6.0.2 (upgraded from 5.9.3 on 2026-04-10), Tailwind CSS 4, Bun
- @anthropic-ai/claude-agent-sdk 0.2.97, Codex CLI 0.118.0, Ollama
- 7 Drizzle tables, 22 tRPC routers (incl. enterprise-auth), better-sqlite3, node-pty (lazy-loaded)
- 15 regression guards + 20 service test files in `services/1code-api/tests/` = **199 tests across 35 files** (189 pass + 10 skipped integration tests needing docker-compose harness, 2026-04-11)

## Current State (2026-04-11, post-session-sync)
- **Phase 0:** 15/15 hard gates complete
- **TS baseline: 0 errors** (reduced from 32 → 0 on 2026-04-11 via full 10-bucket sweep from `.scratchpad/code-problems/002-analysis.md`, commit `e1efae2`). Fixes: desktop routing stub arity, `setDiffStats` useCallback typing, `"plugin"` source union widening, `UploadedFile.mediaType` addition, null→undefined narrowing, removed stale `@ts-expect-error`, deleted obsolete `Selection.getComposedRanges` polyfill (now in lib.dom.d.ts), React-19 `useRef` initial value, `app.dock?.setMenu` platform guard, `CodexMcpServerForSettings` widened with optional `serverInfo?`/`error?`, `DiffSidebarContentProps`/`DiffSidebarRendererProps`/`AgentDiffView` prop-shape unification. Baseline file = 0; CI fails on ANY new TS error.
- **Tailwind 4.2.2:** Upgraded from 3.4.19 on 2026-04-10. CSS-first config (`@theme`, `@custom-variant dark`, `@plugin` in globals.css). PostCSS pipeline replaced with `@tailwindcss/vite` plugin. `tw-animate-css` replaces `tailwindcss-animate`. `tailwind-merge` 2.6.1 → 3.5.0. Visual QA completed. Change archived.
- **Vite 7.3.2 (Phase A):** Upgraded from 6.4.2 on 2026-04-10 with `@vitejs/plugin-react 4.7 → 5.2`. electron-vite stays at 5.0.0 (peer range `^5 || ^6 || ^7`). CJS interop validated. Change `upgrade-vite-8-build-stack` stays active at 15/50 — Phase B (Vite 8 + Rolldown + electron-vite 6.0 + Shiki 4) blocked on electron-vite stable.
- **TypeScript 6.0.2:** Upgraded from 5.9.3 on 2026-04-10. tsconfig updated: `types: ["node", "better-sqlite3", "diff", "react", "react-dom"]`, `noUncheckedSideEffectImports: false`. tsgo upgraded to 7.0.0-dev. Archived as `2026-04-10-upgrade-typescript-6`.
- **Electron 41.2.0:** Upgraded from 40.8.5 (Node.js 24.14, Chromium 146, V8 14.6) — EOL 2026-08-25. Committed and pushed 2026-04-09. Auto-updater end-to-end pending packaged-build verification.
- **1code-api service + LiteLLM provisioning:** Fully shipped. `services/1code-api/` with Fastify+tRPC+Drizzle/PostgreSQL. Phase 1 baseline (health, changelog, plan, profile) + LiteLLM provisioning subsystem behind `PROVISIONING_ENABLED` feature flag. **20 service test files** (health, changelog, plan, profile, auth, config + 5 lib + 3 routes + 4 services + 3 integration). `add-1code-api-litellm-provisioning` **archived 2026-04-11** as `2026-04-11-add-1code-api-litellm-provisioning` (77/77 tasks complete). Container: `ghcr.io/jrmatherly/1code-api` via `.github/workflows/container-build.yml`. NEW baseline spec `1code-api-litellm-provisioning` (19 requirements); `self-hosted-api` spec updated to 11 requirements.
- **Enterprise auth:** Wired into auth-manager via Strangler Fig adapter pattern (`enterpriseAuthEnabled` flag), `applyEnterpriseAuth()` injects token into Claude spawn env, enterprise-auth tRPC router added.
- **Project-orchestrator skill** (added 2026-04-11, commit `105b66e`): `.claude/skills/project-orchestrator/SKILL.md` — routing-layer skill modeled on the cluster repo's `/taskforce` but recontextualized for this fork. Step-0 hard-rule gate catches auth-env-vars / credential-storage / tscheck-baseline / OpenSpec Phase 0 scope / LiteLLM OSS / scratchpad / roadmap / upstream-boundary / database / vite-config rule triggers BEFORE routing work. Includes task-type routing table with active-OpenSpec-change detection (so version-upgrade tasks route to `/openspec-apply-change` not `/openspec-propose`). Skill inventory total is now **17** (16 routing targets + the orchestrator itself). Reviewed via superpowers:code-reviewer subagent; all Critical + Important + most Minor findings resolved before promotion.
- **Dev auth bypass:** `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env`
- **Centralized roadmap:** `docs/operations/roadmap.md` — single source of truth
- **Release pipeline:** GitHub Actions `release.yml` builds 3-OS matrix (macos-15, ubuntu, windows) and publishes to GitHub Releases. Current: **v0.0.81** (2026-04-10) — keytar arm64 rebuild, Windows electron-rebuild fix, Codex downloader rewritten to skip api.github.com (pinned SHA256). v0.0.79 was first successful all-platform build. Unsigned first iteration.
- **Active OpenSpec changes (2):**
  - `replace-gray-matter-with-front-matter` (0/67, proposed 2026-04-11 commit `b6187fb`) — eliminate Rollup eval warning from gray-matter/lib/engines.js via front-matter@4.0.2 shim at `src/main/lib/frontmatter.ts`. Empirically validated via in-tree spike. Worktree workflow is mandatory per `design.md` Decision 6 and `tasks.md` §1. New micro-capability spec `frontmatter-parsing` (6 requirements / 15 scenarios) to be promoted at archive time.
  - `upgrade-vite-8-build-stack` (15/50, Phase A done, Phase B blocked on electron-vite 6.0.0 stable)
- **Upgrade execution order:** ~~E41~~ ✅ → ~~TS6~~ ✅ → ~~Vite7-A~~ ✅ → ~~TW4~~ ✅ → ~~Shiki4~~ ✅ → Vite8-B (blocked on `electron-vite 6.0.0` stable)
- **Recently archived (2026-04-10 + 2026-04-11):** `upgrade-tailwind-4`, `upgrade-typescript-6`, `upgrade-shiki-4`, `implement-1code-api`, `add-1code-api-litellm-provisioning` (77/77 tasks), `upgrade-electron-41` (26/27 — task 5.3 auto-updater packaged-build verification deferred to roadmap, blocked on code-signing)

## Architecture (3-tier)
- CLAUDE.md is a ~135-line thin index (links, doesn't contain content)
- `docs/` is the canonical source of truth (Operations tab has roadmap)
- `.claude/rules/` has 9 behavioral rules (2 global + 7 path-scoped)
- `openspec/specs/` has **12 capability specs (85 requirements)** as of 2026-04-11: `1code-api-litellm-provisioning` (19), `brand-identity` (11), `claude-code-auth-import` (2), `credential-storage` (7), `documentation-site` (5), `electron-runtime` (4), `enterprise-auth` (5), `enterprise-auth-wiring` (4), `feature-flags` (6), `renderer-data-access` (5), `self-hosted-api` (11), `shiki-highlighter` (6). Next expected addition at archive time: `frontmatter-parsing` (6).
- Skills/agents read from canonical docs, not CLAUDE.md
