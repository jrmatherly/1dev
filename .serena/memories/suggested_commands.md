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

## Type Checking & Quality (BOTH GATES — neither is "primary")
- `bun run ts:check` — TypeScript check via tsgo (stricter, requires `npm install -g @typescript/native-preview`)
- `bun run build` — Full electron-vite build (validates packaging)
- **Run both before submitting a PR.** Neither is a superset of the other.

## Dependency Audit
- `bun audit` — Check for known vulnerabilities
- `bun audit --high` — High-severity only (recommended CI gate)
- `bun outdated` — List outdated packages
- `bun update` — Semver-safe updates
- `bun update --latest` — Major version bumps (use cautiously)

## Upstream Verification (gh CLI)
- `gh api repos/electron/electron/security-advisories` — verify Electron CVEs
- `gh api repos/electron/electron/releases` — get Electron release dates (e.g. EOL planning)

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
- `./scripts/sync-to-public.sh` — Sync to public repo
- After release: notarize via electron-builder, then `xcrun stapler staple release/*.dmg`, then re-upload stapled DMGs and manifests

## Upstream Backend Discovery (for fork work)
- `grep -rn "remoteTrpc\." src/renderer/` — Find every upstream tRPC call site
- `grep -rn "fetch(\`\${apiUrl}\|getApiBaseUrl" src/main/ src/renderer/` — Find raw HTTP calls to upstream
- See `.scratchpad/upstream-features-inventory.md` for the curated F1-F10 catalog

## Serena MCP (memory management)
- **`mcp__serena__activate_project` first** with `project: "ai-coding-cli"` — required before list_memories/read_memory
- `mcp__serena__list_memories` — list available memories
- `mcp__serena__read_memory` — read a specific memory
- `mcp__serena__write_memory` — write/update a memory

## System Utils (macOS/Darwin)
- `git` — Version control
- `ls`, `find`, `grep` — File system exploration
- `defaults delete dev.21st.agents.dev` — Clear dev app preferences
- `rm -rf ~/Library/Application\ Support/Agents\ Dev/` — Clear dev app data
- `xcrun notarytool` — macOS notarization management
- `xcrun stapler staple` — Staple notarization tickets to DMGs

## Cluster Access (for auth/backend strategy work)
- `cd /Users/jason/dev/ai-k8s/talos-ai-cluster && KUBECONFIG=./kubeconfig kubectl ...` — cluster repo dir must be the working directory (mise loads KUBECONFIG on cd)
- **Never use direct `kubectl apply` for cluster resources** — Flux reconciles from `templates/config/kubernetes/**/*.j2` via `cluster.yaml` + SOPS + makejinja. Direct applies get pruned within 60s.
- `kubectl get securitypolicy -A` / `kubectl describe sp <name> -n <ns>` — inspect Envoy Gateway SecurityPolicies
- `kubectl get sp <name> -n <ns> -o jsonpath='{.status.ancestors[0].conditions[?(@.type=="Accepted")].status}{"\n"}'` — verify SecurityPolicy acceptance
- `flux get kustomizations -A` — check Flux reconciliation status
- **Cluster facts (discovered 2026-04-08):** Envoy Gateway `v1.7.1`, Entra tenant `f505346f-75cf-458b-baeb-10708d41967d`, echo server at `https://echo.aarons.com/` (`default/echo`), working OIDC reference at `kube-system/hubble-ui-oidc`

## Entra Token Operations (for auth testing)
- Mint client_credentials v2 token: `curl -s -X POST "https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token" -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode "client_id=<gid>" --data-urlencode "client_secret=<secret>" --data-urlencode "scope=api://<gid>/.default" --data-urlencode 'grant_type=client_credentials' | jq -r '.access_token'`
- Decode JWT payload on macOS (base64url-safe): `echo "$JWT" | cut -d. -f2 | tr '_-' '/+' | awk '{l=length($0); printf "%s%s\n", $0, substr("====", 1, (4-l%4)%4)}' | base64 -d | jq`
- Verify v2 token format: `aud` must be GUID (not `api://...`), `iss` must end `/v2.0`, `ver` must be `"2.0"`, `azp` must be populated
- If token is v1.0 instead of v2.0: edit Entra app manifest → set `"requestedAccessTokenVersion": 2` → wait 60s → re-mint token
