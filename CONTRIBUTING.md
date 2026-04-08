# Contributing to 1Code

## Getting Started

- **Architecture & Tech Stack**: See [CLAUDE.md](CLAUDE.md) for detailed architecture, patterns, and important files
- **Spec-Driven Development**: See [openspec/AGENTS.md](openspec/AGENTS.md) for proposal-based development workflow
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

Before submitting a PR, run **both** automated quality gates:

```bash
bun run ts:check    # Type check with tsgo (stricter — catches errors esbuild masks)
bun run build       # Compile via electron-vite (validates the packaging pipeline)
```

> Note: There is no test suite configured (no Jest/Vitest/Playwright). `ts:check` and `build` are complementary — neither is a superset of the other, so run both.

### Dependency Hygiene

```bash
bun audit           # Check for known vulnerabilities in installed dependencies
bun outdated        # List outdated packages (use `bun update` for semver-safe upgrades)
```

## Open Source vs Hosted Version

This is the open-source version of 1Code. Some features require the hosted backend at 1code.dev:

| Feature | Open Source | Hosted (1code.dev) |
|---------|-------------|-------------------|
| Local AI chat | Yes | Yes |
| Claude Code integration | Yes | Yes |
| Git worktrees | Yes | Yes |
| Terminal | Yes | Yes |
| Sign in / Sync | No | Yes |
| Background agents | No | Yes |
| Auto-updates | Yes (points at `cdn.21st.dev` by default) | Yes |
| Private Discord & support | No | Yes |
| Early access to new features | No | Yes |

> **Auto-update note:** The auto-update mechanism (`src/main/lib/auto-updater.ts`, `electron-updater`) is wired into every build. By default it polls `https://cdn.21st.dev/releases/desktop`. Self-hosted forks should change `CDN_BASE` in that file (or override the feed URL via `setFeedURL`) to point at their own release channel.

## Analytics & Telemetry

Analytics (PostHog) and error tracking (Sentry) are **disabled by default** in open source builds. They only activate if you set the environment variables in `.env.local`.

## Contributing

### Before You Start
For feature additions, breaking changes, or architecture changes, read [openspec/AGENTS.md](openspec/AGENTS.md) to understand the proposal-driven development process.

### Workflow
1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run quality checks: `bun run ts:check && bun run build`
5. Submit a PR with clear description of what and why

### Code Conventions
See [CLAUDE.md](CLAUDE.md) for:
- File naming conventions (PascalCase for components, camelCase for utilities)
- Architecture patterns (Jotai/Zustand state, tRPC IPC)
- Database patterns (Drizzle ORM usage)

## License

Apache 2.0
