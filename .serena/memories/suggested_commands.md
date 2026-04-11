# Suggested Commands

## Development
- `bun run dev` — Start Electron with hot reload
- `bun run build` — Compile TypeScript via electron-vite
- `bun run preview` — Preview built app

## Quality Gates (ALL 6 REQUIRED)
- `bun run ts:check` — TypeScript check via tsgo (**baseline: 0 errors**, see `.claude/.tscheck-baseline`)
- `bun run lint` — ESLint + eslint-plugin-sonarjs project-wide scan (~8s)
- `bun run build` — Full electron-vite build
- `bun test` — 15 regression guards + 19 1code-api test files = **172 tests across 34 files** (162 pass + 10 skipped integration tests, ~6s)
- `bun audit` — Dependency vulnerability scan
- `cd docs && bun run build` — Docs site build (also a CI gate)
- Canonical reference: [`docs/conventions/quality-gates.md`](../../docs/conventions/quality-gates.md)

## Documentation Site
- `cd docs && bunx xyd` — Dev server at http://localhost:5175
- `cd docs && bun run build` — Static output to .xyd/build/client/
- `cd docs && bun install --frozen-lockfile` — Reproducible install

## Database (desktop app — SQLite)
- `bun run db:generate` — Generate migrations from schema
- `bun run db:push` — Push schema directly (dev only)
- `bun run db:studio` — Open Drizzle Studio GUI

## 1code-api Service (services/1code-api/)
- `cd services/1code-api && bun install` — Install service deps
- `cd services/1code-api && bun run dev` — tsx watch mode
- `cd services/1code-api && bun test` — Run service tests
- `cd services/1code-api && DATABASE_URL=<url> bunx drizzle-kit generate` — Generate new migration
- `docker build -t 1code-api:local -f services/1code-api/Dockerfile services/1code-api/` — Build container
- `docker run -d --name 1code-api-pg -e POSTGRES_USER=onecode -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=onecode -p 5433:5432 postgres:18-alpine` — Start test PostgreSQL
- `docker run -d -p 8000:8000 -e DEV_BYPASS_AUTH=true -e DATABASE_URL="postgresql://onecode:devpass@host.docker.internal:5433/onecode" 1code-api:local` — Run container

## AI Binary Management
- `bun run claude:download` — Download Claude CLI binary (pinned 2.1.96)
- `bun run codex:download` — Download Codex binary (pinned 0.118.0)

## OpenSpec Workflow
- `/opsx:propose <description>` — Create a new change proposal
- `/opsx:apply <name>` — Implement change tasks
- `/opsx:archive <name>` — Archive and promote specs
- `bunx @fission-ai/openspec@1.2.0 validate --all --strict --no-interactive` — Validate all changes
- `/roadmap` — View, add, or complete items on the centralized roadmap

## Upstream Backend Discovery
- `grep -rn "remoteTrpc\." src/renderer/` — Find upstream tRPC call sites
- See `docs/enterprise/upstream-features.md` for the F1-F10 catalog
- See `docs/architecture/upstream-boundary.md` for the rules

## Claude Code Skills
- `/docs-drift-check` — Audit docs against codebase (drift points catalogued in the skill itself)
- `/new-regression-guard` — Scaffold new regression guard
- `/new-router` — Scaffold new tRPC router
- `/phase-0-progress` — Verify Phase 0 gate status against `docs/enterprise/phase-0-gates.md`
- `/verify-pin` — Safely bump load-bearing pins (Vite, Tailwind, shiki, Electron, Claude, Codex, xyd-js)
- `/upstream-boundary-check` — Verify `remoteTrpc.*` / `fetch(${apiUrl}/...)` additions have F-entry coverage

## Claude Code Rules (auto-loaded)
- Global: `.claude/rules/scratchpad.md`, `.claude/rules/roadmap.md`
- Path-scoped: `.claude/rules/{auth-env-vars,credential-storage,database,openspec,testing,tscheck-baseline,upstream-boundary,vite-config}.md`
- Index: `.claude/rules/README.md`

## GitHub / CI Forensics
- `gh workflow run ci.yml --ref main` — Trigger manual CI dispatch on main (CI normally only runs on PRs)
- `gh run list --workflow=ci.yml --limit 10` — Filter to CI runs only
- `gh run view <id> --json jobs --jq '.jobs[] | {name, conclusion}'` — Per-job status without log noise
- `gh run view <id> --log-failed` — Only failing step logs
- `gh run watch <id> --exit-status` — Wait for a run to finish and surface exit code
- `gh pr comment <#> --body "@dependabot recreate"` — Refresh a Dependabot PR against current main
- `gh label create <name> --color <hex> --description "<text>"` — Create labels before Dependabot needs them
- `gh label list --limit 100 --json name` — Verify all expected labels exist

## Session Lifecycle
- `/session-sync` — End-of-task sync: CLAUDE.md + Serena memories + roadmap + code-review graph + commit
- `/remember` — Save session state for clean continuation next session

## Serena MCP
- `mcp__serena__activate_project` with `project: "ai-coding-cli"` — required before read/write memories
- `mcp__serena__list_memories` / `mcp__serena__read_memory` — access project memories
