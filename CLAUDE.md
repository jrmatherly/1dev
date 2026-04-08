<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

**1Code** (by 21st.dev) - A local-first Electron desktop app for parallel AI-assisted development. Users create chat sessions linked to local project folders, interact with multiple AI backends (Claude, Codex, Ollama) in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, terminal, etc.).

## Commands

```bash
# Development
bun run dev              # Start Electron with hot reload

# Build
bun run build            # Compile app
bun run package          # Package for current platform (dir)
bun run package:mac      # Build macOS (DMG + ZIP)
bun run package:win      # Build Windows (NSIS + portable)
bun run package:linux    # Build Linux (AppImage + DEB)

# Database (Drizzle + SQLite)
bun run db:generate      # Generate migrations from schema
bun run db:push          # Push schema directly (dev only)
bun run db:studio        # Open Drizzle Studio GUI

# Type Checking
bun run ts:check         # TypeScript check via tsgo (requires: npm install -g @typescript/native-preview)

# AI Binary Management
bun run claude:download  # Download Claude CLI binary for current platform
bun run codex:download   # Download Codex binary for current platform

# Dependency Audit
bun audit                # Check for known vulnerabilities
bun outdated             # List outdated packages
```

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry, window lifecycle
│   ├── auth-manager.ts      # OAuth flow, token refresh
│   ├── auth-store.ts        # Encrypted credential storage (safeStorage)
│   ├── windows/main.ts      # Window creation, IPC handlers
│   └── lib/
│       ├── db/              # Drizzle + SQLite
│       │   ├── index.ts     # DB init, auto-migrate on startup
│       │   ├── schema/      # Drizzle table definitions
│       │   └── utils.ts     # ID generation
│       └── trpc/routers/    # tRPC routers (21+ routers)
│           ├── claude.ts        # Claude SDK streaming
│           ├── claude-code.ts   # Claude Code binary management
│           ├── codex.ts         # Codex integration
│           ├── ollama.ts        # Ollama local model support
│           ├── projects.ts      # Project CRUD
│           ├── chats.ts         # Chat CRUD
│           ├── agents.ts        # Agent management
│           ├── terminal.ts      # Terminal/PTY sessions
│           ├── files.ts         # File operations
│           ├── plugins.ts       # Plugin system
│           ├── skills.ts        # Skills system
│           ├── voice.ts         # Voice features
│           └── ...              # + commands, debug, external, etc.
│
├── preload/                 # IPC bridge (context isolation)
│   └── index.ts             # Exposes desktopApi + tRPC bridge
│
└── renderer/                # React 19 UI
    ├── App.tsx              # Root with providers
    ├── features/
    │   ├── agents/          # Main chat interface (core feature)
    │   │   ├── main/        # active-chat.tsx, messages, input
    │   │   ├── ui/          # Tool renderers, preview, diff view
    │   │   ├── commands/    # Slash commands
    │   │   ├── atoms/       # Jotai atoms for agent state
    │   │   ├── stores/      # Zustand stores
    │   │   ├── hooks/       # Chat-specific hooks
    │   │   ├── context/     # React context providers
    │   │   ├── search/      # Chat search
    │   │   └── mentions/    # @-mention system
    │   ├── sidebar/         # Chat list, navigation
    │   ├── terminal/        # Integrated terminal (node-pty)
    │   ├── kanban/          # Kanban board view
    │   ├── file-viewer/     # File browser/viewer
    │   ├── hooks/           # Automation hooks
    │   ├── automations/     # Automation system
    │   ├── settings/        # App settings UI
    │   ├── onboarding/      # First-run experience
    │   ├── changes/         # Change tracking
    │   ├── details-sidebar/ # Detail panel
    │   ├── mentions/        # Global @-mention
    │   └── layout/          # Main layout with resizable panels
    ├── components/ui/       # Radix UI wrappers (button, dialog, etc.)
    └── lib/
        ├── atoms/           # Global Jotai atoms
        ├── stores/          # Global Zustand stores
        ├── trpc.ts          # Local tRPC client (main process)
        ├── remote-trpc.ts   # Remote tRPC client
        ├── remote-api.ts    # Remote API helpers
        ├── analytics.ts     # Analytics tracking
        └── mock-api.ts      # DEPRECATED
