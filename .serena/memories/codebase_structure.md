# Codebase Structure

## Top-Level
```
src/           — Application source code
drizzle/       — Database migration files
resources/     — Static assets (icons, migrations for packaged app)
scripts/       — Build, release, and utility scripts
build/         — Electron-builder config
openspec/      — OpenSpec change proposal system
```

## Main Process (`src/main/`)
```
index.ts              — App entry, window lifecycle
auth-manager.ts       — OAuth flow, token refresh
auth-store.ts         — Encrypted credential storage (safeStorage)
constants.ts          — App constants
windows/main.ts       — Window creation, IPC handlers
lib/
  db/
    index.ts          — DB init, auto-migrate on startup
    schema/index.ts   — Drizzle table definitions (source of truth)
    utils.ts          — ID generation (nanoid)
  trpc/
    index.ts          — tRPC router/procedure factory
    routers/index.ts  — App router (21 routers registered)
    routers/claude.ts — Claude SDK streaming
    routers/codex.ts  — Codex integration
    routers/ollama.ts — Ollama local models
    routers/terminal.ts — Terminal/PTY sessions
    routers/files.ts  — File operations
    routers/plugins.ts — Plugin system
    routers/skills.ts — Skills system
    routers/...       — + projects, chats, agents, voice, commands, etc.
```

## Renderer (`src/renderer/`)
```
App.tsx               — Root with providers
features/
  agents/             — Main chat interface (core feature)
    main/             — active-chat.tsx, messages, input
    ui/               — Tool renderers, preview, diff view
    commands/         — Slash commands
    atoms/            — Jotai atoms for agent state
    stores/           — Zustand stores
    hooks/            — Chat-specific hooks
    context/          — React context providers
    search/           — Chat search
    mentions/         — @-mention system
  sidebar/            — Chat list, navigation
  terminal/           — Integrated terminal (node-pty + xterm)
  kanban/             — Kanban board view
  file-viewer/        — File browser/viewer
  hooks/              — Automation hooks
  automations/        — Automation system
  settings/           — App settings UI
  onboarding/         — First-run experience
  changes/            — Change tracking (git)
  details-sidebar/    — Detail panel
  mentions/           — Global @-mention
  layout/             — Main layout with resizable panels
components/ui/        — Radix UI wrappers
lib/
  atoms/              — Global Jotai atoms
  stores/             — Global Zustand stores
  trpc.ts             — Local tRPC client
  remote-trpc.ts      — Remote tRPC client
  remote-api.ts       — Remote API helpers
  analytics.ts        — PostHog analytics
```

## Database
- **Location**: `{userData}/data/agents.db` (SQLite via better-sqlite3)
- **Schema**: `src/main/lib/db/schema/index.ts`
- **Tables**: projects, chats, sub_chats, claude_code_credentials, anthropic_accounts, anthropic_settings
- **Auto-migration**: `initDatabase()` runs on app start from `drizzle/` (dev) or `resources/migrations` (packaged)

## Key Entry Points
- `electron.vite.config.ts` — Build config (main/preload/renderer)
- `src/main/index.ts` — Main process entry
- `src/preload/index.ts` — IPC bridge (context isolation)
- `src/renderer/App.tsx` — React app root
