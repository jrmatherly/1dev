# Environment Notes and Gotchas

## Native Module Rebuilds
- `postinstall` runs `electron-rebuild` for `better-sqlite3` and `node-pty`
- If native modules fail after node/electron upgrade, run `bun run postinstall` manually

## Dev vs Production
- Dev protocol: `apollosai-agents-dev://`, Production: `apollosai-agents://`
- Dev userData: `~/Library/Application Support/Agents Dev/`
- Separate paths prevent conflicts between dev and production installs
- **Dev auth bypass:** `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env` skips login screen. Required because upstream `apollosai.dev` OAuth is dead and Envoy Gateway auth is not yet deployed. Creates synthetic `dev@localhost` user. Only works when `!app.isPackaged`. See `src/main/auth-manager.ts:isDevAuthBypassed()`.

## User Data Filesystem Paths
- Worktrees: `~/.1code/worktrees/` (formerly `.21st/worktrees/`)
- Cloned repos: `~/.1code/repos/`
- Per-worktree config: `.1code/worktree.json`
- Do NOT create anything under `~/.21st/`

## Binary Dependencies (PINNED)
- **Claude CLI: 2.1.96**, **Codex CLI: 0.118.0** — see package.json download scripts
- Dev builds require both: `bun run claude:download && bun run codex:download`

## Quality Gates — ALL REQUIRED (none is a superset)
- `bun run ts:check` — tsgo (baseline: 87 errors in `.claude/.tscheck-baseline`)
- `bun run build` — electron-vite build
- `bun test` — 11 regression guards, 45 tests, ~2.5s total
- `bun audit` — ~57 pre-existing transitive dev-dep advisories
- CI also runs `docs-build` (xyd build against `docs/`) as a 6th parallel job
- All together under 2 minutes on M-series Mac

## Dependency Version Constraints (LOAD-BEARING)
- **Vite 6.x** — electron-vite 3.x depends on `splitVendorChunk`
- **Tailwind 3.x** — tailwind-merge v3 requires TW v4; 134 files use `cn()`
- **shiki 3.x** — `@pierre/diffs` pins `shiki: ^3.0.0`
- **`@xyd-js/cli` pinned to `0.0.0-build-1202121-20260121231224`** — xyd-js publishes lockstep pre-releases across 28 packages. Bump via `verify-pin` skill. `docs/bun.lock` is tracked.
- **Electron 39 EOL: 2026-05-05**
- **`@azure/msal-node` v5.1.2 + `@azure/msal-node-extensions` v5.1.2** — installed in lockstep. `jose` v6.2.2. Powers `enterprise-auth.ts` / `enterprise-store.ts` (Phase 1, isolated). `msal-node-extensions` ships pre-built `.node` binaries — no electron-rebuild needed.

## No .scratchpad/ References from Tracked Files
- `.scratchpad/` is gitignored — **never cite specific files from tracked files**
- Enforced by `tests/regression/no-scratchpad-references.test.ts`
- Canonical docs live in `docs/` — always reference `docs/` pages instead
- See `docs/conventions/no-scratchpad-references.md` for the rule and allowlist
- Promoted `.scratchpad/` originals have DEPRECATED banners pointing at `docs/` pages

## Credential Storage
- **All encryption goes through `src/main/lib/credential-store.ts`** — no other file may call `safeStorage.encryptString/decryptString/isEncryptionAvailable`
- 3-tier policy: Tier 1 (OS keystore), Tier 2 (basic_text — warn), Tier 3 (refuse)
- `getSelectedStorageBackend()` is **Linux-only** — macOS/Windows always Tier 1 when available
- Enterprise override: `credentialStorageRequireEncryption: true` escalates Tier 2 to refusal
- Enforced by PreToolUse hook + `tests/regression/credential-storage-tier.test.ts`

## Upstream Backend Boundary
- `remoteTrpc.*` (`src/renderer/lib/remote-trpc.ts`) is the typed tRPC client for the legacy upstream
- Default base URL: `https://apollosai.dev`
- `archive-popover.tsx:351` (`updatedAt: chat.updated_at`) is an **F1 boundary** — reads from `remoteArchivedChats`, not local Drizzle
- See `docs/enterprise/upstream-features.md` for the full F1-F10 catalog
- See `docs/architecture/upstream-boundary.md` for the rules