```

## Database (Drizzle ORM)

**Location:** `{userData}/data/agents.db` (SQLite)

**Schema:** `src/main/lib/db/schema/index.ts`

```typescript
// Core tables:
projects    → id, name, path (local folder), timestamps
chats       → id, name, projectId, worktree fields, timestamps
sub_chats   → id, name, chatId, sessionId, mode (plan|agent), messages (JSON)
              // Individual AI sessions within a chat; sessionId enables resume

// Auth/settings tables:
claude_code_credentials → encrypted credential storage
anthropic_accounts      → linked Anthropic account info
anthropic_settings      → per-account settings
```

**Auto-migration:** On app start, `initDatabase()` runs migrations from `drizzle/` folder (dev) or `resources/migrations` (packaged).

**Queries:**
```typescript
import { getDatabase, projects, chats } from "../lib/db"
import { eq } from "drizzle-orm"

const db = getDatabase()
const allProjects = db.select().from(projects).all()
const projectChats = db.select().from(chats).where(eq(chats.projectId, id)).all()
```

## Key Patterns

### IPC Communication
- Uses **tRPC** with `trpc-electron` for type-safe main↔renderer communication
- All backend calls go through tRPC routers, not raw IPC
- Preload exposes `window.desktopApi` for native features (window controls, clipboard, notifications)

### State Management
- **Jotai**: UI state (selected chat, sidebar open, preview settings)
- **Zustand**: Sub-chat tabs and pinned state (persisted to localStorage)
- **React Query**: Server state via tRPC (auto-caching, refetch)

### AI Backend Integration
- **Claude**: Dynamic import of `@anthropic-ai/claude-agent-sdk`, plan/agent modes, session resume via `sessionId`, streaming via tRPC subscription (`claude.onMessage`)
- **Codex**: OpenAI Codex CLI binary, managed via `codex.ts` router
- **Ollama**: Local model support via `ollama.ts` router
- All backends: two modes — "plan" (read-only) and "agent" (full permissions)

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron ~39, electron-vite 3, electron-builder |
| UI | React 19, TypeScript 5, Tailwind CSS 3 |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai, Zustand, React Query |
| Backend | tRPC, Drizzle ORM, better-sqlite3 |
| AI | @anthropic-ai/claude-agent-sdk, Codex CLI, Ollama |
| Package Manager | bun |

## File Naming

- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)

## Important Files

- `electron.vite.config.ts` - Build config (main/preload/renderer entries)
- `src/main/lib/db/schema/index.ts` - Drizzle schema (source of truth)
- `src/main/lib/db/index.ts` - DB initialization + auto-migrate
- `src/renderer/features/agents/atoms/index.ts` - Agent UI state atoms
- `src/renderer/features/agents/main/active-chat.tsx` - Main chat component
- `src/main/lib/trpc/routers/claude.ts` - Claude SDK integration

## Debugging First Install Issues

When testing auth flows or behavior for new users, you need to simulate a fresh install:

```bash
# 1. Clear all app data (auth, database, settings)
rm -rf ~/Library/Application\ Support/Agents\ Dev/

# 2. Reset macOS protocol handler registration (if testing deep links)
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -kill -r -domain local -domain system -domain user

# 3. Clear app preferences
defaults delete dev.21st.agents.dev  # Dev mode
defaults delete dev.21st.agents      # Production

# 4. Run in dev mode with clean state
bun run dev
```

**Common First-Install Bugs:**
- **OAuth deep link not working**: macOS Launch Services may not immediately recognize protocol handlers on first app launch. User may need to click "Sign in" again after the first attempt.
- **Folder dialog not appearing**: Window focus timing issues on first launch. Fixed by ensuring window focus before showing `dialog.showOpenDialog()`.

**Dev vs Production App:**
- Dev mode uses `twentyfirst-agents-dev://` protocol
- Dev mode uses separate userData path (`~/Library/Application Support/Agents Dev/`)
- This prevents conflicts between dev and production installs

## Releasing a New Version

> All release documentation is in this file. There is no separate RELEASE.md.

### Prerequisites for Notarization

- Keychain profile: `21st-notarize`
- Create with: `xcrun notarytool store-credentials "21st-notarize" --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID`

### Release Commands

