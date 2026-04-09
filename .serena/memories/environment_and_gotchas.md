# Environment Notes and Gotchas

## Quality Gates — ALL REQUIRED
- `bun run ts:check` — tsgo (baseline: 86 errors in `.claude/.tscheck-baseline`)
- `bun run build` — electron-vite 5 build
- `bun test` — 12 regression guards, 48 tests, ~2.5s
- `bun audit` — pre-existing transitive advisories (58+, all dev deps)
- `cd docs && bun run build` — xyd docs site

## CI/CD
- GitHub Actions: 5 parallel jobs aggregated by `CI Status` check
- Branch protection on main: required CI status, admin bypass, no force push
- Concurrency: `cancel-in-progress: true` per PR
- `actions/checkout@v6`, `oven-sh/setup-bun@v2`
- Top-level `permissions: { contents: read }`

## Key Version Pins
- Electron 40.8.5, electron-vite 5.0.0, Vite 6.x (can upgrade to 7 now)
- Tailwind 3.x, shiki 3.x, Claude CLI 2.1.96, Codex 0.118.0
- @types/node ^24, @swc/core ^1 (electron-vite 5 peer dep)
- `build.externalizeDeps` config in electron.vite.config.ts (replaced `externalizeDepsPlugin`)

## Dev Auth
- `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env` — skips login, creates `dev@localhost`
- Only works when `!app.isPackaged`

## Docs Build (xyd)
- Build script cleans `.xyd/host/node_modules` and `.xyd/build` first (Node 24 rmSync fix)
- React key warning (FwSubNav) and Orama sourcemap warnings are upstream bugs — cosmetic

## Security
- `createId()` uses `crypto.randomBytes()` (not `Math.random()`) for DB primary keys
- URL checks use exact domain match: `h === "anthropic.com" || h.endsWith(".anthropic.com")`
- Terminal path escaping: backslashes escaped before quotes
- CodeQL: 19 findings resolved, 0 open

## Code-Review Graph
- Delete `graph.db` before rebuild to avoid SQLite transaction error
- `rm .code-review-graph/graph.db` then use `build_or_update_graph_tool(full_rebuild=True)`

## Tool Gotchas
- `claude-mem` Read hook: first Read() returns line 1 only — use `cat -n` via Bash
- Serena requires `activate_project` before `read_memory`
- `bun audit` exits non-zero (normal — pre-existing advisories)
- `gh auth switch --user jrmatherly` needed for repo admin operations (branch protection, alert dismissal)
