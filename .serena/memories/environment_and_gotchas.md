# Environment Notes and Gotchas

## Quality Gates — ALL REQUIRED
- `bun run ts:check` — tsgo (baseline: 32 errors in `.claude/.tscheck-baseline`, reduced from 54 via Cluster A + Cluster C + sidebar dead-code sweep + 4-file targeted fixes + SettingsTab/McpServerStatus literal-union narrowing 2026-04-10)
- `bun run build` — electron-vite 5 build
- `bun test` — 14 regression guards + 5 service test files = 75 tests, ~2.5s
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
- Tailwind 4.2.2 (upgraded from 3.4.19 on 2026-04-10; CSS-first config, `@tailwindcss/vite` plugin, `tw-animate-css`, `tailwind-merge` 3.5.0; **no longer a version pin** — removed from `pinned-deps.md`), shiki 4.0.2 (upgraded from 3.x on 2026-04-10 via `upgrade-shiki-4` OpenSpec), Claude CLI 2.1.96, Codex 0.118.0 (SHA256-pinned in `scripts/download-codex-binary.mjs`)
- @azure/msal-node ^5.1.2 (upgraded from 3.8.x), @azure/msal-node-extensions ^5.1.2
- @types/node ^24, @swc/core ^1 (electron-vite 5 peer dep)
- `build.externalizeDeps` config in electron.vite.config.ts (replaced `externalizeDepsPlugin`)

## Upgrade Blockers (as of 2026-04-10)
- **Vite pin (7.x, was 6.x):** Phase A Vite 7.3.2 landed 2026-04-10; Phase B Vite 8 blocked on `electron-vite 6.0.0` stable (currently beta-only `6.0.0-beta.0`)
- **Shiki 4.0.2 (resolved 2026-04-10):** upgraded from 3.x via `upgrade-shiki-4` OpenSpec change. The `@pierre/diffs` pins shiki as regular `dependency` (not `peerDependency`) so Bun installs a nested duplicate `shiki@3.23.0` under `@pierre/diffs/node_modules/` while top-level advances to `4.0.2`. Archived as `upgrade-shiki-4` with `shiki-highlighter` baseline spec (6 requirements). PR #11 merge commit `6136048`
- **~~TypeScript 6.0 risk~~** ✅ **RESOLVED 2026-04-10:** Upgraded to TS 6.0.2. tsconfig now has explicit `types: ["node", "better-sqlite3", "diff", "react", "react-dom"]` and `noUncheckedSideEffectImports: false`. Baseline unchanged at 80, zero new errors. tsgo upgraded to 7.0.0-dev.
- **~~Tailwind 4 risk~~** ✅ **RESOLVED 2026-04-10:** Upgraded to TW 4.2.2. `--tw-ring-*` block rewritten to plain CSS `box-shadow`. Escaped hover selectors verified functional (TW4 keeps same class name format). 5 false renames by upgrade tool fixed (`blur`→`blur-sm`, `outline`→`outline-solid` in non-Tailwind contexts). Visual QA completed (10/10 tasks verified, 2 additional false renames fixed by code review). Change archived.

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
- **Release workflow:** `.github/workflows/release.yml` — tag-push + workflow_dispatch. 3-OS matrix → draft GitHub Release. SHA-pinned `softprops/action-gh-release@153bb8e # v2.6.1`. Bun pinned to 1.3.11. macOS runner pinned to macos-15. Unsigned first iteration (CSC_IDENTITY_AUTO_DISCOVERY=false). macOS downloads both arm64+x64 binaries via `--all` flag.
- **Dependabot labels:** `dependencies`, `bun`, `docs`, `github-actions` all exist in the repo (created 2026-04-09). Missing labels cause PRs to open un-labeled with an error.
- **Release build CI gotchas (resolved v0.0.79, 2026-04-10):**
  - **Windows GPG path mixing (RESOLVED):** MSYS2-compiled GPG from Git for Windows mangles both `--homedir` and `GNUPGHOME` Windows paths. Fix: `toGpgPath()` in `download-claude-binary.mjs` converts `C:\Users\...` → `/c/Users/...` (MSYS-compatible POSIX format). Chocolatey `gpg4win` and `gnupg` both hang on CI runners (>20 min) — do NOT use.
  - **Cross-org GITHUB_TOKEN 403 (RESOLVED 2026-04-10 via direct-URL rewrite):** `scripts/download-codex-binary.mjs` now constructs `github.com/openai/codex/releases/download/rust-v{version}/{asset}` URLs directly from a pinned `PINNED_CODEX_VERSION` + `PINNED_HASHES` map and verifies SHA256 against the baked-in hashes. **Zero `api.github.com` calls in CI** → immune to unauthenticated rate-limit 403s (which caused v0.0.80/v0.0.81 macOS build failures before the rewrite). When bumping the Codex pin, regenerate `PINNED_HASHES` locally (one-time api.github.com call from the dev machine). The previous retry-with-backoff workaround was insufficient because 60s of backoff cannot cross a 60-minute rate-limit window.
  - **bun.lock regeneration:** After devDependency changes, `bun.lock` must be regenerated or CI `--frozen-lockfile` fails.
  - **macOS runner OOM (RESOLVED):** macOS-15 runners have only 7 GB RAM. Fix: `NODE_OPTIONS="--max-old-space-size=6144"` on the build step in `release.yml`. Build produces 463 renderer chunks from monaco/mermaid/shiki.
  - **Partial releases:** `release.yml` uses `if: !cancelled()` + `fail_on_unmatched_files: false` to allow partial releases during bootstrap. Tighten once all platforms are stable.
- **`/session-sync` skill:** End-of-task drift sync for CLAUDE.md, Serena memories, roadmap, code-review graph. Run after every significant change instead of typing the full multi-command chain.
- **`bun build` + `import.meta.dirname` gotcha:** `bun build` preserves `import.meta.dirname` as a runtime value in the output bundle, but relative paths computed from it at module-load time embed the ORIGINAL source file location (e.g. `src/routes/changelog.ts`), not the bundled location (`dist/index.js`). For runtime file lookups (changelog dir, resources), use `process.cwd()` + env override instead of `resolve(import.meta.dirname, "../...")`. Discovered 2026-04-10 in `services/1code-api/src/routes/changelog.ts`.
- **`drizzle-kit generate` requires DATABASE_URL even when offline:** The CLI validates config at startup before checking if a database connection is actually needed. For scaffolding a new service with no DB yet, pass a placeholder: `DATABASE_URL="postgresql://localhost/x" bunx drizzle-kit generate`.
- **Postgres 18 volume mount change:** Postgres 18 moved the default data directory, so existing volume mounts from Postgres 17 (`/var/lib/postgresql/data`) need reconciling. For fresh test containers without volumes this doesn't matter.
- **`.dockerignore` gotcha for bundled TypeScript services:** Don't exclude `tsconfig.json` even if the Dockerfile uses `bun build` — the bundler reads tsconfig for path aliases and target config. Exclude `dist/`, `node_modules/`, tests, README — but keep tsconfig.
