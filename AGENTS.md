
## Quick Reference for AI Agents

- **Project**: 1Code — local-first Electron desktop app for parallel AI-assisted development
- **Fork posture**: This is the **enterprise fork** of upstream 1Code, being decoupled from the `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM + Microsoft Entra via Envoy Gateway). See [`docs/enterprise/fork-posture.md`](docs/enterprise/fork-posture.md) for the full context.
- **Canonical docs**: [`docs/`](docs/) — xyd-js site with five tabs (Architecture, Enterprise, Conventions, Operations, API Reference). This is the source-of-truth home for all architectural facts.
- **Claude Code guidance**: [`CLAUDE.md`](CLAUDE.md) — concise identity + critical rules + pointers (124 lines, links to `docs/` and `.claude/rules/` for details).
- **Claude Code rules (auto-loaded)**: [`.claude/rules/`](.claude/rules/) — 2 global rules (scratchpad, roadmap) + 8 path-scoped rules (auth-env-vars, credential-storage, database, openspec, testing, tscheck-baseline, upstream-boundary, vite-config).
- **Repo map**: [`.claude/PROJECT_INDEX.md`](.claude/PROJECT_INDEX.md) — structural index (routers, tables, migrations, features).
- **Proposal workflow**: OpenSpec 1.2.0. From Claude Code, run `/opsx:propose`, `/opsx:apply`, `/opsx:explore`, or `/opsx:archive`. Active proposals live in `openspec/changes/`.
- **Contributing**: See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup and contribution guidelines.

### Key Facts
- Package manager: **bun**
- AI SDK: `@anthropic-ai/claude-agent-sdk` (not `claude-code`)
- Quality gates: `bun run ts:check && bun run build && bun test && bun audit && (cd docs && bun run build)` — run **all five** before submitting a PR. None is a superset of the others. CI enforces the same five. See [`docs/conventions/quality-gates.md`](docs/conventions/quality-gates.md).
- IPC: tRPC via `trpc-electron` (22 routers in `createAppRouter`) — see [`docs/architecture/trpc-routers.md`](docs/architecture/trpc-routers.md)
- State: Jotai (UI) + Zustand (persisted) + React Query (server)
- Database: Drizzle ORM + SQLite, 7 tables, auto-migrates on startup — see [`docs/architecture/database.md`](docs/architecture/database.md)
- Pinned binaries: Claude CLI `2.1.96`, Codex CLI `0.118.0` (see `claude:download` / `codex:download` in `package.json`, full rationale in [`docs/conventions/pinned-deps.md`](docs/conventions/pinned-deps.md))
- Electron: `41.2.0` (upgraded from 40.8 on 2026-04-11)

### Upstream Backend Boundary (important for this fork)
Before claiming a feature is "local-only", grep for upstream-dependent call sites — they will break when the `1code.dev` backend is retired:

```bash
grep -rn "remoteTrpc\." src/renderer/         # typed tRPC client to upstream
grep -rn '\${apiUrl}' src/                    # raw fetch() to upstream
```

Full catalog: [`docs/enterprise/upstream-features.md`](docs/enterprise/upstream-features.md) (F1-F10). Architectural boundary reference: [`docs/architecture/upstream-boundary.md`](docs/architecture/upstream-boundary.md). Claude Code rule enforces it: [`.claude/rules/upstream-boundary.md`](.claude/rules/upstream-boundary.md).

### Phase 0 Migration Status

**15 of 15 hard gates complete ✅.** Canonical status: [`docs/enterprise/phase-0-gates.md`](docs/enterprise/phase-0-gates.md).

Phase 1 enterprise auth wiring is complete: `auth-manager.ts` uses a Strangler Fig adapter gated by `enterpriseAuthEnabled` flag, `applyEnterpriseAuth()` injects tokens into the Claude spawn env, and the `enterpriseAuth` tRPC router exposes sign-in/out to the renderer. Settings UI and cluster config are deferred to future OpenSpec proposals.
