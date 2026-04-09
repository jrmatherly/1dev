# Suggested Commands

## Development
- `bun run dev` — Start Electron with hot reload
- `bun run build` — Compile TypeScript via electron-vite
- `bun run preview` — Preview built app

## Quality Gates (ALL REQUIRED)
- `bun run ts:check` — TypeScript check via tsgo (baseline: ~86 errors, see `.claude/.tscheck-baseline`)
- `bun run build` — Full electron-vite build
- `bun test` — 13 regression guards, 53 tests (~2.5s)
- `bun audit` — Dependency vulnerability scan
- `cd docs && bun run build` — Docs site build (also a CI gate)
- Canonical reference: [`docs/conventions/quality-gates.md`](../../docs/conventions/quality-gates.md)

## Documentation Site
- `cd docs && bunx xyd` — Dev server at http://localhost:5175
- `cd docs && bun run build` — Static output to .xyd/build/client/
- `cd docs && bun install --frozen-lockfile` — Reproducible install

## Database
- `bun run db:generate` — Generate migrations from schema
- `bun run db:push` — Push schema directly (dev only)
- `bun run db:studio` — Open Drizzle Studio GUI

## AI Binary Management
- `bun run claude:download` — Download Claude CLI binary (pinned 2.1.96)
- `bun run codex:download` — Download Codex binary (pinned 0.118.0)

## OpenSpec Workflow
- `/opsx:propose <description>` — Create a new change proposal
- `/opsx:apply <name>` — Implement change tasks
- `/opsx:archive <name>` — Archive and promote specs
- `bunx @fission-ai/openspec@1.2.0 validate --all --strict --no-interactive` — Validate all changes

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
- Global: `.claude/rules/scratchpad.md`
- Path-scoped: `.claude/rules/{auth-env-vars,credential-storage,database,openspec,testing,tscheck-baseline,upstream-boundary}.md`
- Index: `.claude/rules/README.md`

## Serena MCP
- `mcp__serena__activate_project` with `project: "ai-coding-cli"` — required before read/write memories
- `mcp__serena__list_memories` / `mcp__serena__read_memory` — access project memories
