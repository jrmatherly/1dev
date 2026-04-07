<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Quick Reference for AI Agents

- **Project**: 1Code (by 21st.dev) — local-first Electron desktop app for parallel AI-assisted development
- **Architecture details**: See [CLAUDE.md](CLAUDE.md) for full architecture, commands, patterns, and database schema
- **Project conventions**: See [openspec/project.md](openspec/project.md) for conventions and domain context
- **Proposal workflow**: See [openspec/AGENTS.md](openspec/AGENTS.md) for spec-driven development process
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and contribution guidelines

### Key Facts
- Package manager: **bun**
- AI SDK: `@anthropic-ai/claude-agent-sdk` (not `claude-code`)
- Quality gate: `bun run ts:check` (tsgo) — no test suite
- IPC: tRPC via `trpc-electron`
- State: Jotai (UI) + Zustand (persisted) + React Query (server)
- Database: Drizzle ORM + SQLite (auto-migrates on startup)
