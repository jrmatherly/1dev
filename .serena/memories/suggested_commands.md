# Suggested Commands

## Development
- `bun run dev` — Start Electron with hot reload
- `bun run build` — Compile TypeScript via electron-vite (validates packaging pipeline — quality gate)
- `bun run preview` — Preview built app

## Packaging
- `bun run package` — Package for current platform (dir output)
- `bun run package:mac` — Build macOS (DMG + ZIP)
- `bun run package:win` — Build Windows (NSIS + portable)
- `bun run package:linux` — Build Linux (AppImage + DEB)

## Database (Drizzle + SQLite)
- `bun run db:generate` — Generate migrations from schema
- `bun run db:push` — Push schema directly (dev only)
- `bun run db:studio` — Open Drizzle Studio GUI

## Quality Gates (ALL FOUR — none is a superset)
- `bun run ts:check` — TypeScript check via tsgo (stricter, catches type errors esbuild masks). Requires `npm install -g @typescript/native-preview`. Baseline: **88 errors** stored in `.claude/.tscheck-baseline`. PostToolUse hook tracks drift on every TS edit.
- `bun run build` — Full electron-vite build (validates packaging)
- `bun test` — `bun:test` regression guards under `tests/regression/` (**14 tests across 6 files**, ~200ms total as of 2026-04-09)
- `bun audit` — Dependency vulnerability scan (~57 pre-existing transitive dev-dep advisories; focus on NEW advisories only)
- **Run all four before submitting a PR.** Together they take under 2 minutes on an M-series Mac. CI (`.github/workflows/ci.yml`) enforces the same four on every PR to main.
- To distinguish "errors I introduced" from "pre-existing baseline": `git stash && bun run ts:check 2>&1 | grep -c "error TS" && git stash pop`
- Quick baseline check (without running ts:check): `cat .claude/.tscheck-baseline`

## Dependency Management
- `bun audit --high` — High-severity only (alternative to plain `bun audit`)
- `bun outdated` — List outdated packages
- `bun update` — Semver-safe updates
- `bun update --latest` — Major version bumps (use cautiously — 6 load-bearing pins exist; see `.claude/skills/verify-pin/SKILL.md`)

## Upstream Verification (gh CLI)
- `gh api repos/electron/electron/security-advisories` — verify Electron CVEs
- `gh api repos/electron/electron/releases` — get Electron release dates (e.g. EOL planning)
- `gh api repos/21st-dev/1code/contents/LICENSE --jq '.content' | base64 -d` — fetch upstream LICENSE (used during rebrand attribution work)

## AI Binary Management (PINNED versions)
- `bun run claude:download` — Download Claude CLI binary (pinned 2.1.96)
- `bun run codex:download` — Download Codex binary (pinned 0.118.0)
- `bun run claude:download:all` — Download Claude binary for all platforms
- `bun run codex:download:all` — Download Codex binary for all platforms

## Release
- `bun run release` — Full release pipeline (download binaries → build → package:mac → dist:manifest)
- `bun run release:dev` — Dev release variant (no upload)
- `bun run dist:manifest` — Generate update manifests (`latest-mac.yml`, `latest-mac-x64.yml`)
- `bun run dist:upload` — Upload built artifacts to R2 CDN (`scripts/upload-release.mjs`)
- After release: notarize via electron-builder, then `xcrun stapler staple release/*.dmg`, then re-upload stapled DMGs and manifests
- **NOTE:** `scripts/sync-to-public.sh` and the `sync:public` npm alias were DELETED 2026-04-09 as part of the rebrand-residual-sweep. The enterprise fork has no upstream mirror.

## OpenSpec Workflow
- `openspec new change "<name>"` — Scaffold a new change proposal
- `openspec status --change "<name>" --json` — Check artifact build order and apply readiness
- `openspec instructions <artifact-id> --change "<name>" --json` — Get schema-aware instructions for each artifact (proposal, design, specs, tasks)
- `openspec validate "<name>" --strict` — Validate change against schema
- `openspec archive "<name>" --yes` — Archive a completed change (promotes capability specs to `openspec/specs/`)
- Slash-command equivalents: `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:explore`
- First capability spec: `openspec/specs/brand-identity/spec.md` (promoted 2026-04-09)

