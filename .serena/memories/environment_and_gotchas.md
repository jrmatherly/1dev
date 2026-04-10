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
- Electron 41.2.0 (EOL 2026-08-25, upgraded 2026-04-09), electron-vite 5.0.0, Vite 7.3.2 (upgraded from 6.4.2 on 2026-04-10, Phase A of upgrade-vite-8-build-stack)
- Tailwind 3.x, shiki 3.x, Claude CLI 2.1.96, Codex 0.118.0
- @azure/msal-node ^5.1.2 (upgraded from 3.8.x), @azure/msal-node-extensions ^5.1.2
- @types/node ^24, @swc/core ^1 (electron-vite 5 peer dep)
- `build.externalizeDeps` config in electron.vite.config.ts (replaced `externalizeDepsPlugin`)

## Upgrade Blockers (as of 2026-04-10)
- **Vite pin (7.x, was 6.x):** Phase A Vite 7.3.2 landed 2026-04-10; Phase B Vite 8 blocked on `electron-vite 6.0.0` stable (currently beta-only `6.0.0-beta.0`)
- **Shiki pin (3.x):** `@pierre/diffs` pins `shiki: ^3.0.0` AND `@shikijs/transformers: ^3.0.0` — blocks shiki 4
- **~~TypeScript 6.0 risk~~** ✅ **RESOLVED 2026-04-10:** Upgraded to TS 6.0.2. tsconfig now has explicit `types: ["node", "better-sqlite3", "diff", "react", "react-dom"]` and `noUncheckedSideEffectImports: false`. Baseline unchanged at 80, zero new errors. tsgo upgraded to 7.0.0-dev.
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
