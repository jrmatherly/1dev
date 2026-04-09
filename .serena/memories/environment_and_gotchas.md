# Environment Notes and Gotchas

## Native Module Rebuilds
- `postinstall` runs `electron-rebuild` for `better-sqlite3` and `node-pty`
- If native modules fail after node/electron upgrade, run `bun run postinstall` manually

## Dev vs Production
- Dev protocol: `apollosai-agents-dev://`, Production: `apollosai-agents://`
- Dev userData: `~/Library/Application Support/Agents Dev/`
- Separate paths prevent conflicts between dev and production installs

## User Data Filesystem Paths
- Worktrees: `~/.1code/worktrees/` (formerly `.21st/worktrees/`)
- Cloned repos: `~/.1code/repos/`
- Per-worktree config: `.1code/worktree.json`
- Do NOT create anything under `~/.21st/`

## Binary Dependencies (PINNED)
- **Claude CLI: 2.1.96**, **Codex CLI: 0.118.0** — see package.json download scripts
- Dev builds require both: `bun run claude:download && bun run codex:download`

## Quality Gates — ALL REQUIRED (none is a superset)
- `bun run ts:check` — tsgo (baseline: 88 errors in `.claude/.tscheck-baseline`)
- `bun run build` — electron-vite build
- `bun test` — 8 regression guards, 25 tests, ~2s total
- `bun audit` — ~57 pre-existing transitive dev-dep advisories
- CI also runs `docs-build` (xyd build against `docs/`) as a 6th parallel job
- All together under 2 minutes on M-series Mac

## Dependency Version Constraints (LOAD-BEARING)
- **Vite 6.x** — electron-vite 3.x depends on `splitVendorChunk`
- **Tailwind 3.x** — tailwind-merge v3 requires TW v4; 134 files use `cn()`
- **shiki 3.x** — `@pierre/diffs` pins `shiki: ^3.0.0`
- **`@xyd-js/cli` pinned to `0.0.0-build-1202121-20260121231224`** — xyd-js publishes lockstep pre-releases across 28 packages. Bump via `verify-pin` skill. `docs/bun.lock` is tracked.
- **Electron 39 EOL: 2026-05-05**
- **`@azure/msal-node` 3.8.x** ≠ `@azure/msal-node-extensions` 5.1.x

## No .scratchpad/ References from Tracked Files
- `.scratchpad/` is gitignored — **never cite specific files from tracked files**
- Enforced by `tests/regression/no-scratchpad-references.test.ts`
- Canonical docs live in `docs/` — always reference `docs/` pages instead
- See `docs/conventions/no-scratchpad-references.md` for the rule and allowlist
- Promoted `.scratchpad/` originals have DEPRECATED banners pointing at `docs/` pages

## Upstream Backend Boundary
- `remoteTrpc.*` (`src/renderer/lib/remote-trpc.ts`) is the typed tRPC client for the legacy upstream
- Default base URL: `https://apollosai.dev`
- See `docs/enterprise/upstream-features.md` for the full F1-F10 catalog
- See `docs/architecture/upstream-boundary.md` for the rules

## Entra / Auth Gotchas
- `requestedAccessTokenVersion` defaults to null = v1, NOT v2 in Entra app registrations
- `oid`, `tid`, `azp` are default v2.0 claims — NOT in the "Add optional claim" dialog
- `preferred_username` MUST NOT be used for authorization
- Envoy Gateway v1.7.1 enables PKCE by default (S256)
- `jwt.optional: true` is load-bearing for the dual-auth pattern

## Cluster Facts
- Talos AI cluster at `/Users/jason/dev/ai-k8s/talos-ai-cluster/` — **Flux/GitOps managed**, never direct `kubectl apply`
- Envoy Gateway v1.7.1, Entra tenant `f505346f-75cf-458b-baeb-10708d41967d`
- Echo test server: `https://echo.aarons.com/`, OIDC reference: `kube-system/hubble-ui-oidc`
- kubectl: `cd /Users/jason/dev/ai-k8s/talos-ai-cluster && KUBECONFIG=./kubeconfig kubectl ...`

## Tool-Specific Gotchas
- **`claude-mem` Read deflection:** First Read() returns only line 1 + timeline. Fall back to `sed -n 'M,Np' <file>` via Bash.
- **Serena MCP requires activation** — `mcp__serena__activate_project` with `project: "ai-coding-cli"` before `list_memories`/`read_memory`
- **macOS base64url JWT decoding** — BSD `base64 -d` silently truncates. Use the `tr`/`awk`/`base64` pipeline in CLAUDE.md.
- **`bun audit` exit code** — pre-existing advisories mean non-zero is normal; focus on NEW advisories