## Upstream Backend Discovery (for fork work)
- `grep -rn "remoteTrpc\." src/renderer/` — Find every upstream tRPC call site
- `grep -rn "fetch(\`\${apiUrl}\|getApiBaseUrl" src/main/ src/renderer/` — Find raw HTTP calls to upstream
- See `.scratchpad/upstream-features-inventory.md` for the curated F1-F10 catalog
- **Brand-residue sweep:** `grep -rniE "21st|twentyfirst|1code\.dev" src/main/ src/renderer/ scripts/ package.json README.md | grep -vE 'src/main/lib/cli\.ts:6|README\.md'` — should return empty (Tier C allowlist excluded)

## Serena MCP (memory management)
- **`mcp__serena__activate_project` first** with `project: "ai-coding-cli"` — required before list_memories/read_memory
- `mcp__serena__list_memories` — list available memories
- `mcp__serena__read_memory` — read a specific memory
- `mcp__serena__write_memory` — write/update a memory

## Claude Code Skills (user-invocable)
- `/docs-drift-check` — Audit CLAUDE.md/README/CONTRIBUTING/AGENTS/memories against the codebase (11 drift points as of 2026-04-09, including the new "deleted-file references in docs" check)
- `/new-regression-guard` — Scaffold a new bun:test regression guard under `tests/regression/` (avoids ~80-line copy-paste)
- `/new-router` — Scaffold a new tRPC router with proper registration in `createAppRouter`
- `/phase-0-progress` — Verify Phase 0 hard gate status against filesystem evidence
- `/verify-pin` — Safely bump a load-bearing pinned version (Claude binary, Codex, Electron, Vite, Tailwind, shiki)
- `/release` — Run the full release pipeline checklist

## System Utils (macOS/Darwin)
- `git` — Version control
- `ls`, `find`, `grep` — File system exploration
- `defaults delete dev.apollosai.agents.dev` — Clear dev app preferences
- `rm -rf ~/Library/Application\ Support/Agents\ Dev/` — Clear dev app data
- `rm -rf ~/.1code/` — Clear worktrees + cloned repos (full reset; path renamed from `.21st/` on 2026-04-09)
- `xcrun notarytool` — macOS notarization management
- `xcrun stapler staple` — Staple notarization tickets to DMGs

## Cluster Access (for auth/backend strategy work)
- `cd /Users/jason/dev/ai-k8s/talos-ai-cluster && KUBECONFIG=./kubeconfig kubectl ...` — cluster repo dir must be the working directory (mise loads KUBECONFIG on cd)
- **Never use direct `kubectl apply` for cluster resources** — Flux reconciles from `templates/config/kubernetes/**/*.j2` via `cluster.yaml` + SOPS + makejinja. Direct applies get pruned within 60s.
- `kubectl get securitypolicy -A` / `kubectl describe sp <name> -n <ns>` — inspect Envoy Gateway SecurityPolicies
- `kubectl get sp <name> -n <ns> -o jsonpath='{.status.ancestors[0].conditions[?(@.type==\"Accepted\")].status}{\"\\n\"}'` — verify SecurityPolicy acceptance
- `flux get kustomizations -A` — check Flux reconciliation status
- **Cluster facts (discovered 2026-04-08):** Envoy Gateway `v1.7.1`, Entra tenant `f505346f-75cf-458b-baeb-10708d41967d`, echo server at `https://echo.aarons.com/` (`default/echo`), working OIDC reference at `kube-system/hubble-ui-oidc`

## Entra Token Operations (for auth testing)
- Mint client_credentials v2 token: `curl -s -X POST "https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token" -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode "client_id=<gid>" --data-urlencode "client_secret=<secret>" --data-urlencode "scope=api://<gid>/.default" --data-urlencode 'grant_type=client_credentials' | jq -r '.access_token'`
- Decode JWT payload on macOS (base64url-safe): `echo "$JWT" | cut -d. -f2 | tr '_-' '/+' | awk '{l=length($0); printf "%s%s\n", $0, substr("====", 1, (4-l%4)%4)}' | base64 -d | jq`
- Verify v2 token format: `aud` must be GUID (not `api://...`), `iss` must end `/v2.0`, `ver` must be `"2.0"`, `azp` must be populated
- If token is v1.0 instead of v2.0: edit Entra app manifest → set `"requestedAccessTokenVersion": 2` → wait 60s → re-mint token

## Code-Review Graph
- `mcp__plugin_code-review-graph_code-review-graph__list_graph_stats_tool` — check graph status (files parsed, nodes, edges, last updated)
- `mcp__plugin_code-review-graph_code-review-graph__build_or_update_graph_tool` — incremental update (default) or `full_rebuild=True` for full re-parse
- Graph auto-updates on commit via hooks; manual builds rarely needed
- As of 2026-04-09: 516 files, 3200 nodes, 21897 edges, languages: typescript, javascript, tsx
