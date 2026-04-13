# Suggested Commands

## Development
- `bun run dev` — Start Electron with hot reload
- `bun run build` — Compile TypeScript via electron-vite
- `bun run preview` — Preview built app

## Quality Gates (5 CI-enforced + 1 local-only lint)
- `bun run ts:check` — TypeScript check via tsgo (**baseline: 0 errors**, see `.claude/.tscheck-baseline`)
- `bun run lint` — ESLint + eslint-plugin-sonarjs project-wide scan (~8s) — **local-only advisory, not CI-enforced**
- `bun run build` — Full electron-vite build
- `bun test` — **30 regression files** (29 guards + 1 frontmatter shim unit test) + 20 1code-api test files. Regression suite: **170 tests / 393 expect() / ~6s**.
- `bun audit` — Dependency vulnerability scan (current baseline: 55 vulns as of 2026-04-13; focus on NEW advisories only)
- `cd docs && bun run build` — Docs site build (also a CI gate; ~20s).
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
- `cd services/1code-api && bun test` — Run service tests (20 test files)
- `cd services/1code-api && DATABASE_URL=<url> bunx drizzle-kit generate` — Generate new migration

## AI Binary Management
- `bun run claude:download` — Download Claude CLI binary (pinned 2.1.96)
- `bun run codex:download` — Download Codex binary (pinned 0.118.0)

## OpenSpec Workflow
- `/opsx:propose <description>` — Create a new change proposal
- `/opsx:apply <name>` — Implement change tasks
- `/opsx:archive <name>` — Archive and promote specs
- `/opsx:verify <name>` — Verify implementation matches artifacts
- `bunx @fission-ai/openspec@1.2.0 validate <change-name> --strict --no-interactive` — Validate a single change
- `bunx @fission-ai/openspec@1.2.0 list --json` — List all active changes with task progress
- `/roadmap` — View, add, or complete items on the centralized roadmap

## Upstream Backend Discovery
- `grep -rn "remoteTrpc\." src/renderer/` — Find upstream tRPC call sites
- `grep -rn "apollosai\.dev" src/` — Find any remaining upstream literals (aux-AI cutover 2026-04-13 eliminated the two agent endpoints)
- See `docs/enterprise/upstream-features.md` for the F1-F12 catalog (F11 + F12 added 2026-04-13)

## Claude Code Skills
- `/project-orchestrator` — **Start here for ambiguous/multi-step tasks.** Routing-layer skill with Step-0 hard-rule gate.
- `/docs-drift-check` — Audit docs against codebase
- `/new-regression-guard` — Scaffold new regression guard
- `/new-router` — Scaffold new tRPC router
- `/phase-0-progress` — Verify Phase 0 gate status
- `/verify-pin` — Safely bump load-bearing pins
- `/upstream-boundary-check` — Verify `remoteTrpc.*` / `fetch(${apiUrl}/...)` additions have F-entry coverage

## Claude Code Rules (auto-loaded)
- Global: `.claude/rules/scratchpad.md`, `.claude/rules/roadmap.md`
- Path-scoped: `.claude/rules/{auth-env-vars,credential-storage,database,openspec,testing,tscheck-baseline,upstream-boundary,vite-config}.md`
- Index: `.claude/rules/README.md`

## GitHub / CI Forensics
- `gh workflow run ci.yml --ref main` — Trigger manual CI dispatch on main
- `gh run list --workflow=ci.yml --limit 10` — Filter to CI runs only
- `gh run view <id> --json jobs --jq '.jobs[] | {name, conclusion}'` — Per-job status
- `gh run view <id> --log-failed` — Only failing step logs
- `gh run watch <id> --exit-status` — Wait for a run to finish and surface exit code

## Worktree Workflow (for scoped-refactor changes)
- `git worktree add ../ai-coding-cli-worktrees/<feature-name> -b feat/<feature-name>`
- `git worktree list` — Inspect active worktrees
- `git worktree remove <path>` — Remove after merge

## Session Lifecycle
- `/session-sync` — End-of-task sync: CLAUDE.md + Serena memories + roadmap + code-review graph + commit
- `/remember` — Save session state for clean continuation next session

## Serena MCP
- `mcp__serena__activate_project` with `project: "ai-coding-cli"` — required before read/write memories
- `mcp__serena__list_memories` / `mcp__serena__read_memory` — access project memories
