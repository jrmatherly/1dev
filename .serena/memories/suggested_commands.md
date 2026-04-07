# Suggested Commands

## Development
- `bun run dev` — Start Electron with hot reload
- `bun run build` — Compile TypeScript via electron-vite
- `bun run preview` — Preview built app

## Packaging
- `bun run package` — Package for current platform (dir output)
- `bun run package:mac` — Build macOS (DMG + ZIP)
- `bun run package:win` — Build Windows (NSIS + portable)
- `bun run package:linux` — Build Linux (AppImage + DEB)

## Database (Drizzle + SQLite)
- `bun run db:generate` — Generate migrations from schema
- `bun run db:push` — Push schema directly (dev only)
- `bun run db:studio` — Open Drizzle Studio GUI

## Type Checking
- `bun run ts:check` — TypeScript check via tsgo (Go-based, fast)

## AI Binary Management
- `bun run claude:download` — Download Claude CLI binary for current platform
- `bun run codex:download` — Download Codex binary for current platform

## Release
- `bun run release` — Full release (download binaries, build, sign, upload)
- `bun run release:dev` — Dev release (no upload)
- `bun run dist:manifest` — Generate update manifests
- Submit notarization & upload to R2 CDN (see release pipeline docs)
- `./scripts/sync-to-public.sh` — Sync to public repo

## System Utils (macOS/Darwin)
- `git` — Version control
- `ls`, `find`, `grep` — File system exploration
- `defaults delete dev.21st.agents.dev` — Clear dev app preferences
- `rm -rf ~/Library/Application\ Support/Agents\ Dev/` — Clear dev app data
- `xcrun notarytool` — macOS notarization management
- `xcrun stapler staple` — Staple notarization tickets to DMGs
