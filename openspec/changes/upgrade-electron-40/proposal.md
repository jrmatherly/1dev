## Why

Electron 39.8.7 reaches end-of-life on **2026-05-05** (26 days from today). After EOL, no security patches will be issued for the Chromium 142, Node.js 22, or V8 14.2 versions bundled in Electron 39. This is a hard deadline — the app ships to enterprise users who require supported runtime versions.

The upgrade is not just a version bump — Electron 40 ships Node.js 24 (up from 22), which breaks native module ABIs and requires coordinated upgrades of the build toolchain (`electron-vite`, `electron-builder`) and verification of all native dependencies (`better-sqlite3`, `node-pty`).

## What Changes

**Core version bumps:**
- **Electron 39.8.7 → 40.8.0** — Node.js 22→24, Chromium 142→144, V8 14.2→14.4
- **electron-vite 3.1.0 → 5.0.0** — drops `splitVendorChunk` re-export (removed in Vite 7), adds `@swc/core` peer dep, supports Vite 5/6/7. `externalizeDepsPlugin` is deprecated in 5.0 and replaced by the `build.externalizeDeps` config option. This unblocks the "Vite must stay on 6.x" constraint documented in CLAUDE.md.
- **electron-builder 25.1.8 → 26.x** — explicit Electron 40 support, updated `@electron/rebuild` transitive. **Note:** 26.x has stability regressions reported by the community — plan is to test 26.x first but fall back to 25.x latest patch if packaging breaks.
- **Vite 6.4.2 → stays 6.x** initially (safest path; electron-vite 5.x supports both 6 and 7)

**Native module rebuilds:**
- **better-sqlite3 12.8.0** — rebuild only; v12 already has Node 24 prebuilt binaries. No version bump needed.
- **node-pty 1.1.0** — **RISK**: incomplete Node 24 support, missing prebuilt binaries. May compile from source on macOS/Linux but Windows is broken upstream. Needs testing; may require a version bump or alternative. **Pre-work required:** node-pty's eager import chain means the feature flag fallback (`terminalEnabled`) requires lazy import refactoring of `src/main/lib/terminal/session.ts` first — without this, a missing/broken node-pty crashes the entire main process at startup.

**Build toolchain adjustments:**
- **electron.vite.config.ts** — migrate from electron-vite 3.x to 5.0 API surface (`externalizeDepsPlugin` deprecated, replaced by `build.externalizeDeps` config option; `@swc/core` required as peer dep)
- **postinstall script** — verify `electron-rebuild -f -w better-sqlite3,node-pty` works against Electron 40's Node 24 ABI
- **scripts/patch-electron-dev.mjs** — verify macOS Info.plist patching works with Electron 40 bundle structure

**Electron 40 breaking changes:**
- **Clipboard API deprecated in renderer** — the Electron `clipboard` module deprecation in renderer is a non-issue (we don't import it in renderer; clipboard access is proxied through IPC handlers in `src/main/windows/main.ts:317-319`). However, 39 renderer files use `navigator.clipboard` (the Web Clipboard API), which needs Chromium 144 verification to confirm no behavioral changes.
- **macOS debug symbols format** — changed from zip to tar.xz. Update any symbol processing in release scripts if applicable.

**Compatibility verification:**
- **@sentry/electron 7.11.0** — verify Electron 40 compatibility
- **electron-updater 6.8.3** — verify auto-update flow works with new version
- **trpc-electron 0.1.2** — verify IPC bridge still works with `sandbox: false` webPreference
- **@electron-toolkit/{preload,utils}** — already supports Electron 13+, should be fine

**No changes expected:**
- No tRPC router changes, no database schema changes, no Drizzle migration changes
- No Electron API surface changes (all 40+ IPC channels, safeStorage, protocol handlers are stable)
- Claude/Codex CLI binaries are independent of Electron version
- No upstream feature catalog (F1-F10) changes — this is infrastructure only
- This change does not advance any Phase 0 hard gate (all 15 are already complete)

## Capabilities

### New Capabilities
None — this is an infrastructure upgrade, not a feature change.

### Modified Capabilities
None — no spec-level behavior changes. The upgrade preserves all existing functionality.

## Impact

**Affected code:**
- `package.json` — version bumps for electron, electron-vite, electron-builder, @swc/core (new peer dep), `@types/node` (^20 → ^24)
- `electron.vite.config.ts` — API migration for electron-vite 5.0 (`externalizeDepsPlugin` → `build.externalizeDeps`)
- `scripts/patch-electron-dev.mjs` — verify/update macOS bundle patching
- Postinstall hook in `package.json` — verify electron-rebuild against Node 24

**Affected build/release pipeline:**
- All platform builds (macOS arm64/x64, Windows x64, Linux x64/AppImage/DEB)
- Notarization workflow (verify with Electron 40 bundle)
- Auto-update manifests (`latest-mac.yml`, `latest-mac-x64.yml`)
- Debug symbol processing (tar.xz vs zip on macOS)

**Dependencies (19 npm packages coupled to Electron):**
- Direct: electron, electron-builder, electron-log, electron-updater, electron-vite
- Toolkit: @electron-toolkit/preload, @electron-toolkit/utils
- Transitive: @electron/{rebuild, notarize, osx-sign, universal, asar, get}
- Bridge: trpc-electron
- Monitoring: @sentry/electron

**Risk surface:**
- **Highest risk:** node-pty + Node 24 compatibility (may require workaround or alternative)
- **Medium risk:** electron-vite 3→5 config migration (`externalizeDepsPlugin` → `build.externalizeDeps`)
- **Low risk:** better-sqlite3 rebuild, clipboard deprecation, debug symbols
- **No risk:** All Electron APIs used are stable and not deprecated in 40
