# Environment Notes and Gotchas

## Native Module Rebuilds
- `postinstall` runs `electron-rebuild` for `better-sqlite3` and `node-pty`
- If native modules fail after node/electron upgrade, run `bun run postinstall` manually

## Dev vs Production
- Dev protocol: `twentyfirst-agents-dev://`
- Dev userData: `~/Library/Application Support/Agents Dev/`
- Production protocol: `twentyfirst-agents://`
- These are separate to prevent conflicts between dev and production installs

## Binary Dependencies
- Dev builds require Claude and Codex binaries downloaded locally
- Run `bun run claude:download && bun run codex:download` before first `bun run dev`

## First Install Issues
- **OAuth deep link**: macOS Launch Services may not recognize protocol handlers on first app launch. User may need to click "Sign in" again.
- **Folder dialog**: Window focus timing issues on first launch. Ensure window focus before `dialog.showOpenDialog()`.

## Clearing Dev State
```bash
rm -rf ~/Library/Application\ Support/Agents\ Dev/    # Clear all app data
defaults delete dev.21st.agents.dev                     # Clear preferences
```

## No Test Suite
- No Jest, Vitest, or Playwright configured
- No test files exist in the codebase
- `bun run ts:check` (tsgo) is the only automated quality gate
