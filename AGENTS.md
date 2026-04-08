
## Quick Reference for AI Agents

- **Project**: 1Code — local-first Electron desktop app for parallel AI-assisted development
- **Fork posture**: This is the **enterprise fork** of upstream 1Code, being decoupled from the `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM + Microsoft Entra via Envoy Gateway). See [CLAUDE.md](CLAUDE.md) "Fork posture" for the full context.
- **Architecture details**: See [CLAUDE.md](CLAUDE.md) for full architecture, commands, patterns, and database schema.
- **Repo map**: [.claude/PROJECT_INDEX.md](.claude/PROJECT_INDEX.md) — structural index (routers, tables, migrations, features, Phase 0 status).
- **Proposal workflow**: OpenSpec 1.2.0. From Claude Code, run `/opsx:propose`, `/opsx:apply`, `/opsx:explore`, or `/opsx:archive`. Active proposals live in `openspec/changes/`.
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and contribution guidelines.

### Key Facts
- Package manager: **bun**
- AI SDK: `@anthropic-ai/claude-agent-sdk` (not `claude-code`)
- Quality gates: `bun run ts:check && bun run build && bun test && bun audit` — run **all four** before submitting a PR. None is a superset of the others. CI enforces the same four.
- IPC: tRPC via `trpc-electron` (21 routers in `createAppRouter`)
- State: Jotai (UI) + Zustand (persisted) + React Query (server)
- Database: Drizzle ORM + SQLite, 7 tables, auto-migrates on startup
- Pinned binaries: Claude CLI `2.1.96`, Codex CLI `0.118.0` (see `claude:download` / `codex:download` in `package.json`)

### Upstream Backend Boundary (important for this fork)
Before claiming a feature is "local-only", grep for upstream-dependent call sites — they will break when the `1code.dev` backend is retired:

```bash
grep -rn "remoteTrpc\." src/renderer/         # typed tRPC client to upstream
grep -rn '\${apiUrl}' src/                    # raw fetch() to upstream
```

Known raw-fetch upstream sites: `voice.ts`, `sandbox-import.ts`, `claude-code.ts` (OAuth flow — P0 hidden dep), `agents-help-popover.tsx`. Catalog in `.scratchpad/upstream-features-inventory.md`.

### Phase 0 Migration Status (as of 2026-04-08)
12 of 15 hard gates complete. Only remaining: **#8** (upstream sandbox OAuth extraction from `src/main/lib/trpc/routers/claude-code.ts:178-220`). See CLAUDE.md "Chosen enterprise auth strategy" block for the full status and [.claude/PROJECT_INDEX.md](.claude/PROJECT_INDEX.md) for the per-gate table.