## Zustand Sub-Chat Store
- `useAgentSubChatStore` does **NOT** use Zustand `persist()` middleware
- `allSubChats` is rebuilt from DB on every `setChatId()` — no localStorage migration needed when changing `SubChatMeta` type
- Per-chat tab/pin/split state uses raw `localStorage` via `saveToLS`/`loadFromLS` helpers

## Entra / Auth Gotchas
- `requestedAccessTokenVersion` defaults to null = v1, NOT v2 in Entra app registrations
- `oid`, `tid`, `azp` are default v2.0 claims — NOT in the "Add optional claim" dialog
- `preferred_username` MUST NOT be used for authorization
- Envoy Gateway v1.7.1 enables PKCE by default (S256)
- `jwt.optional: true` is load-bearing for the dual-auth pattern

## Claude CLI Token Injection (CRITICAL — verified 2026-04-09)
- **Claude CLI 2.1.96 does NOT support `ANTHROPIC_AUTH_TOKEN_FILE`** — binary search confirmed 0 occurrences. The auth-strategy §4.9 tmpfile design is unusable with this version.
- CLI supports: `ANTHROPIC_AUTH_TOKEN` (env var, Bearer header), `ANTHROPIC_API_KEY` (X-Api-Key), `CLAUDE_CODE_OAUTH_TOKEN` (OAuth), `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (FD-based, secure)
- **Current approach:** Use `ANTHROPIC_AUTH_TOKEN` env var with mitigations (add to `STRIPPED_ENV_KEYS`, short-lived Entra tokens)
- **Future upgrade path:** `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` (pass FD number, not file path) when CLI pin is bumped
- **Do NOT enable CP1 (`clientCapabilities: ["CP1"]`)** — LiteLLM is not CAE-enabled; CP1 causes 28-hour unrevocable tokens

## MSAL Integration Patterns (verified 2026-04-09)
- `buildClaudeEnv()` has **1 call site** (`claude.ts:1142`), not 5 — `claude-code.ts` calls `getClaudeShellEnvironment()` directly
- MSAL `PublicClientApplication` constructor is sync but cache plugin is async — use lazy `ensureReady()` pattern
- MSAL loopback redirect uses ephemeral port (no conflict with app's 21321/21322) — but implement `CustomLoopbackClient` for Windows firewall avoidance
- Use `acquireTokenSilent()` on-demand before each spawn — no custom setTimeout timer needed
- `AuthStore` must NOT be instantiated when `enterpriseAuthEnabled` is true (prevents orphaned `auth.dat`)

## Cluster Facts
- Talos AI cluster at `/Users/jason/dev/ai-k8s/talos-ai-cluster/` — **Flux/GitOps managed**, never direct `kubectl apply`
- Envoy Gateway v1.7.1, Entra tenant `f505346f-75cf-458b-baeb-10708d41967d`
- Echo test server: `https://echo.aarons.com/`, OIDC reference: `kube-system/hubble-ui-oidc`
- kubectl: `cd /Users/jason/dev/ai-k8s/talos-ai-cluster && KUBECONFIG=./kubeconfig kubectl ...`

## Tool-Specific Gotchas
- **`claude-mem` Read deflection:** First Read() returns only line 1 + timeline. Fall back to `cat -n` via Bash or `sed -n 'M,Np' <file>`.
- **Serena MCP requires activation** — `mcp__serena__activate_project` with `project: "ai-coding-cli"` before `list_memories`/`read_memory`
- **macOS base64url JWT decoding** — BSD `base64 -d` silently truncates. Use the `tr`/`awk`/`base64` pipeline in CLAUDE.md.
- **`bun audit` exit code** — pre-existing advisories mean non-zero is normal; focus on NEW advisories
- **code-review-graph `graph.db` transaction errors** — If `build_or_update_graph_tool` fails with "cannot start a transaction within a transaction", delete `graph.db` and rebuild: `rm .code-review-graph/graph.db && /build-graph`. Root cause: Python sqlite3 implicit transactions conflict with the plugin's explicit `BEGIN IMMEDIATE` — a bug in the plugin's connection setup (missing `isolation_level=None`).
