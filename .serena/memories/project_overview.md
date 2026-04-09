# 1Code (ai-coding-cli) — Enterprise Fork

## Purpose
Local-first Electron desktop app for parallel AI-assisted development. Originally by the `21st-dev` GitHub organization (https://github.com/21st-dev/1code); **this repo is the enterprise fork** under apollosai.dev branding (rebranded 2026-04-08 with a follow-up residual sweep on 2026-04-09), being decoupled from the upstream `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM, Microsoft Entra ID via Envoy Gateway).

Users create chat sessions linked to local project folders, interact with multiple AI backends (Claude, Codex, Ollama) in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, terminal).

## Product Identity (Tier A/B/C taxonomy per `openspec/specs/brand-identity/spec.md`)
- **Product name (Tier B — keep):** "1Code", `1code-desktop` npm package, `resources/cli/1code` CLI launcher, `.1code/` hidden directories
- **Upstream brand (Tier A — removed):** `21st.dev`, `1code.dev`, `twentyfirst-agents://`, `21st-desktop`
- **Attribution (Tier C — preserved):** `src/main/lib/cli.ts:6` upstream PR link, `README.md:5` attribution paragraph, `README.md:134` "looking for upstream OSS product?" pointer, `LICENSE` copyright header, `NOTICE` file

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron ~39.8.7, electron-vite 3, electron-builder |
| UI | React 19, TypeScript 5, Tailwind CSS 3 |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai (UI), Zustand (persisted), React Query (server via tRPC) |
| Backend | tRPC (trpc-electron), Drizzle ORM, better-sqlite3 |
| Terminal | node-pty, xterm.js |
| Editor | Monaco Editor |
| AI | @anthropic-ai/claude-agent-sdk (0.2.45), Codex CLI (pinned 0.118.0), Ollama |
| Claude binary | pinned 2.1.96 (see `claude:download` script) |
| Package Manager | bun |
| Testing | bun:test (built in, no config) under `tests/regression/` — 8 guards, 25 tests as of 2026-04-09 |
| Documentation | xyd-js (`@xyd-js/cli` pinned `0.0.0-build-1202121-20260121231224`) under `docs/` |
| Analytics | PostHog, Sentry (disabled by default in OSS builds) |

## Current Version
v0.0.72+

## Active Workstreams (as of 2026-04-09)
- **Phase 0 hard gates: 12 of 15 complete**. Only #8 (upstream sandbox OAuth extraction from `claude-code.ts:178-220`) remains.
- **Chosen enterprise auth strategy:** `docs/enterprise/auth-strategy.md` **v2.1** (Envoy Gateway dual-auth, **empirically validated** via live smoke test against the Talos cluster on 2026-04-08). Reproducible runbook in `docs/enterprise/envoy-smoke-test.md`.
- **Fallback strategy:** `docs/enterprise/auth-fallback.md` v5 (MSAL-in-Electron) — retained but not chosen.
- **Documentation site:** `docs/` bootstrapped 2026-04-09 as a tracked xyd-js site with 25 pages (13 authored + 12 stubs) across 5 tabs. CI runs `docs-build` as a 6th parallel job. The `documentation-site` capability spec codifies the rules including the no-scratchpad-references contract.
- **Active OpenSpec proposals:** `retire-mock-api-translator` (2/64 tasks), `remove-upstream-sandbox-oauth` (gate #8 closer).
- **Archived OpenSpec changes:** `rebrand-residual-sweep` (2026-04-09), `bootstrap-documentation-site` (2026-04-09).
- Target deployment: Talos Kubernetes cluster at `/Users/jason/dev/ai-k8s/talos-ai-cluster/` with LiteLLM + Envoy Gateway.

## Source-of-Truth Docs
- `CLAUDE.md` — architecture, commands, patterns, Phase 0 status, release process (authoritative)
- `docs/` — canonical documentation site (25 pages, 5 tabs — Architecture, Enterprise, Conventions, Operations, API Reference)
- `.claude/PROJECT_INDEX.md` — auto-generated repo navigation map
- `README.md` — user-facing pitch (positions repo as enterprise fork)
- `CONTRIBUTING.md` — contributor setup, four quality gates, fork posture
- `AGENTS.md` — AI quick-reference
- `openspec/specs/` — 4 capability specs: `brand-identity`, `feature-flags`, `claude-code-auth-import`, `documentation-site`
