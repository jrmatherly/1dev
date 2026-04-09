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
- Cookie `'changed'` event has new granular causes — no cookie event listeners in codebase
- `WebContentsView.webContents` undefined in `destroyed` handler — no destroyed handlers exist

**safeStorage API: NO CHANGES.** All four methods used by `credential-store.ts` remain unchanged:
- `safeStorage.isEncryptionAvailable()`, `safeStorage.getSelectedStorageBackend()`
- `safeStorage.encryptString()`, `safeStorage.decryptString()`

**Build tooling compatibility:**
- electron-vite 5.0.0 — already compatible, no version change needed
- electron-builder 26.8.1 — already compatible, no version change needed
- @electron/rebuild 4.0.3 — handles native module rebuilds via postinstall

**Documentation updates:**
- `docs/conventions/pinned-deps.md` — update Electron pin from `~40.8.5` to `~41.2`
- `docs/architecture/tech-stack.md` — update Electron/Chromium/Node.js versions
- `CLAUDE.md` — no content changes needed (references `Electron 40` as architecture baseline)
- `.claude/PROJECT_INDEX.md` — update if version references exist

**Prepare-now items for Electron 42 (deferred to roadmap):**
- Dialog methods default to Downloads directory (pass explicit `defaultPath`)
- macOS notifications migration to `UNNotification` (apps must be code-signed — already done)
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
- **Low risk:** better-sqlite3 rebuild — well-tested, prebuilt binaries available
- **No risk:** All Electron APIs used are stable in v41

**No changes to:**
- tRPC routers, database schema, Drizzle migrations
- Claude/Codex CLI binaries
- Upstream feature catalog (F1-F10)
- No Phase 0 gate advancement (all 15 complete)
