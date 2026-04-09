# Contributing to 1Code

## Getting Started

- **Architecture & Tech Stack**: See [CLAUDE.md](CLAUDE.md) for detailed architecture, patterns, and important files
- **Spec-Driven Development**: This repo uses OpenSpec 1.2.0. Run `/opsx:propose`, `/opsx:apply`, or `/opsx:explore` inside Claude Code, or see the corresponding skills under `.claude/skills/openspec-*`. Active proposals live in `openspec/changes/`.
- **Questions**: Ask on our [Discord](https://discord.gg/8ektTZGnj4)

## Building from Source

Prerequisites: Bun, Python 3.11 (or Python 3.12+ with `setuptools`), Xcode Command Line Tools (macOS)

> **Python note:** Python 3.11 is recommended for native module rebuilds (`better-sqlite3`, `node-pty`). On Python 3.12+, install setuptools first: `pip install setuptools`

```bash
bun install
bun run claude:download  # Download Claude binary (required!)
bun run codex:download   # Download Codex binary (required!)
bun run dev              # Development with hot reload
```

For production builds:
```bash
bun run build            # Compile app
bun run package:mac      # Create distributable (or package:win, package:linux)
```

### Environment Setup (Optional)

To enable analytics or error tracking for development:

1. Copy the environment template: `cp .env.example .env.local`
2. Edit `.env.local` and uncomment desired integrations (Sentry, PostHog)
3. Fill in your API keys

### Database Development

The app auto-migrates on startup, but if you need to manage the database manually:

```bash
bun run db:generate   # Generate migrations from schema changes
bun run db:push       # Push schema changes (dev only)
bun run db:studio     # Open Drizzle Studio GUI for inspection
```

## Code Quality

Before submitting a PR, run **all four** automated quality gates:

```bash
bun run ts:check    # Type check with tsgo (stricter — catches errors esbuild masks)
bun run build       # Compile via electron-vite (validates the packaging pipeline)
bun test            # bun:test regression guards under tests/regression/
bun audit           # Check for known vulnerabilities in installed dependencies
```

> **None of these is a superset of the others** — run all four. The same four are enforced in CI (`.github/workflows/ci.yml`) on every PR to `main`.
>
> **Test suite:** `bun:test` (built in, no config) bootstrapped 2026-04-08 for Phase 0 regression guards under `tests/regression/`. Broader test adoption is an open Phase 0 item — new regression guards welcome, especially for behavior that can't be caught by `ts:check`.

### Dependency Hygiene

```bash
bun outdated        # List outdated packages (use `bun update` for semver-safe upgrades)
```

`bun audit` is already part of the four quality gates above — no need to run it separately.

## Fork Posture

This is the **enterprise fork** of upstream [1Code](https://1code.dev), being progressively decoupled from the `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM + Microsoft Entra ID via Envoy Gateway).

**Self-host-everything theme (locked 2026-04-08):** Every upstream-dependent feature is being reverse-engineered, re-created, and self-hosted. Dropping features or pointing at someone else's hosted service are both off the table. See `docs/enterprise/upstream-features.md` for the per-feature restoration catalog (F1–F10) and `docs/enterprise/auth-strategy.md` v2.1 for the chosen enterprise auth strategy (empirically validated against the Talos AI cluster).

**What works today without the upstream backend:** local AI chat (Claude, Codex, Ollama), Claude Code integration, git worktrees, integrated terminal, file viewer, MCP server management, skills & slash commands, the built-in git client.

**What's pending restoration:** Background agents (F1), Automations & Inbox (F2), remote chat sync (F3), hosted voice (F4), PWA companion (F6), hosted REST API (F8), Live Browser Previews (F9).

**What was investigated and found to be local-only (no restoration needed):** Plugin marketplace (F7) reads `~/.claude/plugins/` directly.

> **Auto-update note:** The auto-update mechanism (`src/main/lib/auto-updater.ts`, `electron-updater`) is wired into every build. By default `CDN_BASE` on line 33 of that file points at `https://cdn.apollosai.dev/releases/desktop`. Self-hosted forks must change `CDN_BASE` (or override the feed URL via `setFeedURL`) to point at their own release channel before shipping.

## Analytics & Telemetry

Analytics (PostHog) and error tracking (Sentry) are **disabled by default** in open source builds. They only activate if you set the environment variables in `.env.local`.

## Contributing

### Before You Start
For feature additions, breaking changes, or architecture changes, use the OpenSpec workflow to propose the change first. From Claude Code: run `/opsx:propose` to scaffold a proposal, or `/opsx:explore` to think through the design. Active proposals live in `openspec/changes/<proposal-id>/`.

### Workflow
1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run all four quality gates: `bun run ts:check && bun run build && bun test && bun audit`
5. Submit a PR with clear description of what and why

### Code Conventions
See [CLAUDE.md](CLAUDE.md) for:
- File naming conventions (PascalCase for components, camelCase for utilities)
- Architecture patterns (Jotai/Zustand state, tRPC IPC)
- Database patterns (Drizzle ORM usage)

## License

Apache 2.0
