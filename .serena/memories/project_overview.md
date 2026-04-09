# 1Code (ai-coding-cli) — Enterprise Fork

## Purpose
Local-first Electron desktop app for parallel AI-assisted development. Enterprise fork under apollosai.dev branding, being decoupled from upstream `1code.dev` backend.

## Tech Stack
- Electron ~40.8.5 (Node 24, Chromium 144), electron-vite 5, electron-builder 26
- React 19.2.5, TypeScript 5, Tailwind CSS 3, Bun
- @anthropic-ai/claude-agent-sdk 0.2.97, Codex CLI 0.118.0, Ollama
- 7 Drizzle tables, 22 tRPC routers (incl. enterprise-auth), better-sqlite3, node-pty (lazy-loaded)
- 14 regression guards, 58 tests

## Current State (2026-04-09)
- **Phase 0:** 15/15 hard gates complete
- **Electron 40:** Upgraded from 39.8.7 (Node 24, Chromium 144)
- **mock-api.ts Phase 1:** Timestamp fossil retired
- **mock-api.ts Phase 2:** Complete — 6 consumers migrated from `api.agents.*` to `trpc.chats.*`, 13 `utils.agents.*` cache sites migrated to `utils.chats.*`, new `src/renderer/lib/message-parser.ts` helper extracted, mock-api.ts reduced 655 → 144 lines (F-entry stubs only)
- **Enterprise auth:** Wired into auth-manager via Strangler Fig adapter pattern (`enterpriseAuthEnabled` flag), `applyEnterpriseAuth()` injects token into Claude spawn env, enterprise-auth tRPC router added. Module isolated — not yet active in production.
- **Dev auth bypass:** `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env`
- **Centralized roadmap:** `docs/operations/roadmap.md` — single source of truth
- **Branch protection:** main branch protected with required CI status check, admin bypass
- **CodeQL:** 19 findings resolved (18 fixed, 1 dismissed as false positive)
- **12 package upgrades landed** (all deps current as of 2026-04-09)
- **Active OpenSpec changes (4):** `upgrade-electron-41`, `upgrade-typescript-6`, `upgrade-tailwind-4`, `upgrade-vite-8-build-stack`
- **Upgrade execution order:** E41 → TS6 → Vite7-A → TW4 → Vite8-B+Shiki4
- **Archived:** `migrate-mock-api-consumers`, `wire-enterprise-auth` (36/36 tasks complete) + 8 other Phase 0 changes

## Architecture (3-tier)
- CLAUDE.md is a 125-line thin index (links, doesn't contain content)
- `docs/` is the canonical source of truth (Operations tab has roadmap)
- `.claude/rules/` has 9 behavioral rules (2 global + 7 path-scoped)
- `openspec/specs/` has 9 capability specs (incl. `enterprise-auth-wiring`)
- Skills/agents read from canonical docs, not CLAUDE.md
