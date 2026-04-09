## 1. Bump Electron version

- [ ] 1.1 Update `package.json`: `"electron": "~41.2"`
- [ ] 1.2 Update `@types/node` if needed for Node.js 24.14 alignment
- [ ] 1.3 Run `bun install` (triggers postinstall → electron-rebuild)
- [ ] 1.4 Verify `electron-rebuild -f -w better-sqlite3,node-pty` completes without errors

## 2. Verify native module rebuilds

- [ ] 2.1 Confirm better-sqlite3 builds against Electron 41 headers
- [ ] 2.2 Confirm node-pty builds against Electron 41 headers
- [ ] 2.3 Functional test: Open app → create terminal session → run shell commands → verify PTY works
- [ ] 2.4 Functional test: Open app → verify database operations work (chat create, settings save)

## 3. Run quality gates

- [ ] 3.1 Run `bun run ts:check` — compare error count to baseline (~86)
- [ ] 3.2 Run `bun run build` — verify esbuild packaging succeeds
- [ ] 3.3 Run `bun test` — verify all regression guards pass
- [ ] 3.4 Run `bun audit` — check for new advisories
- [ ] 3.5 Run `cd docs && bun run build` — verify docs site build
- [ ] 3.6 Update `.claude/.tscheck-baseline` if error count changed

## 4. Verify Electron-coupled dependencies

- [ ] 4.1 Check `@sentry/electron` 7.x changelog for Electron 41 support — bump if needed
- [ ] 4.2 Verify `electron-updater` 6.8.x supports Electron 41 — test update check flow
- [ ] 4.3 Verify `trpc-electron` IPC bridge works with Electron 41

## 5. Functional verification

- [ ] 5.1 Verify clipboard operations (copy in chat, file viewer, terminal)
- [ ] 5.2 Verify credential storage (store/retrieve across all 3 tiers)
- [ ] 5.3 Verify auto-updater check flow (download + install)
- [ ] 5.4 Verify window management (multi-window, minimize, maximize, close, `closed` handler cleanup)
- [ ] 5.5 Verify IPC channels (all 49+ handlers)
- [ ] 5.6 Verify Sentry error reporting initializes correctly

## 6. Update documentation and pins

- [ ] 6.1 Update `docs/conventions/pinned-deps.md` — Electron pin to `~41.2`, EOL to 2026-08-25
- [ ] 6.2 Update `docs/architecture/tech-stack.md` — Electron, Chromium, Node.js, V8 versions
- [ ] 6.3 Update `openspec/config.yaml` context block — Electron version
- [ ] 6.4 Add Electron 42 preparation items to `docs/operations/roadmap.md`
