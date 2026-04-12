# Environment Notes and Gotchas

## Security Hardening (Phase A complete, 2026-04-12 PR #17)
- **safeOpenExternal()** at `src/main/lib/safe-external.ts` — ALL `shell.openExternal()` calls must go through this wrapper. Validates URL scheme (`https:`, `http:`, `mailto:` only). Enforced by `tests/regression/open-external-scheme.test.ts`.
- **signedFetch/streamFetch URL origin allowlist** in `src/main/windows/main.ts` — validates request URL origin against `getApiUrl()` before attaching auth tokens. Prevents SSRF token exfiltration.
- **Phase 0 gates page** fixed: subtitle updated from "12 of 15" to "15 of 15" in `docs/enterprise/phase-0-gates.md`.
- **CI audit gate** now surfaces high/critical severity advisory counts (was silently swallowing all via `|| true`).
- **Remaining Phase A tasks** (1.14-1.17): SecurityPolicy promotion + CiliumNetworkPolicy default-deny are cross-repo cluster tasks.

## Quality Gates — ALL REQUIRED
- `bun run ts:check` — tsgo (**baseline: 0 errors** in `.claude/.tscheck-baseline`, reduced from 32 → 0 on 2026-04-11 commit `e1efae2` via full 10-bucket sweep from `.scratchpad/code-problems/002-analysis.md`). **CI now fails on ANY new TS error.**
- `bun run lint` — ESLint + eslint-plugin-sonarjs project-wide scan (~8s)
- `bun run build` — electron-vite 5 build. **Clean** as of 2026-04-12 — the gray-matter Rollup eval warning was eliminated via PR #14 swap to `front-matter@4.0.2` behind a canonical shim at `src/main/lib/frontmatter.ts`.
- `bun test` — 18 regression guards + 1 frontmatter shim unit test + 20 1code-api test files = **211 tests across 39 files** (201 pass + 10 skipped integration tests needing docker-compose, 0 fail), ~6-7s
- `bun audit` — pre-existing transitive advisories (58+, all dev deps)
- `cd docs && bun run build` — xyd docs site

## CI/CD
- GitHub Actions: 5 parallel jobs aggregated by `CI Status` check
- Branch protection on main: required CI status, admin bypass, no force push
- Concurrency: `cancel-in-progress: true` per PR
- `actions/checkout@v6`, `oven-sh/setup-bun@v2`, `actions/setup-node@v6` (docs-build only)
- Top-level `permissions: { contents: read }`
- **ts:check is baseline-aware in CI** (fixed 2026-04-09 commit 064dfc2): CI reads `.claude/.tscheck-baseline`, runs tsgo, counts matching errors, fails only if `ACTUAL > BASELINE`. With baseline now at 0, any new TS error breaks CI.
- **docs-build job pins Node 24** explicitly: `oven-sh/setup-bun@v2` does NOT install Node. `actions/setup-node@v6` (not v4, which declares `using: node20`).
- **ci.yml triggers:** `pull_request` + `workflow_dispatch` only, never `push`. Use `gh workflow run ci.yml --ref main` to baseline-test main.
- **Useful gh commands:** `gh run view <id> --json jobs --jq '.jobs[] | {name, conclusion}'`, `gh run view <id> --log-failed`, `gh pr comment <#> --body "@dependabot recreate"`.
- **Dependabot labels:** `dependencies`, `bun`, `docs`, `github-actions` all exist in the repo (created 2026-04-09).
- **Action runtime ≠ installed Node:** JS actions declare their own runtime Node in `action.yml`. Check: `curl -s https://raw.githubusercontent.com/<org>/<repo>/<ref>/action.yml | grep 'using:'`.

