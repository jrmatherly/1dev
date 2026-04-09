# 1Code (Enterprise Fork)

A local-first desktop client for running AI coding agents (Claude Code, Codex, Ollama) against your own repositories.

> **About this fork.** This is an enterprise fork of [1Code by 21st-dev](https://github.com/21st-dev/1code). It is being progressively decoupled from the upstream `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM, Microsoft Entra ID via Envoy Gateway). Features that depend on the upstream backend have been removed from the highlights below — see [`.scratchpad/upstream-features-inventory.md`](.scratchpad/upstream-features-inventory.md) for the catalog of removed/pending-restoration functionality and [`.scratchpad/auth-strategy-envoy-gateway.md`](.scratchpad/auth-strategy-envoy-gateway.md) for the auth migration plan.

## Highlights

These features run entirely on your machine — no hosted backend required.

- **Multi-Agent Support** — Claude Code, Codex, and Ollama in one app; switch instantly
- **Cursor-like Visual UI** — Diff previews and real-time tool execution
- **BYOK (Bring Your Own Key)** — Use your own API keys for any supported provider
- **Git Worktree Isolation** — Each chat session runs in its own isolated worktree, never touching `main`
- **Built-in Git Client** — Visual staging, diffs, branch management, PR creation
- **Kanban Board** — Visualize agent sessions across worktrees
- **File Viewer** — Cmd+P fuzzy file search, syntax highlighting, image viewer
- **Integrated Terminal** — `node-pty` + xterm.js, toggle with Cmd+J
- **Model Selector** — Switch models and providers per-chat
- **MCP Server Management** — Toggle, configure, and delete MCP servers from the UI; SSRF-safe URL validation
- **Skills & Slash Commands** — User-defined skills and slash commands surfaced in chat
- **Custom Sub-agents** — Visual task display in the details sidebar
- **Memory** — Reads `CLAUDE.md` and `AGENTS.md` from the project root
- **Chat Forking** — Fork a sub-chat from any assistant message to explore alternatives
- **Message Queue** — Queue prompts while an agent is working
- **Plan Mode** — Structured plans with markdown preview before execution
- **Extended Thinking** — Visual thinking gradient for Claude reasoning
- **Auto-Updates** — `electron-updater` polling a configurable CDN (defaults to upstream `cdn.apollosai.dev`; self-hosters override `CDN_BASE` in `src/main/lib/auto-updater.ts`)
- **Cross Platform** — macOS, Windows, Linux

### Upstream-dependent features — restoration in progress

The following features depend on the `1code.dev` hosted backend. Per the fork's **self-host-everything** theme (locked 2026-04-08), each will be **reverse-engineered, re-created, and self-hosted** — not dropped. Until then they remain in the codebase but will not function once the upstream backend is retired.

- **Background Agents** — cloud sandboxes that run when your laptop sleeps (F1)
- **Automations & Inbox** — `@1code` triggers from GitHub / Linear / Slack (F2)
- **Remote agent chats / multi-team sync** (F3)
- **Hosted voice transcription** — BYOK OpenAI key path still works (F4)
- **PWA companion app** — always a separate upstream project (F6)
- **The hosted REST API** — `POST /api/v1/tasks` (F8)
- **Live Browser Previews** — currently dead UI on desktop (gated on `sandbox_id` hard-coded to `null`); will be rebuilt Phase 2 on top of `src/main/lib/terminal/port-manager.ts` (F9)

**Not affected** (investigated 2026-04-08, no restoration needed):
- **Plugin marketplace** — local-only, reads `~/.claude/plugins/` directly, never talked to upstream (F7)

See [`.scratchpad/upstream-features-inventory.md`](.scratchpad/upstream-features-inventory.md) for restoration priorities, per-feature decisions, and candidate self-host approaches.

## Features

### Worktree-isolated agent sessions

Every chat runs in its own git worktree, so agents can edit, commit, and run code without ever touching your main working tree.

![Worktree Demo](assets/worktree.gif)

- **Git Worktree Isolation** — Each chat session gets its own worktree off the project repo
- **Branch Safety** — Never accidentally commit to `main`
- **Local-First** — All code, chats, and credentials stay on your machine (SQLite at `{userData}/data/agents.db`)
- **Shared Terminals** — Reuse terminal sessions across worktrees in the same project

---

### A UI that respects your code

Cursor-like interface with diff previews, a built-in git client, and the ability to see changes before they land.

![Cursor UI Demo](assets/cursor-ui.gif)

- **Diff Previews** — See exactly what the agent is changing, in real time
- **Built-in Git Client** — Stage, commit, push, and manage branches without leaving the app
- **Git Activity Badges** — Inline indicators for git operations on agent messages
- **Rollback** — Roll back changes from any user-message bubble
- **Real-time Tool Execution** — Watch bash commands, file edits, and web searches as they happen
- **File Viewer** — Cmd+P fuzzy search, syntax highlighting, image viewer
- **Chat Forking** — Branch the conversation from any assistant message
- **Chat Export** — Export conversations for sharing or archival
- **File Mentions** — Reference files directly with `@` mentions
- **Message Queue** — Queue prompts while an agent is working

---

### Plan mode for thinking before acting

The agent asks clarifying questions, builds a structured plan, and shows it as clean markdown — all before execution.

![Plan Mode Demo](assets/plan-mode.gif)

- **Clarifying Questions** — The agent asks what it needs before starting
- **Structured Plans** — Step-by-step breakdown of what will happen
- **Clean Markdown Preview** — Plans rendered in readable format
- **Review Before Execution** — Approve or modify the plan first
- **Extended Thinking** — Visual thinking gradient for Claude reasoning
- **Sub-agents** — Visual task list for sub-agents in the details sidebar

---

### Connect anything with MCP

Full MCP server lifecycle management from the UI — no config files needed.

- **MCP Server Management** — Toggle, configure, and delete MCP servers from the UI
- **SSRF-Safe URL Validation** — MCP server URLs are validated against an allow-list (`src/main/lib/trpc/schemas/mcp-url.ts`)
- **Rich Tool Display** — Formatted inputs and outputs for MCP tool calls
- **@ Mentions** — Reference MCP servers directly in chat input

---

### Skills, slash commands, and sub-agents

Extend agent capability with project-local definitions.

- **Skills** — Drop skill definitions into the project; they show up automatically
- **Slash Commands** — Define custom commands for repetitive workflows
- **Sub-agents** — Spawn specialized agents for parallel sub-tasks
- **Memory** — `CLAUDE.md` and `AGENTS.md` are read from the project root

## Installation

This fork is build-from-source. There are no pre-built enterprise releases yet.

```bash
# Prerequisites: Bun, Python 3.11 (or 3.12+ with setuptools), Xcode Command Line Tools (macOS)
bun install
bun run claude:download  # Download Claude binary (pinned 2.1.96) — required
bun run codex:download   # Download Codex binary (pinned 0.118.0) — required
bun run build
bun run package:mac      # or package:win, package:linux
```

> **Important:** The `claude:download` and `codex:download` steps fetch the pinned agent CLI binaries. Skipping them produces a build that compiles but cannot run agents.
>
> **Python note:** Python 3.11 is recommended for native module rebuilds (`better-sqlite3`, `node-pty`). On Python 3.12+, install setuptools first: `pip install setuptools`.
>
> **Looking for the upstream OSS product?** Pre-built releases of upstream 1Code (with background agents and the hosted backend) are available from [1code.dev](https://1code.dev). This fork is a separate distribution.

## Development

```bash
bun install
bun run claude:download  # First time only
bun run codex:download   # First time only
bun run dev
```

## Feedback & Community

Join our [Discord](https://discord.gg/8ektTZGnj4) for support and discussions.

## Developer Guide

For detailed architecture, development patterns, database schema, and release process, see [CLAUDE.md](CLAUDE.md).

For contribution guidelines, setup instructions, and code conventions, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
