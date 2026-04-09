## 1. Pre-flight verification

- [ ] 1.1 Record the current baseline: `bun run ts:check` error count, `bun run build` success, `bun test` pass count, `bun audit` advisory count. Save to a local file for comparison.
- [ ] 1.2 Verify electron-vite 5.0.0 API compatibility: `npm view electron-vite@5.0.0` — confirm `externalizeDepsPlugin` is deprecated (replaced by `build.externalizeDeps` config option) and `defineConfig` is still exported. Read the 5.0.0 changelog or source if needed.
- [ ] 1.3 Verify node-pty latest version and Node 24 support: `npm view node-pty versions --json` — check if any version ≥1.1.0 explicitly supports Node 24. Check GitHub issues for Node 24 compatibility reports.
- [ ] 1.4 Verify @sentry/electron Electron 40 compatibility: `npm view @sentry/electron` — check peerDeps and changelog for Electron 40 support.
- [ ] 1.5 Verify electron-builder 26.x availability and Electron 40 support: `npm view electron-builder@latest` — check version and changelog.
- [ ] 1.6 Check if `scripts/patch-electron-dev.mjs` makes assumptions about Electron's macOS bundle structure (read the script, identify hardcoded paths like `Electron.app/Contents/Info.plist`).
- [ ] 1.7 Verify `navigator.clipboard` (Web Clipboard API) works under Chromium 144: grep for usage sites (`grep -rn "navigator.clipboard" src/renderer/` — 39 files), confirm no behavioral changes in Chromium 144 release notes. The Electron `clipboard` module deprecation in renderer is a non-issue (we don't import it).
- [ ] 1.8 Investigate trpc-electron sandbox compatibility: can `sandbox: true` work with trpc-electron now? Test `webPreferences: { sandbox: true }` in `src/main/windows/main.ts` — if it works, this closes a long-standing security gap.
- [ ] 1.9 Review Chromium 143/144 security-relevant changes: check for CSP, Permissions Policy, CORS, or mixed content enforcement changes that could affect the renderer. Focus on `fetch()`, WebSocket, and `postMessage` usage patterns.
- [ ] 1.10 **Pre-work (BEFORE Electron bump):** Refactor `src/main/lib/terminal/session.ts` to use dynamic `import()` for node-pty wrapped in try/catch, exposing a `ptyAvailable` flag. Make `chats.ts` terminalManager calls nil-safe (check `ptyAvailable` before invoking terminal methods). This prevents a failed node-pty native module load from crashing the entire main process at startup, enabling graceful degradation behind the `terminalEnabled` feature flag.

## 2. Install @swc/core peer dependency

- [ ] 2.1 Install @swc/core: `bun add -d @swc/core` — required peer dep for electron-vite 5.x
- [ ] 2.2 Verify @swc/core installs without errors (it has platform-specific native binaries)
- [ ] 2.3 Run `bun run build` to confirm no breakage from just adding the dep

## 3. Upgrade electron-vite 3.1.0 → 5.0.0

- [ ] 3.1 Upgrade: `bun add -d electron-vite@5.0.0`
- [ ] 3.2 Migrate `electron.vite.config.ts`: `externalizeDepsPlugin` is **deprecated** in 5.0 — remove the `externalizeDepsPlugin()` import and plugin call, replace with the `build.externalizeDeps` config option (e.g., `build: { externalizeDeps: true }` in main/preload configs). Verify `defineConfig` import is unchanged.
- [ ] 3.3 If the API changed, update `electron.vite.config.ts` to match the new API surface
- [ ] 3.4 Run `bun run build` to verify the build works with electron-vite 5.0.0
- [ ] 3.5 Run `bun run ts:check` to verify no new TS errors
- [ ] 3.6 If build fails, read the electron-vite 5.x migration guide and fix

## 4. Upgrade electron-builder 25.1.8 → 26.x

- [ ] 4.1 Upgrade: `bun add -d electron-builder@latest` (targets 26.x)
- [ ] 4.1b If electron-builder 26.x packaging fails (task 8.1), fall back to `bun add -d electron-builder@25` (latest 25.x patch). 26.x has reported stability regressions — 25.x latest may still work with Electron 40.
- [ ] 4.2 Check for breaking changes in the electron-builder 26.x changelog that affect our `package.json` build config
- [ ] 4.3 Run `bun run build` to verify
- [ ] 4.4 If build config needs updating, adjust `package.json` build section

## 5. Upgrade Electron 39.8.7 → 40.x

- [ ] 5.1 Upgrade: `bun add -d electron@~40.8.0` (target Electron 40.8.0)
- [ ] 5.2 Run `bun run postinstall` to rebuild native modules (better-sqlite3, node-pty) against Node 24
- [ ] 5.3 If node-pty rebuild fails: try `bun add node-pty@latest` for a newer version, then re-run postinstall
- [ ] 5.4 If node-pty still fails: document the failure, add a TODO, and consider gating terminal behind feature flag `terminalEnabled` (the core AI chat workflow doesn't require it)
- [ ] 5.5 Run `bun run build` — this is the critical gate. If it passes, the Electron 40 upgrade is viable.
- [ ] 5.6 Run `bun run ts:check` and compare error count to pre-flight baseline. Only investigate new errors.
- [ ] 5.7 Run `bun test` — all regression guards must pass
- [ ] 5.8 Upgrade `@types/node` to `^24`: `bun add -d @types/node@^24` — Node 24 type definitions align with the Electron 40-bundled Node version
- [ ] 5.9 Verify `bun.lock` reflects all changes: `bun install`, stage `bun.lock` for commit, then test `bun install --frozen-lockfile` to confirm reproducibility
- [ ] 5.10 Verify safeStorage backward compatibility: encrypt a test string using `safeStorage.encryptString()` under Electron 39, upgrade to Electron 40, verify `safeStorage.decryptString()` returns the original string. This confirms existing OAuth tokens in `anthropic_accounts` and `claude_code_credentials` survive the upgrade.

## 6. Update CLAUDE.md and documentation

- [ ] 6.1 Update CLAUDE.md "Tech Stack" table: Electron version
- [ ] 6.2 Update CLAUDE.md "Environment Notes": remove the "Electron 39 EOL: 2026-05-05" warning, add the new Electron 40 EOL date
- [ ] 6.3 Update CLAUDE.md "Environment Notes": if Vite constraint changed, update the "Vite must stay on 6.x" note to reflect electron-vite 5.x compatibility
- [ ] 6.4 Update CLAUDE.md "Environment Notes": update electron-vite version reference
- [ ] 6.5 Update `.claude/.tscheck-baseline` if the error count changed
- [ ] 6.6 Update `package.json` description or version if needed

## 7. Smoke test

- [ ] 7.1 Run `bun run dev` with `MAIN_VITE_DEV_BYPASS_AUTH=true` — verify the app launches and renders correctly
- [ ] 7.2 Create a chat, create sub-chats, switch tabs — verify core workflow
- [ ] 7.3 Open the integrated terminal — verify node-pty works (if it was rebuilt successfully)
- [ ] 7.4 Test file operations (file viewer, drag-and-drop)
- [ ] 7.5 Verify the auto-updater doesn't crash on startup (it checks for updates on launch). Also verify auto-updater lifecycle logs are present in console AND run `bun run dist:manifest` to verify well-formed YAML manifest generation.
- [ ] 7.6 Test deep link protocol handler: open `apollosai-agents-dev://test` from Terminal and verify the app receives the protocol event
- [ ] 7.7 Verify safeStorage credential persistence: launch the app, confirm previously stored credentials are still accessible (no re-auth required)
- [ ] 7.8 Verify Monaco editor rendering: open a file in the file viewer, confirm syntax highlighting and scrolling work
- [ ] 7.9 Test voice input: if microphone access is available, verify the voice feature initializes without errors
- [ ] 7.10 Test file drag-and-drop: drag a file from Finder into the chat input area, confirm it's accepted

## 8. Package and release verification

- [ ] 8.1 Run `bun run package:mac` — verify macOS packaging succeeds
- [ ] 8.2 If packaging succeeds, verify the DMG launches and the app works
- [ ] 8.3 Check notarization: `xcrun notarytool history --keychain-profile "apollosai-notarize"` (or `21st-notarize`)
- [ ] 8.4 Verify `scripts/patch-electron-dev.mjs` still works with Electron 40's bundle structure
- [ ] 8.5 Run `bun audit` and compare to pre-flight baseline — only flag new advisories

## 9. Quality gate verification

- [ ] 9.1 Run all 5 quality gates in sequence: `bun run ts:check`, `bun run build`, `bun test`, `bun audit`, `bunx @fission-ai/openspec@1.2.0 validate upgrade-electron-40 --strict --no-interactive`
- [ ] 9.2 Confirm ts:check error count is at or below the pre-upgrade baseline
- [ ] 9.3 Confirm all regression tests pass (11 files, 44 tests — includes the new `electron-version-pin` guard)
- [ ] 9.4 Confirm build output size is reasonable (no unexpected bloat from @swc/core or other new deps)
- [ ] 9.5 Add regression guard `tests/regression/electron-version-pin.test.ts` asserting Electron >=40 in `package.json` devDependencies. This prevents accidental downgrade in future dependency updates.

## 10. Follow-up tracking (out of scope for this change)

These are listed for continuity, NOT as in-scope tasks:

- **Vite 6→7 upgrade** — now unblocked by electron-vite 5.x; separate change
- **Electron 40→41 upgrade** — incremental from stable 40 base; separate change
- **Tailwind 3→4 upgrade** — unrelated to Electron; separate change
- **node-pty Node 24 prebuilt binaries** — monitor upstream for resolution
- **Electron Fuses enablement** — use `@electron/fuses` to disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` in packaged builds for hardening
- **`shell:open-external` URL scheme validation** — audit all `shell.openExternal()` call sites to ensure only `https://` and `mailto:` schemes are allowed (prevents `file://` and custom scheme injection)
- **Dependabot comment updates** — update `.github/dependabot.yml` if new dependencies (e.g., `@swc/core`) need explicit monitoring groups
- **CI verification** — after pushing the `feat/upgrade-electron-40` branch, verify all 6 CI jobs pass (ts:check, build, test, audit, docs-build, status)
