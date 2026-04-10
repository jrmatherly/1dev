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
- `actions/checkout@v6`, `oven-sh/setup-bun@v2`, `actions/setup-node@v6` (docs-build only)
- Top-level `permissions: { contents: read }`
- **ts:check is baseline-aware in CI** (fixed 2026-04-09 commit 064dfc2): CI reads `.claude/.tscheck-baseline`, runs tsgo, counts matching errors, fails only if `ACTUAL > BASELINE`. Prints ratchet hint if count drops.
- **docs-build job pins Node 24** explicitly (fixed 2026-04-09): `oven-sh/setup-bun@v2` does NOT install Node — it only installs Bun. xyd-js requires Node >= 22, so docs-build has an explicit `actions/setup-node@v6` step. **Action pinned to v6** (not v4) because `actions/setup-node@v4` declares `using: node20` in its action.yml which triggers GitHub's Node 20 deprecation warning.
- **ci.yml triggers:** `pull_request` + `workflow_dispatch` only, never `push`. Use `gh workflow run ci.yml --ref main` to baseline-test main (CodeQL is the only push-triggered workflow).
- **Useful gh commands:** `gh run view <id> --json jobs --jq '.jobs[] | {name, conclusion}'` for per-job status without log spelunking. `gh run view <id> --log-failed` for targeted failure logs. `gh pr comment <#> --body "@dependabot recreate"` to refresh a Dependabot PR against current main.
- **Dependabot labels must exist in the repo first** — `dependabot.yml` declares `dependencies`, `bun`, `docs`, `github-actions`; all 4 labels were created 2026-04-09. Missing labels cause PRs to open un-labeled AND emit a "labels could not be found" error on every PR.
- **Action runtime ≠ installed Node**: JS actions declare their own runtime Node in `action.yml` (`using: node20` or `node24`) — independent of the Node version they install for user scripts. Check action.yml source-of-truth: `curl -s https://raw.githubusercontent.com/<org>/<repo>/<ref>/action.yml | grep 'using:'`.

## Key Version Pins
- Electron 41.2.0 (EOL 2026-08-25, upgraded 2026-04-09), electron-vite 5.0.0, Vite 7.3.2 (upgraded from 6.4.2 on 2026-04-10, Phase A of upgrade-vite-8-build-stack)
- Tailwind 4.2.2 (upgraded from 3.4.19 on 2026-04-10; CSS-first config, `@tailwindcss/vite` plugin, `tw-animate-css`, `tailwind-merge` 3.5.0), shiki 3.x, Claude CLI 2.1.96, Codex 0.118.0
- @azure/msal-node ^5.1.2 (upgraded from 3.8.x), @azure/msal-node-extensions ^5.1.2
- @types/node ^24, @swc/core ^1 (electron-vite 5 peer dep)
- `build.externalizeDeps` config in electron.vite.config.ts (replaced `externalizeDepsPlugin`)

## Upgrade Blockers (as of 2026-04-10)
- **Vite pin (7.x, was 6.x):** Phase A Vite 7.3.2 landed 2026-04-10; Phase B Vite 8 blocked on `electron-vite 6.0.0` stable (currently beta-only `6.0.0-beta.0`)
- **Shiki pin (3.x):** `@pierre/diffs` pins `shiki: ^3.0.0` AND `@shikijs/transformers: ^3.0.0` — blocks shiki 4
- **~~TypeScript 6.0 risk~~** ✅ **RESOLVED 2026-04-10:** Upgraded to TS 6.0.2. tsconfig now has explicit `types: ["node", "better-sqlite3", "diff", "react", "react-dom"]` and `noUncheckedSideEffectImports: false`. Baseline unchanged at 80, zero new errors. tsgo upgraded to 7.0.0-dev.
- **~~Tailwind 4 risk~~** ✅ **RESOLVED 2026-04-10:** Upgraded to TW 4.2.2. `--tw-ring-*` block rewritten to plain CSS `box-shadow`. Escaped hover selectors verified functional (TW4 keeps same class name format). 5 false renames by upgrade tool fixed (`blur`→`blur-sm`, `outline`→`outline-solid` in non-Tailwind contexts). Section 8 visual QA pending.

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
