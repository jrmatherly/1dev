## Design

### Approach

Direct version bump from Electron 40.8.5 to 41.2.0. No API changes affect our codebase — this is a straightforward runtime upgrade.

### Architecture Impact

**No architectural changes.** The three-layer Electron architecture (main/preload/renderer) is unchanged. All IPC channels, safeStorage usage, BrowserWindow configuration, and auto-updater flow remain identical.

### Native Module Strategy

Native modules (`better-sqlite3`, `node-pty`) require rebuilding against Electron 41's Node.js ABI headers. The existing `postinstall` script handles this automatically:

```bash
electron-rebuild -f -w better-sqlite3,node-pty
```

**Rollback plan:** If node-pty fails to rebuild, the terminal feature is non-critical — the app starts and functions without it (lazy import in `src/main/lib/terminal/session.ts`). Better-sqlite3 is load-bearing (database) and must rebuild successfully.

### Electron-Specific Constraints

- No IPC protocol changes between v40 and v41
- No security default changes that affect our CSP or sandbox configuration
- Chromium 146 web platform changes are non-breaking additions
- `safeStorage` API is stable and unchanged — credential-store.ts requires no modifications

### Verification Strategy

1. Build verification: `bun run build` produces valid bundles
2. Native module verification: terminal session + database operations work
3. Credential verification: all 3 tiers of credential storage work
4. Update verification: auto-updater check flow completes