```bash
# Full release (downloads binaries, builds, signs, uploads)
bun run release

# Or step by step:
bun run claude:download    # Download Claude CLI binary
bun run codex:download     # Download Codex binary
bun run build              # Compile TypeScript
bun run package:mac        # Build & sign macOS app
bun run dist:manifest      # Generate latest-mac.yml manifests
# Submit notarization & upload to R2 CDN (see release pipeline docs)
```

### Bump Version Before Release

```bash
npm version patch --no-git-tag-version  # e.g. 0.0.72 → 0.0.73
```

### After Release Script Completes

1. Wait for notarization (2-5 min): `xcrun notarytool history --keychain-profile "21st-notarize"`
2. Staple DMGs: `cd release && xcrun stapler staple *.dmg`
3. Re-upload stapled DMGs to R2 and GitHub
4. Update changelog: `gh release edit v0.0.X --notes "..."`
5. **Upload manifests (triggers auto-updates!)**
6. Sync to public: `./scripts/sync-to-public.sh`

### Files Uploaded to CDN

| File | Purpose |
|------|---------|
| `latest-mac.yml` | Manifest for arm64 auto-updates |
| `latest-mac-x64.yml` | Manifest for Intel auto-updates |
| `1Code-{version}-arm64-mac.zip` | Auto-update payload (arm64) |
| `1Code-{version}-mac.zip` | Auto-update payload (Intel) |
| `1Code-{version}-arm64.dmg` | Manual download (arm64) |
| `1Code-{version}.dmg` | Manual download (Intel) |

### Auto-Update Flow

1. App checks `https://cdn.21st.dev/releases/desktop/latest-mac.yml` on startup and when window regains focus (with 1 min cooldown)
2. If version in manifest > current version, shows "Update Available" banner
3. User clicks Download → downloads ZIP in background
4. User clicks "Restart Now" → installs update and restarts

## Current Status

**Shipped (v0.0.72+):**
- Multi-backend AI: Claude, Codex, Ollama
- Drizzle ORM with 6 tables, auto-migration
- 21+ tRPC routers covering full feature set
- Integrated terminal (node-pty)
- Plugin and skills system
- File viewer, kanban board, automations
- Voice features, @-mentions, search
- Auth with encrypted credential storage
- Release pipeline with notarization and auto-update

## Environment Notes

- `postinstall` runs `electron-rebuild` for `better-sqlite3` and `node-pty` — if native modules fail, run `bun run postinstall` manually
- `tsgo` (Go-based TS checker) is used instead of `tsc` for `ts:check` — much faster but may have subtle differences (requires: `npm install -g @typescript/native-preview`)
- Dev builds require Claude and Codex binaries downloaded locally (`bun run claude:download && bun run codex:download`)
- **Vite must stay on 6.x** — `electron-vite` 3.x depends on `splitVendorChunk` which was removed in Vite 7+. Use `^6.4.2` minimum.
- **No test suite** — No Jest/Vitest/Playwright configured. `bun run build` is the only full validation beyond `ts:check`.
- **Tailwind must stay on 3.x** — `tailwind-merge` v3 requires Tailwind v4; upgrading requires full config migration (134 files use `cn()`)
- **shiki must stay on 3.x** — `@pierre/diffs` pins `shiki: ^3.0.0`; v4 blocked until upstream releases compatible version
- `bun update` is semver-safe; `bun update --latest` pulls major version bumps (use cautiously)
- `bun audit` — check for known vulnerabilities
- `bun outdated` — list outdated packages
- Claude Agent SDK version: see `@anthropic-ai/claude-agent-sdk` in `package.json`
- Protocol handlers: Production uses `twentyfirst-agents://`, dev uses `twentyfirst-agents-dev://`

## Documentation Maintenance

Multiple files contain overlapping project info — keep them in sync when making changes:
- `CLAUDE.md` — Authoritative reference for architecture, commands, patterns
- `openspec/project.md` — Brief context summary (references CLAUDE.md for details)
- `AGENTS.md` — Quick reference for AI agents + OpenSpec redirect
- `.serena/memories/` — Serena project memories (project_overview, codebase_structure, etc.)
- `.claude/PROJECT_INDEX.md` — Auto-generated project index

Common drift points: SDK package names, Electron version, release script names, feature lists.
