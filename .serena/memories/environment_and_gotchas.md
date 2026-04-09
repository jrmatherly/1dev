# Environment Notes and Gotchas

## Native Module Rebuilds
- `postinstall` runs `electron-rebuild` for `better-sqlite3` and `node-pty`
- If native modules fail after node/electron upgrade, run `bun run postinstall` manually

## Dev vs Production
- Dev protocol: `apollosai-agents-dev://`
- Dev userData: `~/Library/Application Support/Agents Dev/`
- Production protocol: `apollosai-agents://`
- These are separate to prevent conflicts between dev and production installs
- **Packaged dev builds:** `package.json.build.protocols` now registers BOTH schemes (production + dev) as of the 2026-04-09 rebrand sweep. Previously only the production scheme was registered, meaning packaged dev builds couldn't bind the dev scheme via Info.plist/registry.

## User Data Filesystem Paths (rebranded 2026-04-09)
- **Worktrees** live under `~/.1code/worktrees/` (formerly `~/.21st/worktrees/` before the `rebrand-residual-sweep` change)
- **Cloned repos** live under `~/.1code/repos/` (formerly `~/.21st/repos/`)
- **Per-worktree config** file is `.1code/worktree.json` (name unchanged — the parent dir rename made the overall structure consistent)
- Do NOT create anything under `~/.21st/` — the `brand-sweep-complete` regression guard will fail
- If a user migrating from the pre-rename version has an existing `~/.21st/` directory, they will need to rename it manually (greenfield project assumption is that no such users exist)