## Key Version Pins
- Electron 41.2.0 (EOL 2026-08-25, upgraded 2026-04-09), electron-vite 5.0.0, Vite 7.3.2 (upgraded from 6.4.2 on 2026-04-10, Phase A of upgrade-vite-8-build-stack)
- Tailwind 4.2.2 (upgraded from 3.4.19 on 2026-04-10; CSS-first config, `@tailwindcss/vite` plugin, `tw-animate-css`, `tailwind-merge` 3.5.0; **no longer a version pin** — removed from `pinned-deps.md`), shiki 4.0.2 (upgraded from 3.x on 2026-04-10 via `upgrade-shiki-4` OpenSpec), Claude CLI 2.1.96, Codex 0.118.0 (SHA256-pinned in `scripts/download-codex-binary.mjs`)
- @azure/msal-node ^5.1.2 (upgraded from 3.8.x), @azure/msal-node-extensions ^5.1.2
- @types/node ^24, @swc/core ^1 (electron-vite 5 peer dep)
- `build.externalizeDeps` config in electron.vite.config.ts (replaced `externalizeDepsPlugin`)
- **PostHog analytics now env-var-driven (2026-04-12 PR #16):** Hardcoded upstream PostHog key fallback (`phc_wM7gbrJ...`) removed from `src/main/lib/analytics.ts`. Analytics disabled when `MAIN_VITE_POSTHOG_KEY` / `VITE_POSTHOG_KEY` are unset. Renderer was already correct (no fallback). All callers no-op through existing guard chain. Privacy toggle in Preferences hidden when `VITE_POSTHOG_KEY` is unset.
- **Community/Feedback links now env-var-driven (2026-04-12 PR #16):** Discord replaced with Slack (`VITE_COMMUNITY_URL`). Feedback button gated by `VITE_FEEDBACK_URL`. Both hidden when env vars are unset. No hardcoded upstream URLs remain in the UI.
- ~~gray-matter@4.0.3~~ — REMOVED 2026-04-12 via PR #14. Replaced by `front-matter@4.0.2` (behind canonical shim at `src/main/lib/frontmatter.ts`). Note: `services/1code-api/src/routes/changelog.ts` still uses `gray-matter` directly because the service workspace has its own `package.json` declaring it (out of scope for the Electron-side migration). If service-side parsing is unified later, the same shim pattern should be replicated under `services/1code-api/src/lib/`.

## Upgrade Blockers (as of 2026-04-11)
- **Vite pin (7.x, was 6.x):** Phase A Vite 7.3.2 landed 2026-04-10; Phase B Vite 8 blocked on `electron-vite 6.0.0` stable (currently beta-only `6.0.0-beta.0`)

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
- **Release workflow:** `.github/workflows/release.yml` — tag-push + workflow_dispatch. 3-OS matrix → draft GitHub Release. SHA-pinned `softprops/action-gh-release@153bb8e # v2.6.1`. Bun pinned to 1.3.11. macOS runner pinned to macos-15. Unsigned first iteration.
- **Dependabot labels:** all 4 expected labels exist in the repo.
- **Release build CI gotchas (resolved v0.0.79, 2026-04-10):**
  - **Windows GPG path mixing (RESOLVED):** MSYS2-compiled GPG mangles Windows paths. Fix: `toGpgPath()` in `download-claude-binary.mjs` converts `C:\Users\...` → `/c/Users/...`.
  - **Cross-org GITHUB_TOKEN 403 (RESOLVED):** `scripts/download-codex-binary.mjs` skips api.github.com entirely — pinned SHA256 + direct release-asset URLs.
  - **bun.lock regeneration:** After devDependency changes, `bun.lock` must be regenerated or CI `--frozen-lockfile` fails.
  - **macOS runner OOM (RESOLVED):** macOS-15 has 7 GB RAM. Fix: `NODE_OPTIONS="--max-old-space-size=6144"`.
- **`/session-sync` skill:** End-of-task drift sync for CLAUDE.md, Serena memories, roadmap, code-review graph.
- **`bun build` + `import.meta.dirname` gotcha:** `bun build` preserves `import.meta.dirname` as runtime value but relative paths embed ORIGINAL source file location. For runtime file lookups, use `process.cwd()` + env override.
- **`drizzle-kit generate` requires DATABASE_URL even when offline:** Pass placeholder: `DATABASE_URL="postgresql://localhost/x" bunx drizzle-kit generate`.
- **Postgres 18 volume mount change:** Postgres 18 moved the default data directory; existing volume mounts from Postgres 17 need reconciling.
- **`.dockerignore` gotcha for bundled TypeScript services:** Don't exclude `tsconfig.json` — the bundler reads it for path aliases. Exclude `dist/`, `node_modules/`, tests, README — but keep tsconfig.
- **OpenSpec CLI `validate` flag shape:** Use `bunx @fission-ai/openspec@1.2.0 validate <change-name> --strict --no-interactive`. The `--change <name>` form does NOT exist (use positional arg); `--changes` (plural) is a bulk "validate all changes" flag. Discovered during session-sync 2026-04-11. **Note**: this gotcha was re-confirmed during the gray-matter migration on 2026-04-12 — the original `tasks.md` §12.1 had the wrong flag form which had to be corrected at apply time.
- **Worktree fresh-checkout install gotchas (3-fold):** A fresh git worktree of this repo needs THREE install passes, not one. (1) `bun install --frozen-lockfile` at root — installs the Electron app deps. (2) `cd services/1code-api && bun install --frozen-lockfile` — services/1code-api/ is NOT a bun workspace (no `workspaces` field in root package.json), it's a standalone subdirectory with its own package.json declaring fastify/yaml/gray-matter/drizzle. Without this, `bun test` walks the repo and finds service test files that fail with `Cannot find package 'fastify'`. (3) `cd docs && bun install --frozen-lockfile` — docs/ is also a separate workspace; needed for `bun run build` (the xyd binary). (3.5 optional) `bun run codex:download` — populates `resources/bin/<platform>-<arch>/codex` for `bun run dev`'s Codex MCP warmup. **Discovered while applying `replace-gray-matter-with-front-matter` 2026-04-12; same pattern was already in CI's docs-build job for docs/, but the test job was missing the services/1code-api/ install — fixed in PR #15 `9efefc9`.**
- **bun's "orphan node_modules after `bun remove`" quirk:** `bun remove <pkg>` correctly updates `package.json` and `bun.lock` but does NOT prune transitively-dropped packages from `node_modules/` on disk. Subsequent `bun install` reports "no changes" because the lockfile is consistent. Force-prune via `rm -rf node_modules && bun install --frozen-lockfile` is the workaround. Discovered during gray-matter migration: removing gray-matter left `section-matter` and `strip-bom-string` as orphan directories on disk for the disk-state assertion in tasks.md §2.4.
- **Rollup warnings are static-analysis based, not runtime:** Passing `{ engines: { yaml: ... } }` to gray-matter at call sites does NOT silence the `eval` warning because Rollup inspects the bundled source, not the runtime path. Empirically verified during the `replace-gray-matter-with-front-matter` research spike. Only removing the module from the bundle (via dependency swap) eliminates the warning.

## TS Baseline Tooling (load-bearing)
- `.claude/.tscheck-baseline` = **0** (was 32 before 2026-04-11 sweep)
- PostToolUse hook in `.claude/settings.json` re-runs tsgo after every `.ts`/`.tsx` edit and blocks if count increases
- CI uses the same file (`.github/workflows/ci.yml`)
- To legitimately reduce: `bun run ts:check 2>&1 | grep -c "error TS" > .claude/.tscheck-baseline`
- DO NOT delete the baseline file
