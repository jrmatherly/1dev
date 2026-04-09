## Tasks

### Task 1: Bump Electron version
- Update `package.json`: `"electron": "~41.2"`
- Update `@types/node` if needed for Node.js 24.14 alignment
- Run `bun install` (triggers postinstall → electron-rebuild)
- **Verify:** `electron-rebuild -f -w better-sqlite3,node-pty` completes without errors
- **Files:** `package.json`, `bun.lock`

### Task 2: Verify native module rebuilds
- Confirm better-sqlite3 builds against Electron 41 headers
- Confirm node-pty builds against Electron 41 headers
- **Functional test:** Open app → create terminal session → run shell commands → verify PTY works
- **Functional test:** Open app → verify database operations work (chat create, settings save)
- **Files:** No code changes expected

### Task 3: Run quality gates
- `bun run ts:check` — compare error count to baseline (~86)
- `bun run build` — verify esbuild packaging succeeds
- `bun test` — verify all regression guards pass
- `bun audit` — check for new advisories
- `cd docs && bun run build` — verify docs site build
- **Update** `.claude/.tscheck-baseline` if error count changed

### Task 4: Verify Electron-coupled dependencies
- Check `@sentry/electron` 7.x changelog for Electron 41 support — if a bump is needed, add to package.json
- Verify `electron-updater` 6.8.x supports Electron 41 — test update check flow
- Verify `trpc-electron` IPC bridge works with Electron 41
- **Files:** `package.json` (if version bumps needed)

### Task 5: Functional verification
- Verify clipboard operations (copy in chat, file viewer, terminal)
- Verify credential storage (store/retrieve across all 3 tiers)
- Verify auto-updater check flow (download + install)
- Verify window management (multi-window, minimize, maximize, close, `closed` handler cleanup)
- Verify IPC channels (all 49+ handlers)
- Verify Sentry error reporting initializes correctly

### Task 6: Update documentation and pins
- Update `docs/conventions/pinned-deps.md` — Electron pin to `~41.2`, EOL to 2026-08-25
- Update `docs/architecture/tech-stack.md` — Electron, Chromium, Node.js, V8 versions
- Update `openspec/config.yaml` context block — Electron version
- Add Electron 42 preparation items to `docs/operations/roadmap.md`
