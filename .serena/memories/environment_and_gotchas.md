# Environment Notes and Gotchas

## Quality Gates — ALL REQUIRED
- `bun run ts:check` — tsgo (baseline: 80 errors in `.claude/.tscheck-baseline`, improved from 86 after mock-api Phase 2 migration)
- `bun run build` — electron-vite 5 build
- `bun test` — 14 regression guards, 58 tests, ~2.5s
- `bun audit` — pre-existing transitive advisories (58+, all dev deps)
- `cd docs && bun run build` — xyd docs site

## CI/CD
- GitHub Actions: 5 parallel jobs aggregated by `CI Status` check
- Branch protection on main: required CI status, admin bypass, no force push
- Concurrency: `cancel-in-progress: true` per PR
- `actions/checkout@v6`, `oven-sh/setup-bun@v2`
- Top-level `permissions: { contents: read }`

## Key Version Pins
- Electron 40.8.5 (EOL 2026-06-30), electron-vite 5.0.0, Vite 6.x
- Tailwind 3.x, shiki 3.x, Claude CLI 2.1.96, Codex 0.118.0
- @azure/msal-node ^5.1.2 (upgraded from 3.8.x), @azure/msal-node-extensions ^5.1.2
- @types/node ^24, @swc/core ^1 (electron-vite 5 peer dep)
- `build.externalizeDeps` config in electron.vite.config.ts (replaced `externalizeDepsPlugin`)

## Upgrade Blockers (as of 2026-04-09)
- **Vite pin (6.x):** Vite 8 needs electron-vite 6.0.0 (beta-only); Vite 7 works with electron-vite 5.0.0
- **Shiki pin (3.x):** `@pierre/diffs` pins `shiki: ^3.0.0` AND `@shikijs/transformers: ^3.0.0` — blocks shiki 4
- **TypeScript 6.0 risk:** `types` defaults to `[]` — must explicitly list all 5 `@types/*` packages
- **Tailwind 4 risk:** `agents-styles.css` escaped hover selectors (lines 191-195) and `--tw-ring-*` internal vars (lines 219-234) need manual migration

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