## Binary Dependencies (PINNED)
- **Claude CLI binary: pinned 2.1.96** (see `claude:download` script in `package.json`). Bumping requires re-testing session resume and streaming. The download script also verifies the manifest GPG signature against a vendored Anthropic public key (fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`), available for 2.1.89+.
- **Codex CLI binary: pinned 0.118.0** (see `codex:download` script in `package.json`). Bumping requires re-testing the `@zed-industries/codex-acp` bridge. Supports dynamic short-lived bearer token refresh for custom model providers — enables Phase 1 Envoy Gateway integration without a custom shim.
- Dev builds require both binaries downloaded locally — run `bun run claude:download && bun run codex:download` before first `bun run dev`

## First Install Issues
- **OAuth deep link**: macOS Launch Services may not recognize protocol handlers on first app launch. User may need to click "Sign in" again.
- **Folder dialog**: Window focus timing issues on first launch. Ensure window focus before `dialog.showOpenDialog()`.

## Clearing Dev State
```bash
rm -rf ~/Library/Application\ Support/Agents\ Dev/    # Clear all app data
defaults delete dev.apollosai.agents.dev               # Clear preferences
rm -rf ~/.1code/                                        # Clear worktrees + cloned repos (RARE — only for full reset)
```

## Quality Gates — ALL FOUR are required (none is a superset)
- **`bun run ts:check`** (tsgo, Go-based, faster) — stricter, catches type errors esbuild masks. Requires `npm install -g @typescript/native-preview`.
- **`bun run build`** (electron-vite + esbuild) — validates the packaging pipeline; produces the actual artifact.
- **`bun test`** — `bun:test` regression guards under `tests/regression/` (14 tests across 6 files, ~200ms total as of 2026-04-09). Bootstrapped 2026-04-08 as Phase 0 gate #11. No Jest/Vitest/Playwright — broader test adoption is still pending. Current guards: `auth-get-token-deleted`, `brand-sweep-complete`, `credential-manager-deleted`, `feature-flags-shape`, `gpg-verification-present`, `token-leak-logs-removed`.
- **`bun audit`** — checks for known dependency vulnerabilities. ~57 pre-existing transitive dev-dep advisories as of 2026-04-09 (picomatch, tinyglobby, @electron/rebuild chain); focus on NEW advisories only.
- **Run all four before submitting a PR.** Together they take under 2 minutes on an M-series Mac.
- tsgo has known gaps with mapped-type recursion vs tsc — fall back to `tsc` for tricky type errors
- **Current ts:check baseline: 88 pre-existing errors** (stored in `.claude/.tscheck-baseline`). PostToolUse hook tracks drift on every TS edit. Only fail if count increases. To verify your changes don't add new errors: `git stash && bun run ts:check 2>&1 | grep -c "error TS" && git stash pop`

## CI/CD
- **`.github/workflows/ci.yml` exists** as of Phase 0 gate #9 (2026-04-08). Runs `bun run ts:check && bun run build && bun test && bun audit` on every PR to `main`.
- Local quality gates are the same four commands — run them before pushing.
- `.github/dependabot.yml` exists as of Phase 0 gate #10. UI secret-scanning enable still pending (manual GitHub setting).
- Release pipeline is still local: `bun run release` runs binaries → build → package:mac → notarize → upload to R2 CDN.
- **Note:** `scripts/sync-to-public.sh` and the `sync:public` npm alias were DELETED on 2026-04-09 as part of the rebrand sweep. The enterprise fork has no upstream mirror to sync to. Any documentation that still references them is stale.

## Dependency Version Constraints (LOAD-BEARING — DO NOT BUMP CASUALLY)
- **Vite must stay on 6.x** — `electron-vite` 3.x depends on `splitVendorChunk` removed in Vite 7+. `electron-vite` 5.x supports Vite 7 if/when upgraded.
- **Tailwind must stay on 3.x** — `tailwind-merge` v3 requires Tailwind v4; 134 files use `cn()`
- **shiki must stay on 3.x** — `@pierre/diffs` pins `shiki: ^3.0.0`; v4 blocked until upstream update
- **`@azure/msal-node` is at v3.8.x** — NOT v5.x (`@azure/msal-node-extensions` is the v5.x package; do not confuse the two)
- `bun update` is semver-safe; `bun update --latest` pulls major bumps (use cautiously)

## Electron Lifecycle
- **Electron 39 EOL is 2026-05-05** — major upgrade to Electron 41 needed before then
- Verify CVEs/release dates with `gh api repos/electron/electron/security-advisories` and `gh api repos/electron/electron/releases`

## Credential Storage Caveats
- `keytar` was archived by Atom on 2026-03-25 — use `keyring-node` if `safeStorage` is insufficient
- Linux `safeStorage` falls back to `basic_text` (plaintext) without `gnome-keyring`/`kwallet` installed

## Serena MCP Activation
- `mcp__serena__list_memories` and `mcp__serena__read_memory` will fail with `Error: No active project` if Serena hasn't been activated for the session
- **Always call `mcp__serena__activate_project` first** with `project: "ai-coding-cli"` (or the absolute path `/Users/jason/dev/ai-stack/ai-coding-cli`)
- Activation persists for the rest of the session

## Upstream Backend Boundary
- **`remoteTrpc.*`** (`src/renderer/lib/remote-trpc.ts`) is the typed tRPC client for the legacy upstream backend (formerly `21st.dev` / `1code.dev`, retiring in favor of `apollosai.dev` for the fork)
- Default base URL: `https://apollosai.dev` (overridable via `desktopApi.getApiBaseUrl()`)
- Any feature touching `remoteTrpc.foo.bar` will break when upstream is retired
- Refresh inventory: `grep -rn "remoteTrpc\." src/renderer/`
- See `.scratchpad/upstream-features-inventory.md` for the full F1-F10 catalog

## Brand Identity (codified 2026-04-09 in `openspec/specs/brand-identity/spec.md`)
- **Tier A (upstream brand — MUST NOT APPEAR in src/, scripts/, package.json):** `21st`, `twentyfirst`, `1code.dev`, `cdn.21st.dev`, `dev.21st.*`, `github.com/21st-dev/*`, `@21st-dev/*`, `21st-desktop`, `21st-notarize`
- **Tier B (product name — KEEP):** `"1Code"`, `1code-desktop` (package), `resources/cli/1code` (CLI launcher), `.1code/worktree.json`, `~/.1code/` filesystem directories
- **Tier C (attribution — PRESERVED as historical references):** `src/main/lib/cli.ts:6` (upstream PR attribution comment), `README.md` (attribution sentence + historical mentions + "looking for upstream OSS product?" pointer at line 134)
- Enforced by `tests/regression/brand-sweep-complete.test.ts`
- Any new identifier must be classified against the taxonomy BEFORE committing
- Full spec at `openspec/specs/brand-identity/spec.md` — 11 SHALL/MUST requirements with 16 testable scenarios

## Entra / Auth-Specific Gotchas (discovered 2026-04-08 smoke test)
- **`requestedAccessTokenVersion` defaults to `null` = v1**, NOT v2, in new Entra app registrations. Must be explicitly set to `2` in the portal's Manifest tab (integer, no quotes). Token format is resource-manifest-driven, not endpoint-driven. Without the fix, `/oauth2/v2.0/token` still issues v1 tokens with `aud = api://<client>` (not GUID) and `iss = sts.windows.net/<tenant>/` (no `/v2.0` suffix).
- **`oid`, `tid`, `azp` are NOT in the "Add optional claim" dialog** in Entra — they are default v2.0 access token claims, always present. Only `email`, `idtyp`, `upn`, `family_name`, etc. need to be added as optional claims. Their absence from the dialog is correct, not a missing feature.
- **`preferred_username` MUST NOT be used for authorization decisions** per Microsoft docs. It's tenant-admin-mutable, empty for service principals, synthetic for B2B guests. Use `oid` (+ `tid` for cross-tenant scoping) instead.
- **Envoy Gateway v1.7.1 enables PKCE by default** on OIDC flow (S256) without `pkceEnabled: true` being set in SecurityPolicy. Also emits HMAC-signed JSON state parameter wrapping `{url, csrf_token, flow_id}`.
- **`jwt.optional: true` is load-bearing** for the dual-auth pattern — if omitted, browser requests with no Bearer get "Jwt issuer is not configured" instead of OIDC redirect. Verify deployed policy with `kubectl get sp <name> -n <ns> -o jsonpath='{.spec.jwt.optional}'` → `true`.

## macOS base64url Decoding
- BSD `base64 -d` silently truncates JWT payloads (missing padding + URL-safe alphabet). Symptom: `jq: Unfinished JSON term at EOF at line 1, column <N>`.
- Working one-liner: `echo "$JWT" | cut -d. -f2 | tr '_-' '/+' | awk '{l=length($0); printf "%s%s\n", $0, substr("====", 1, (4-l%4)%4)}' | base64 -d | jq`
- Alternative: `python3 -c "import sys, base64, json; p=sys.stdin.read().strip(); p+='='*(4-len(p)%4); print(json.dumps(json.loads(base64.urlsafe_b64decode(p)), indent=2))"`
- Last resort: paste to https://jwt.ms (client-side only, throwaway test tokens only)

## Cluster Facts (discovered 2026-04-08 smoke test)
- Talos AI cluster at `/Users/jason/dev/ai-k8s/talos-ai-cluster/` — **Flux/GitOps managed**, never direct `kubectl apply`
- Envoy Gateway image: `mirror.gcr.io/envoyproxy/gateway:v1.7.1`
- Entra tenant ID: `f505346f-75cf-458b-baeb-10708d41967d`
- Echo test server: `https://echo.aarons.com/` (`default/echo` HTTPRoute, `mendhak/http-https-echo:39`, returns `.headers.authorization` lowercase)
- Existing working OIDC reference: `kube-system/hubble-ui-oidc` (single-auth OIDC only; dual-auth was new as of the smoke test)
- Existing parent Gateway: `envoy-external/network/https`
- kubectl access: `cd /Users/jason/dev/ai-k8s/talos-ai-cluster && KUBECONFIG=./kubeconfig kubectl ...`

## Tool-Specific Gotchas (important for agents working in this repo)
- **`claude-mem` Read-tool deflection:** The `claude-mem` plugin's `PreToolUse:Read` hook returns only line 1 + a semantic-priming timeline on the first Read of a file with prior observations. The hook message says "Edit works — the file is registered as read" — this is true, and Edit tools can proceed even without a successful full Read. If you genuinely need the content (not just registration), fall back to `sed -n 'M,Np' <file>` via Bash. The deflection also triggers if you pass an offset >= file length, even when the offset is within bounds for the file (confusing; verify file length separately).
- **Test agent subtypes are NOT skills:** `claude-md-improver` and `claude-automation-recommender` are skills (invoke via `Skill` tool), not `Agent` subagent types. A past session wasted tool calls trying to dispatch them as subagents — check skill lists first.
- **`bun audit` exit code:** Pre-existing transitive dev-dep advisories (~57 as of 2026-04-09) mean `bun audit` exits non-zero in CI too. Focus on whether the count INCREASED, not on absolute zero.
- **Explore subagent line numbers may drift:** When Explore subagents return file:line references, verify via Grep before editing — sometimes the line number is off by a few because the file has been modified since the subagent read it, or the pattern appears multiple times and the subagent only found one.
