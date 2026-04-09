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
| Testing | bun:test (built in, no config) under `tests/regression/` — 6 guards, 14 tests as of 2026-04-09 |
| Analytics | PostHog, Sentry (disabled by default in OSS builds) |

## Current Version
v0.0.72+

## Local Features (work without upstream backend)
- Multi-backend AI (Claude, Codex, Ollama)
- Worktree-isolated chat sessions (each chat in its own git worktree under `~/.1code/worktrees/`)
- Built-in git client + diff previews + rollback
- Integrated terminal (node-pty + xterm)
- File viewer with Cmd+P fuzzy search
- Kanban board view
- MCP server management (with SSRF-safe URL validation)
- Skills, slash commands, sub-agents
- Memory: reads `CLAUDE.md` and `AGENTS.md` from project root
- Plan mode + extended thinking
- Auto-update mechanism (`electron-updater`, points at self-hosted `cdn.apollosai.dev`)

## Upstream-Dependent Features — Restoration Roadmap (locked 2026-04-08)
**Self-host-everything theme:** every upstream feature will be reverse-engineered, re-created, and self-hosted. Dropping or pointing at someone else's hosted service are both off the table. See `.scratchpad/upstream-features-inventory.md` v2 for the full F1-F10 catalog with restoration strategies (Phase 0 hard gate #15 complete — all 10 entries have decisions).

- **F1** — Background Agents / cloud sandboxes (🟥 P0 for the OAuth flow hidden inside `claude-code.ts`, ⬜ P3 for the agent-running). Phase 0 gate #8 covers the OAuth extraction.
- **F2** — Automations & Inbox (`@1code` triggers from GitHub/Linear/Slack)
- **F3** — Remote Agent Chats / Teams sync
- **F4** — Hosted voice transcription (BYOK OpenAI key path still works locally)
- **F5** — Auto-update CDN channel (mechanism is local; CDN URL is now `cdn.apollosai.dev` post-rebrand)
- **F6** — Help-popover changelog (now points at `apollosai.dev/changelog` post-rebrand)
- **F7** — Plugin marketplace — **NO RESTORATION NEEDED**. Investigated 2026-04-08: local-only, reads `~/.claude/plugins/` directly, never talked to upstream.
- **F8** — Hosted REST API (`POST /api/v1/tasks`)
- **F9** — Live Browser Previews — **NO RESTORATION NEEDED for current state**. Investigated 2026-04-08: dead UI on desktop today (gated on `sandbox_id` which `mock-api.ts:46` hard-codes to `null`). Will be **rebuilt as Phase 2 greenfield** using existing `src/main/lib/terminal/port-manager.ts` substrate.
- **F10** — PWA companion app (was never in this repo)

## Active Workstreams (as of 2026-04-09)
- **Phase 0 hard gates: 12 of 15 complete** (unchanged since 2026-04-08). Only #8 (upstream sandbox OAuth extraction from `claude-code.ts:178-220`) remains.
- **Chosen enterprise auth strategy:** `.scratchpad/auth-strategy-envoy-gateway.md` **v2.1** (Envoy Gateway dual-auth, **empirically validated** via live smoke test against the Talos cluster on 2026-04-08, see `.full-review/envoy-gateway-review/05-final-report.md`). Reproducible runbook in `.scratchpad/forwardaccesstoken-smoke-test.md`.
- **Fallback strategy:** `.scratchpad/enterprise-auth-integration-strategy.md` v5 (MSAL-in-Electron) — retained but not chosen.
- Comprehensive review #1 at `.full-review/` (135 findings, 5 phases + remediation research) — original v5 MSAL strategy review.
- Comprehensive review #2 at `.full-review/envoy-gateway-review/` (47 findings across 9 files; **all 8 Critical resolved as of 2026-04-08**, includes Smoke Test Addendum).
- **Archived OpenSpec changes:**
  - `openspec/changes/archive/2026-04-09-rebrand-residual-sweep/` — 35-edit rebrand sweep landed in commits 76fe005 + 4dbbcce on 2026-04-09. Promoted `brand-identity` to `openspec/specs/brand-identity/spec.md` (the first capability spec in the project).
- **Active OpenSpec proposals:** `openspec/changes/add-feature-flag-infrastructure/` (Phase 0 gate #12 — already implemented, proposal exists for traceability), `openspec/changes/retire-mock-api-translator/` (retire 657-line untyped facade still imported by 6 agent files).
- Documentation alignment: README/CONTRIBUTING/CLAUDE.md/AGENTS.md/PROJECT_INDEX.md cross-checked, rewritten for fork posture, and updated for the apollosai.dev rebrand. CLAUDE.md "Documentation Maintenance" section lists 13 common drift points.
- Target deployment: Talos Kubernetes cluster at `/Users/jason/dev/ai-k8s/talos-ai-cluster/` (Envoy Gateway v1.7.1, Flux/GitOps managed) with LiteLLM (Azure OpenAI + Azure AI Foundry incl. `azure_ai/claude-*` models).

## Source-of-Truth Docs
- `CLAUDE.md` — architecture, commands, patterns, Phase 0 status, release process (authoritative, ~415 lines after 2026-04-09 updates)
- `.claude/PROJECT_INDEX.md` — auto-generated repo navigation map with Phase 0 status table
- `README.md` — user-facing pitch (positions repo as enterprise fork, lists upstream-dependent features under restoration)
- `CONTRIBUTING.md` — contributor setup, four quality gates, fork posture
- `AGENTS.md` — AI quick-reference (fork posture + upstream boundary warning + Phase 0 status pointer)
- `LICENSE` — Apache 2.0 with explicit copyright header (21st-dev 2026 original + apollosai.dev 2026 fork), added 2026-04-09
- `NOTICE` — Apache License 2.0 §4(c)+§4(d) fork attribution, created 2026-04-09
- `openspec/config.yaml` — OpenSpec 1.2.0 configuration (no separate `project.md`; per-proposal context lives in `openspec/changes/<id>/proposal.md`)
- **`openspec/specs/brand-identity/spec.md`** — first capability spec in the repo (2026-04-09). 11 SHALL/MUST requirements codifying the brand taxonomy. Authoritative source for any future rebrand audit.
