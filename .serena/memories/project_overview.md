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
| Desktop | Electron ~40.8, electron-vite 3, electron-builder |
| UI | React 19, TypeScript 5, Tailwind CSS 3 |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai (UI), Zustand (persisted), React Query (server via tRPC) |
| Backend | tRPC (trpc-electron), Drizzle ORM, better-sqlite3 |
| Terminal | node-pty, xterm.js |
| Editor | Monaco Editor |
| AI | @anthropic-ai/claude-agent-sdk, Codex CLI (pinned 0.118.0), Ollama |
| Claude binary | pinned 2.1.96 (see `claude:download` script) |
| Package Manager | bun |
| Testing | bun:test (built in, no config) under `tests/regression/` — 12 guards, 48 tests as of 2026-04-09 |
| Documentation | xyd-js (`@xyd-js/cli` pinned `0.0.0-build-1202121-20260121231224`) under `docs/` |
| Analytics | PostHog, Sentry (disabled by default in OSS builds) |

## Current Version
v0.0.72+

## Active Workstreams (as of 2026-04-09)
- **Phase 0 hard gates: 15 of 15 complete ✅**. Phase 0.5 (harden-credential-storage) also complete — unified credential encryption in `credential-store.ts`.
- **mock-api.ts Phase 1 retirement complete** — timestamp fossil (`created_at`/`updated_at` translation) removed by `retire-mock-api-translator` change (archived 2026-04-09). Phases 2-3 tracked as separate proposals.
- **Dev auth bypass available** — `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env` skips login screen in dev mode (upstream OAuth backend is dead, Envoy Gateway not yet deployed).
- **Chosen enterprise auth strategy:** `docs/enterprise/auth-strategy.md` **v2.1** (Envoy Gateway dual-auth, **empirically validated** via live smoke test against the Talos cluster on 2026-04-08). Reproducible runbook in `docs/enterprise/envoy-smoke-test.md`.
- **Fallback strategy:** `docs/enterprise/auth-fallback.md` v5 (MSAL-in-Electron) — retained but not chosen.
- **Documentation site:** `docs/` bootstrapped 2026-04-09 as a tracked xyd-js site with 25 pages (13 authored + 12 stubs) across 5 tabs. CI runs `docs-build` as a 6th parallel job.
- **No active OpenSpec proposals.** All completed changes archived. Phase 1 enterprise auth roadmap: 4 sequential changes — #1 `add-enterprise-auth-module` (done), #2 `wire-enterprise-auth`, #3 `add-litellm-settings-ui`, #4 `setup-cluster-dual-auth` (cross-repo).
- **Archived OpenSpec changes:** `rebrand-residual-sweep`, `bootstrap-documentation-site`, `remove-upstream-sandbox-oauth`, `harden-credential-storage`, `retire-mock-api-translator`, `add-enterprise-auth-module` (all 2026-04-09).
- Target deployment: Talos Kubernetes cluster at `/Users/jason/dev/ai-k8s/talos-ai-cluster/` with LiteLLM + Envoy Gateway.

## Source-of-Truth Docs (post-2026-04-09 restructure)

**Canonical home:** `docs/` (xyd-js site). All architectural facts, conventions, and runbooks live here. CLAUDE.md, README, memories link to `docs/` — they do NOT duplicate content. Enforced by `openspec/specs/documentation-site/spec.md`.

- `docs/` — canonical documentation site (5 tabs — Architecture, Enterprise, Conventions, Operations, API Reference)
  - `docs/architecture/` — codebase-layout, database, tech-stack, trpc-routers, upstream-boundary
  - `docs/enterprise/` — auth-strategy, auth-fallback, cluster-facts, envoy-smoke-test, fork-posture, phase-0-gates, upstream-features
  - `docs/conventions/` — brand-taxonomy, feature-flags, pinned-deps, quality-gates, regression-guards, tscheck-baseline, no-scratchpad-references
  - `docs/operations/` — cluster-access, debugging-first-install, env-gotchas, release
- `CLAUDE.md` — **124 lines** (trimmed from 434 on 2026-04-09). Identity, critical rules (6 load-bearing), commands, architecture summary, pointers. Links to `docs/` and `.claude/rules/` for details.
- `.claude/rules/` — Claude Code behavioral rules loaded automatically (7 rules + README):
  - **Global:** `scratchpad.md`
  - **Path-scoped:** `auth-env-vars.md`, `credential-storage.md`, `database.md`, `openspec.md`, `testing.md`, `tscheck-baseline.md`, `upstream-boundary.md`
- `.claude/skills/` — Claude Code workflow skills (on-demand): `phase-0-progress`, `docs-drift-check`, `verify-pin`, OpenSpec flow skills, etc.
- `.claude/agents/` — Claude Code subagents (task-specific): `db-schema-auditor`, `trpc-router-auditor`, `upstream-dependency-auditor`, `security-reviewer`, `ui-reviewer`
- `.claude/PROJECT_INDEX.md` — auto-generated repo navigation map
- `README.md` — user-facing pitch (positions repo as enterprise fork)
- `CONTRIBUTING.md` — contributor setup, quality gates, fork posture
- `AGENTS.md` — AI quick-reference
- `openspec/specs/` — 8 capability specs: `brand-identity`, `feature-flags`, `claude-code-auth-import`, `documentation-site`, `credential-storage`, `renderer-data-access`, `enterprise-auth`, `electron-runtime`
