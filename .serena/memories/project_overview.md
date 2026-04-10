# 1Code (ai-coding-cli) — Enterprise Fork

## Purpose
Local-first Electron desktop app for parallel AI-assisted development. Enterprise fork under apollosai.dev branding, being decoupled from upstream `1code.dev` backend.

## Tech Stack
- Electron ~41.2.0 (Node.js 24.14, Chromium 146, V8 14.6), electron-vite 5, electron-builder 26
- React 19.2.5, TypeScript 6.0.2 (upgraded from 5.9.3 on 2026-04-10), Tailwind CSS 3, Bun
- @anthropic-ai/claude-agent-sdk 0.2.97, Codex CLI 0.118.0, Ollama
- 7 Drizzle tables, 22 tRPC routers (incl. enterprise-auth), better-sqlite3, node-pty (lazy-loaded)
- 14 regression guards, 58 tests

## Current State (2026-04-10)
- **Phase 0:** 15/15 hard gates complete
- **Vite 7.3.2 (Phase A):** Upgraded from 6.4.2 on 2026-04-10 with `@vitejs/plugin-react 4.7 → 5.2`. electron-vite stays at 5.0.0 (peer range `^5 || ^6 || ^7`). CJS interop validated: all 4 `externalizeDeps.exclude` modules (superjson, async-mutex, gray-matter, trpc-electron) correctly bundled, ESM-only `@anthropic-ai/claude-agent-sdk` dynamic import preserved, `import.meta.env` replacement works in all 3 processes, single React instance confirmed. Functional verification via full 41-message streaming Claude agent session (`[SD] M:END reason=ok t=17.2s`). Change `upgrade-vite-8-build-stack` stays active at 15/59 — Phase B (Vite 8 + Rolldown + electron-vite 6.0 + Shiki 4) blocked on electron-vite stable.
- **TypeScript 6.0.2:** Upgraded from 5.9.3 on 2026-04-10. tsconfig updated: `types: ["node", "better-sqlite3", "diff", "react", "react-dom"]` (TS6 defaults `types` to `[]`), `noUncheckedSideEffectImports: false` (preserves 5 CSS side-effect imports), removed dead `declaration`/`declarationMap` (no-ops with `noEmit: true`). tsgo upgraded to 7.0.0-dev. Baseline unchanged at 80 errors (zero new errors, zero unused `@ts-expect-error`). Archived as `2026-04-10-upgrade-typescript-6` with `--skip-specs` (tooling-only change).
- **Electron 41.2.0:** Upgraded from 40.8.5 (Node.js 24.14, Chromium 146, V8 14.6) — EOL 2026-08-25. Committed and pushed 2026-04-09. Auto-updater end-to-end pending packaged-build verification. Dev runtime empirically validated.
- **Analytics dual-import warning:** Fixed — `windows/main.ts` now uses static `import { setOptOut }` instead of dynamic import (Rollup warning eliminated)
- **mock-api.ts Phase 1:** Timestamp fossil retired
- **mock-api.ts Phase 2:** Complete — 6 consumers migrated from `api.agents.*` to `trpc.chats.*`, 13 `utils.agents.*` cache sites migrated to `utils.chats.*`, new `src/renderer/lib/message-parser.ts` helper extracted, mock-api.ts reduced 655 → 144 lines (F-entry stubs only)
- **Enterprise auth:** Wired into auth-manager via Strangler Fig adapter pattern (`enterpriseAuthEnabled` flag), `applyEnterpriseAuth()` injects token into Claude spawn env, enterprise-auth tRPC router added. Module isolated — not yet active in production.
- **Dev auth bypass:** `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env`
- **Centralized roadmap:** `docs/operations/roadmap.md` — single source of truth
- **Branch protection:** main branch protected with required CI status check, admin bypass
- **CodeQL:** 19 findings resolved (18 fixed, 1 dismissed as false positive)
- **12 package upgrades landed** (all deps current as of 2026-04-09)
- **Active OpenSpec changes (3):** `upgrade-electron-41` (26/27, committed+pushed), `upgrade-tailwind-4`, `upgrade-vite-8-build-stack`
- **Upgrade execution order:** ~~E41~~ ✅ → ~~TS6~~ ✅ → ~~Vite7-A~~ ✅ → TW4 (next) → Vite8-B+Shiki4 (blocked)
- **Archived:** `upgrade-typescript-6`, `migrate-mock-api-consumers`, `wire-enterprise-auth` (36/36 tasks complete) + 8 other Phase 0 changes

## Architecture (3-tier)
- CLAUDE.md is a 125-line thin index (links, doesn't contain content)
- `docs/` is the canonical source of truth (Operations tab has roadmap)
- `.claude/rules/` has 9 behavioral rules (2 global + 7 path-scoped)
- `openspec/specs/` has 9 capability specs (incl. `enterprise-auth-wiring`)
- Skills/agents read from canonical docs, not CLAUDE.md
