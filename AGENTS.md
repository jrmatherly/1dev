
## Quick Reference for AI Agents

- **Project**: 1Code (by 21st.dev) — local-first Electron desktop app for parallel AI-assisted development
- **Architecture details**: See [CLAUDE.md](CLAUDE.md) for full architecture, commands, patterns, and database schema
- **Project conventions**: See [openspec/project.md](openspec/project.md) for conventions and domain context
- **Proposal workflow**: See [openspec/AGENTS.md](openspec/AGENTS.md) for spec-driven development process
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and contribution guidelines

### Key Facts
- Package manager: **bun**
- AI SDK: `@anthropic-ai/claude-agent-sdk` (not `claude-code`)
- Quality gates: `bun run ts:check` **and** `bun run build` — run both before submitting a PR (no test suite)
- IPC: tRPC via `trpc-electron`
- State: Jotai (UI) + Zustand (persisted) + React Query (server)
- Database: Drizzle ORM + SQLite (auto-migrates on startup)
- Pinned binaries: Claude CLI `2.1.96`, Codex CLI `0.118.0` (see `claude:download` / `codex:download` in `package.json`)
