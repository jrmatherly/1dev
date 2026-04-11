## 1. Bump Electron version

- [x] 1.1 Update `package.json`: `"electron": "~41.2"`
- [x] 1.2 Update `@types/node` if needed for Node.js 24.14 alignment
- [x] 1.3 Run `bun install` (triggers postinstall → electron-rebuild)
- [x] 1.4 Verify `electron-rebuild -f -w better-sqlite3,node-pty` completes without errors

## 2. Verify native module rebuilds

- [x] 2.1 Confirm better-sqlite3 builds against Electron 41 headers
- [x] 2.2 Confirm node-pty builds against Electron 41 headers
- [x] 2.3 Functional test: Open app → create terminal session → run shell commands → verify PTY works
- [x] 2.4 Functional test: Open app → verify database operations work (chat create, settings save)

## 3. Run quality gates

- [x] 3.1 Run `bun run ts:check` — compare error count to baseline (~86)
- [x] 3.2 Run `bun run build` — verify esbuild packaging succeeds
- [x] 3.3 Run `bun test` — verify all regression guards pass
- [x] 3.4 Run `bun audit` — check for new advisories
- [x] 3.5 Run `cd docs && bun run build` — verify docs site build
- [x] 3.6 Update `.claude/.tscheck-baseline` if error count changed

## 4. Verify Electron-coupled dependencies

- [x] 4.1 Check `@sentry/electron` 7.x changelog for Electron 41 support — bump if needed
- [x] 4.2 Verify `electron-updater` 6.8.x supports Electron 41 — test update check flow
- [x] 4.3 Verify `trpc-electron` IPC bridge works with Electron 41

## 5. Functional verification

- [x] 5.1 Verify clipboard operations (copy in chat, file viewer, terminal)
- [x] 5.2 Verify credential storage (store/retrieve across all 3 tiers)
- [x] 5.3 Verify auto-updater check flow (download + install) — **DEFERRED to a separate roadmap item**. The Electron 41 runtime upgrade is fundamentally done (Node 24, Chromium 146, V8 14.6 all verified by tasks 5.1, 5.2, 5.4, 5.5, 5.6). A packaged-build auto-updater end-to-end smoke test requires (a) code-signing infrastructure (currently unsigned — Gatekeeper/SmartScreen block the install step on unsigned artifacts), (b) a persistent older-version install on a developer machine to upgrade FROM, and (c) a throwaway GitHub Release or staging feed to upgrade TO. None of these are Electron-version-specific; they're cross-cutting concerns that belong in their own OpenSpec change. Tracked in `docs/operations/roadmap.md` as `verify-auto-updater-packaged-flow` (2026-04-11).
- [x] 5.4 Verify window management (multi-window, minimize, maximize, close, `closed` handler cleanup)
- [x] 5.5 Verify IPC channels (all 49+ handlers)
- [x] 5.6 Verify Sentry error reporting initializes correctly

## 6. Update documentation and pins

- [x] 6.1 Update `docs/conventions/pinned-deps.md` — Electron pin to `~41.2`, EOL to 2026-08-25
- [x] 6.2 Update `docs/architecture/tech-stack.md` — Electron, Chromium, Node.js, V8 versions
- [x] 6.3 Update `openspec/config.yaml` context block — Electron version
- [x] 6.4 Add Electron 42 preparation items to `docs/operations/roadmap.md`
