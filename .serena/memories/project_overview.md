# 1Code (ai-coding-cli) — Enterprise Fork

## Purpose
Local-first Electron desktop app for parallel AI-assisted development. Originally by the `21st-dev` GitHub organization; **this repo is the enterprise fork** under apollosai.dev branding, being decoupled from the upstream `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM, Microsoft Entra ID via Envoy Gateway).

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron ~40.8.5, electron-vite 5, electron-builder 26 |
| UI | React 19.2.5, TypeScript 5, Tailwind CSS 3 |
| State | Jotai (UI), Zustand (persisted), React Query (server via tRPC) |
| Backend | tRPC (trpc-electron), Drizzle ORM, better-sqlite3 |
| AI | @anthropic-ai/claude-agent-sdk (0.2.97), Codex CLI (pinned 0.118.0), Ollama |
| Claude binary | pinned 2.1.96 |
| Package Manager | bun |
| Testing | bun:test — 12 guards, 48 tests as of 2026-04-09 |
| Documentation | xyd-js under `docs/` |

## Current Version
v0.0.72+

## Active Workstreams (as of 2026-04-09)
- **Phase 0 hard gates: 15 of 15 complete.** Phase 0.5 (credential hardening) also complete.
- **Electron 40 upgrade complete** — 39.8.7→40.8.5 (Node 24, Chromium 144). node-pty lazy-loaded.
- **mock-api.ts Phase 1 complete** — timestamp fossil retired. Phase 2 (consumer migration) on roadmap.
- **Dev auth bypass available** — `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env`.
- **Enterprise auth module implemented** — MSAL Node in `enterprise-auth.ts`, isolated (not wired yet).
- **Centralized roadmap** — `docs/operations/roadmap.md` is the single source of truth for outstanding work.
- **No active OpenSpec proposals.**
- **12 package upgrades landed** — including claude-agent-sdk 0.2.97, codex-acp 0.11.1, react 19.2.5.
- Target deployment: Talos Kubernetes cluster with LiteLLM + Envoy Gateway.

## Source-of-Truth Docs
- `CLAUDE.md` — thin 125-line index (links to canonical docs, does NOT contain content)
- `docs/` — canonical documentation site (Operations tab has roadmap)
- `.claude/rules/` — 9 behavioral rules (7 path-scoped + 2 global)
- `openspec/specs/` — 8 capability specs
