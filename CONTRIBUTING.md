# Contributing to 1Code

## Getting Started

This is the **enterprise fork** of upstream 1Code, being progressively decoupled from the `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM + Microsoft Entra via Envoy Gateway). See [`docs/enterprise/fork-posture.md`](docs/enterprise/fork-posture.md) for the full fork posture and [`docs/enterprise/upstream-features.md`](docs/enterprise/upstream-features.md) for the F1-F10 restoration catalog.

**Canonical documentation:**

- [`docs/architecture/`](docs/architecture/) — codebase layout, database, tech stack, tRPC routers, upstream boundary
- [`docs/conventions/`](docs/conventions/) — pinned deps, quality gates, regression guards, brand taxonomy
- [`docs/operations/`](docs/operations/) — release process, debugging first install, env gotchas, cluster access

**Claude Code guidance:** [`CLAUDE.md`](CLAUDE.md) is a concise overview (identity + critical rules + pointers). Behavioral rules loaded automatically by Claude Code live in [`.claude/rules/`](.claude/rules/).

**Spec-driven development:** This repo uses OpenSpec 1.2.0. From Claude Code, run `/opsx:propose`, `/opsx:apply`, or `/opsx:explore`. Active proposals live in `openspec/changes/`.

**Questions:** See the community channel configured in `.env` (`VITE_COMMUNITY_URL`), or open a GitHub issue.

## Building from Source

**Prerequisites:** Bun, Python 3.11 (or Python 3.12+ with `setuptools`), Xcode Command Line Tools (macOS).

> **Python note:** Python 3.11 is recommended for native module rebuilds (`better-sqlite3`, `node-pty`). On Python 3.12+, install `setuptools` first: `pip install setuptools`.

```bash
bun install
bun run claude:download  # Download Claude binary (required!)
bun run codex:download   # Download Codex binary (required!)
bun run dev              # Development with hot reload
```

For production builds and release workflows, see [`docs/operations/release.md`](docs/operations/release.md).

## Code Quality

Before submitting a PR, run **all five** automated quality gates:

```bash
bun run ts:check           # Type check with tsgo (baseline tracking via .claude/.tscheck-baseline)
bun run build              # Compile via electron-vite (validates packaging pipeline)
bun test                   # bun:test regression guards + service tests (207 tests across 37 files)
bun audit                  # Check for known vulnerabilities
cd docs && bun run build   # xyd-js docs site build
```

> **None of these is a superset of the others** — run all five. All five are enforced in CI (`.github/workflows/ci.yml`) on every PR to `main`. See [`docs/conventions/quality-gates.md`](docs/conventions/quality-gates.md) for the canonical reference including what each gate catches and why skipping any one creates a blind spot.

## Analytics & Telemetry

Analytics (PostHog) and error tracking (Sentry) are **disabled by default** in open source builds. They only activate if you set the environment variables in `.env.local`. Copy `.env.example` to `.env.local` and uncomment desired integrations.

## Contributing

### Before You Start

For feature additions, breaking changes, or architecture changes, use the OpenSpec workflow to propose the change first. From Claude Code: run `/opsx:propose` to scaffold a proposal, or `/opsx:explore` to think through the design. Active proposals live in `openspec/changes/<proposal-id>/`.

### Workflow

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run all five quality gates: `bun run ts:check && bun run build && bun test && bun audit && (cd docs && bun run build)`
5. Submit a PR with a clear description of what and why

### Code Conventions

- **Canonical architecture:** [`docs/architecture/`](docs/architecture/)
- **Conventions reference:** [`docs/conventions/`](docs/conventions/)
- **Claude Code behavioral rules:** [`.claude/rules/`](.claude/rules/) (auto-loaded when working on matching files)
- File naming: PascalCase for components, camelCase for utilities, kebab-case for stores
- State management: Jotai (UI), Zustand (persisted), React Query via tRPC (server)
- IPC: all main↔renderer via tRPC, no raw IPC calls
- Database: Drizzle ORM (schema at `src/main/lib/db/schema/index.ts` is source of truth)

## License

Apache 2.0
