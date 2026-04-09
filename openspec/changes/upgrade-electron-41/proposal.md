## Why

Electron 40.8.5 reaches end-of-life on **2026-06-30** (~82 days from today). After EOL, no security patches will be issued for the Chromium 144, Node.js 24.11, or V8 14.4 versions bundled in Electron 40. Enterprise users require supported runtime versions.

Electron 41 ships Chromium 146, Node.js 24.14, and V8 14.6. The upgrade is a **clean path** — no breaking changes affect our codebase, and all build tooling (electron-vite 5.0.0, electron-builder 26.8.1) is already compatible.

This is the lowest-risk upgrade in the batch and should be done first to extend our support window to **2026-08-25**.

## What Changes

**Core version bump:**
- **Electron 40.8.5 → 41.2.0** — Chromium 144→146, Node.js 24.11→24.14, V8 14.4→14.6

**Native module rebuilds (no version bumps):**
- **better-sqlite3** — rebuild against Electron 41 headers via `electron-rebuild -f -w better-sqlite3,node-pty`
- **node-pty** — rebuild against Electron 41 headers. **MEDIUM RISK**: native module ABI change requires functional terminal testing

**Electron 41 breaking changes (none affect us):**
- PDFs now render within same WebContents (OOPIFs) — we don't interact with PDF WebContents
- Cookie `'changed'` event has new granular causes — codebase uses `cookies.set()`/`cookies.remove()` (4 sites in `index.ts` and `main.ts`) but does NOT listen on the `'changed'` event, so no impact
- `WebContentsView.webContents` undefined in `destroyed` handler — codebase does not use `WebContentsView` (uses BrowserWindow with `close`/`closed` handlers in `window-manager.ts:43` and `main.ts:803,836`, which are unaffected)

**safeStorage API: NO CHANGES.** All four methods used by `credential-store.ts` remain unchanged:
- `safeStorage.isEncryptionAvailable()`, `safeStorage.getSelectedStorageBackend()`
- `safeStorage.encryptString()`, `safeStorage.decryptString()`

**Dependency compatibility verification:**
- electron-vite 5.0.0 — already compatible, no version change needed
- electron-builder 26.8.1 — already compatible, no version change needed
- @electron/rebuild 4.0.3 — handles native module rebuilds via postinstall
- **@sentry/electron ^7.11.0** — used in 5 files (`index.ts`, `preload/index.ts`, `main.tsx`, `ipc-chat-transport.ts`, `claude.ts`). Hooks deeply into Electron internals (crash reporting, IPC, breadcrumbs). Must verify compatibility with Electron 41 before upgrading.
- **electron-updater ^6.8.3** — used in `auto-updater.ts` with 30+ references. Tightly coupled to Electron for code signing verification and download mechanics. Must verify v6.8.x supports Electron 41.

**Documentation updates:**
- `docs/conventions/pinned-deps.md` — update Electron pin from `~40.8.5` to `~41.2`
- `docs/architecture/tech-stack.md` — update Electron/Chromium/Node.js versions
- `CLAUDE.md` — no content changes needed (references `Electron 40` as architecture baseline)
- `.claude/PROJECT_INDEX.md` — update if version references exist

**Prepare-now items for Electron 42 (deferred to roadmap):**
- Dialog methods default to Downloads directory — 3 `showOpenDialog` call sites in `projects.ts` (lines 64, 379, 501) lack explicit `defaultPath`
- macOS notifications migration to `UNNotification` — codebase uses Notification API (`main.ts:131-162`) including `notification.on("click")` handler. App is already code-signed; verify `UNNotification` behavioral compatibility.
- Electron binary download moves from `postinstall` to on-demand (may affect CI)

## Capabilities

### New Capabilities
None — infrastructure upgrade only.

### Modified Capabilities
- **MODIFIED** `electron-runtime` — Electron version bump; no behavioral changes

## Impact

**Affected code:**
- `package.json` — `electron: ~41.2`, `@types/node` version alignment
- Postinstall hook — verify electron-rebuild against Electron 41 ABI

**Affected build/release pipeline:**
- All platform builds (macOS arm64/x64, Windows, Linux)
- Notarization workflow
- Auto-update manifests

**Risk surface:**
- **Medium risk:** node-pty rebuild — must functionally test terminal
- **Medium risk:** @sentry/electron compatibility — deeply coupled to Electron internals
- **Medium risk:** electron-updater compatibility — auto-update flow must be verified
- **Low risk:** better-sqlite3 rebuild — well-tested, prebuilt binaries available
- **No risk:** All Electron APIs used are stable in v41

**No changes to:**
- tRPC routers, database schema, Drizzle migrations
- Claude/Codex CLI binaries
- Upstream feature catalog (F1-F10)
- No Phase 0 gate advancement (all 15 complete)
