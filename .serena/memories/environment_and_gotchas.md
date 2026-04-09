# Environment Notes and Gotchas

## Dev vs Production
- Dev protocol: `apollosai-agents-dev://`, Production: `apollosai-agents://`
- Dev userData: `~/Library/Application Support/Agents Dev/`
- **Dev auth bypass:** `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env` skips login screen. Creates synthetic `dev@localhost` user. Only works when `!app.isPackaged`.

## Quality Gates — ALL REQUIRED
- `bun run ts:check` — tsgo (baseline: 86 errors in `.claude/.tscheck-baseline`)
- `bun run build` — electron-vite 5 build
- `bun test` — 12 regression guards, 48 tests, ~2.5s
- `bun audit` — pre-existing advisories
- `cd docs && bun run build` — xyd docs site (cleans `.xyd/` artifacts before building)

## Dependency Version Constraints
- **Electron 40.8.5** — upgraded 2026-04-09 from 39.8.7. node-pty uses lazy import.
- **electron-vite 5.0.0** — `externalizeDepsPlugin` replaced by `build.externalizeDeps` config
- **Vite 6.x** — can upgrade to 7 now (electron-vite 5 supports both), pinned for stability
- **Tailwind 3.x**, **shiki 3.x** — separate constraints, not Electron-related
- **Claude CLI 2.1.96**, **Codex 0.118.0** — binary pins
- **@xyd-js/cli pinned** — `0.0.0-build-1202121-20260121231224`
- **@types/node ^24** — matches Electron 40's Node 24

## Docs Build (xyd)
- `docs/package.json` build script cleans `.xyd/host/node_modules` and `.xyd/build` before building (Node 24 rmSync workaround)
- React key warning (FwSubNav) and Orama sourcemap warnings are upstream xyd bugs — cosmetic only
- Build failure on "Could not find root route" usually means stale `.xyd/` — clean and retry

## Credential Storage
- All encryption through `src/main/lib/credential-store.ts`
- 3-tier policy: Tier 1 (OS keystore), Tier 2 (basic_text — warn), Tier 3 (refuse)
- Enforced by PreToolUse hook + `tests/regression/credential-storage-tier.test.ts`

## Zustand Sub-Chat Store
- `useAgentSubChatStore` does NOT use `persist()` — allSubChats rebuilt from DB on every `setChatId()`
- `archive-popover.tsx:351` is an F1 boundary (reads from `remoteArchivedChats`, not local Drizzle)

## Code-Review Graph
- If `build_or_update_graph_tool` fails with "cannot start a transaction within a transaction", delete `graph.db` and rebuild: `rm .code-review-graph/graph.db`
- Root cause: Python sqlite3 implicit transactions conflict with explicit `BEGIN IMMEDIATE`

## Tool-Specific Gotchas
- **`claude-mem` Read deflection:** First Read() returns only line 1. Use `cat -n` via Bash.
- **Serena MCP requires activation** — `activate_project` with `project: "ai-coding-cli"` first
- **`bun audit` exit code** — non-zero is normal due to pre-existing advisories
