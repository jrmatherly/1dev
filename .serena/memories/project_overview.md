# 1Code (ai-coding-cli) — Enterprise Fork

## Purpose
Local-first Electron desktop app for parallel AI-assisted development. Originally by 21st.dev; **this repo is the enterprise fork** being decoupled from the upstream `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM, Microsoft Entra ID via Envoy Gateway).

Users create chat sessions linked to local project folders, interact with multiple AI backends (Claude, Codex, Ollama) in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, terminal).

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron ~39, electron-vite 3, electron-builder |
| UI | React 19, TypeScript 5, Tailwind CSS 3 |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai (UI), Zustand (persisted), React Query (server via tRPC) |
| Backend | tRPC (trpc-electron), Drizzle ORM, better-sqlite3 |
| Terminal | node-pty, xterm.js |
| Editor | Monaco Editor |
| AI | @anthropic-ai/claude-agent-sdk (0.2.45), Codex CLI (pinned 0.118.0), Ollama |
| Claude binary | pinned 2.1.96 (see `claude:download` script) |
| Package Manager | bun |
| Analytics | PostHog, Sentry (disabled by default in OSS builds) |

## Current Version
v0.0.72+

## Local Features (work without upstream backend)
- Multi-backend AI (Claude, Codex, Ollama)
- Worktree-isolated chat sessions (each chat in its own git worktree)
- Built-in git client + diff previews + rollback
- Integrated terminal (node-pty + xterm)
- File viewer with Cmd+P fuzzy search
- Kanban board view
- MCP server management (with SSRF-safe URL validation)
- Skills, slash commands, sub-agents
- Memory: reads `CLAUDE.md` and `AGENTS.md` from project root
- Plan mode + extended thinking
- Auto-update mechanism (`electron-updater`, points at configurable CDN — defaults to upstream `cdn.apollosai.dev`)

## Upstream-Dependent Features (will break when upstream retires)
See `.scratchpad/upstream-features-inventory.md` for the F1-F10 catalog with priority ratings and restoration strategies. High-level:
- **F1** — Background Agents / cloud sandboxes (🟥 P0 for the OAuth flow that hides inside, ⬜ P3 for the agent-running)
- **F2** — Automations & Inbox (`@1code` triggers from GitHub/Linear/Slack)
- **F3** — Remote Agent Chats / Teams sync
- **F4** — Hosted voice transcription (BYOK OpenAI key path still works locally)
- **F5** — Auto-update CDN channel (mechanism is local; only the URL is upstream)
- **F6** — Help-popover changelog
- **F7** — Plugin marketplace (status unconfirmed)
- **F8** — Subscription tier gating
- **F9** — Live browser previews (status unconfirmed)
- **F10** — PWA companion app (was never in this repo)

## Active Workstreams (as of 2026-04-08)
- Comprehensive review at `.full-review/` (135 findings, 5 phases + remediation research)
- Enterprise auth integration: two parallel strategies under `.scratchpad/`
  - MSAL-in-Electron (`enterprise-auth-integration-strategy.md` v5)
  - Envoy Gateway dual-auth alternative (`auth-strategy-envoy-gateway.md` v1)
- Upstream-features inventory and restoration roadmap (`upstream-features-inventory.md`, created 2026-04-08)
- Documentation alignment: README/CONTRIBUTING/CLAUDE.md/AGENTS.md cross-checked and rewritten this session for fork posture and accuracy
- Target deployment: Talos Kubernetes cluster at `/Users/jason/dev/ai-k8s/talos-ai-cluster/` with LiteLLM (Azure OpenAI + Azure AI Foundry incl. `azure_ai/claude-*` models)

## Source-of-Truth Docs
- `CLAUDE.md` — architecture, commands, patterns, security gaps, release process
- `README.md` — user-facing pitch (now positions repo as enterprise fork)
- `CONTRIBUTING.md` — contributor setup, dual quality gates
- `AGENTS.md` — AI quick-reference + OpenSpec redirect
- `openspec/project.md` — brief summary
