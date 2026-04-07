# 1Code Project Index

> Auto-generated project knowledge base for AI-assisted development.
> Last indexed: 2026-04-07 | Version: 0.0.72

---

## Quick Reference

| Item | Location |
|------|----------|
| App entry | `src/main/index.ts` |
| React root | `src/renderer/App.tsx` |
| IPC bridge | `src/preload/index.ts` |
| DB schema | `src/main/lib/db/schema/index.ts` |
| Build config | `electron.vite.config.ts` |
| tRPC router registry | `src/main/lib/trpc/routers/index.ts` |
| Git operations | `src/main/lib/git/index.ts` |

---

## 1. Main Process (`src/main/`)

### Core Files
| File | Purpose |
|------|---------|
| `index.ts` | App entry — window lifecycle, protocol handlers, auto-update |
| `auth-manager.ts` | OAuth flow, token refresh, credential management |
| `auth-store.ts` | Encrypted credential storage via Electron safeStorage |
| `constants.ts` | App-wide constants |
| `windows/main.ts` | BrowserWindow creation, IPC handler registration |

### Database Layer (`src/main/lib/db/`)
| File | Purpose |
|------|---------|
| `index.ts` | DB initialization, auto-migrate on startup |
| `schema/index.ts` | Drizzle table definitions (source of truth) |
| `utils.ts` | ID generation (nanoid) |

**Tables:** projects, chats, sub_chats, claude_code_credentials, anthropic_accounts, anthropic_settings

**Migrations:** 8 migrations in `drizzle/` (0000 through 0007)

### tRPC Routers (`src/main/lib/trpc/routers/`)

21 routers registered in `index.ts` via `createAppRouter()`:

| Router | Key | Purpose |
|--------|-----|---------|
| `projects.ts` | projects | Project CRUD, local folder management |
| `chats.ts` | chats | Chat CRUD, archive, worktree linking |
| `claude.ts` | claude | Claude SDK streaming, message subscriptions |
| `claude-code.ts` | claudeCode | Claude Code binary management, credentials |
| `claude-settings.ts` | claudeSettings | Claude configuration, model preferences |
| `anthropic-accounts.ts` | anthropicAccounts | Multi-account Anthropic auth, safeStorage |
| `ollama.ts` | ollama | Ollama local model support, offline mode |
| `codex.ts` | codex | OpenAI Codex via ACP provider |
| `terminal.ts` | terminal | PTY sessions, terminal I/O |
| `files.ts` | files | File read/write, directory listing |
| `plugins.ts` | plugins | Plugin discovery, loading, management |
| `skills.ts` | skills | Skills system for AI assistants |
| `agents.ts` | agents | Agent management and configuration |
| `voice.ts` | voice | Voice-to-text via OpenAI Whisper |
| `commands.ts` | commands | Slash command registry and execution |
| `external.ts` | external | Clipboard, shell, OS utilities |
| `debug.ts` | debug | Debug data export, DB inspection |
| `worktree-config.ts` | worktreeConfig | Git worktree configuration |
| `sandbox-import.ts` | sandboxImport | CodeSandbox project import |
| `agent-utils.ts` | (utility) | Shared agent helper functions |
| `git/index.ts` | changes | Git operations (named "changes" in router) |

### Git Operations (`src/main/lib/git/`)

Full git integration via `simple-git`:

| File | Purpose |
|------|---------|
| `index.ts` | tRPC router factory for git operations |
| `git-factory.ts` | SimpleGit instance creation per project |
| `git-operations.ts` | Core git commands (commit, push, pull, fetch) |
| `branches.ts` | Branch CRUD, checkout, merge |
| `staging.ts` | Stage/unstage files |
| `stash.ts` | Stash management |
| `status.ts` | Working tree status |
| `diff-parser.ts` | Parse git diffs for UI rendering |
| `file-contents.ts` | Read file contents at specific refs |
| `worktree.ts` | Git worktree management |
| `worktree-naming.ts` | Worktree naming conventions |
| `worktree-config.ts` | Worktree configuration |
| `shell-env.ts` | Shell environment for git commands |
| `offline-utils.ts` | Offline mode detection and handling |
| `sandbox-import.ts` | Import from CodeSandbox |
| `security/` | Git security utilities |
| `github/` | GitHub API integration |
| `watcher/` | File system watcher for git changes |
| `cache/` | Git data caching |
| `dictionaries/` | Git-related dictionaries/constants |

---

## 2. Renderer (`src/renderer/`)

### Features (by size)

| Feature | Files | Purpose |
|---------|-------|---------|
| `agents/` | 131 | Core chat interface — messages, input, tool rendering, slash commands |
| `changes/` | 48 | Git change tracking — diff views, staging, commits |
| `terminal/` | 17 | Integrated terminal — xterm.js + node-pty |
| `mentions/` | 16 | @-mention system for referencing files, symbols |
| `details-sidebar/` | 15 | Detail panel for selected items |
| `automations/` | 14 | Automation rules and triggers |
| `file-viewer/` | 9 | File browser and viewer |
| `kanban/` | 6 | Kanban board for task management |
| `onboarding/` | 6 | First-run experience and setup |
| `sidebar/` | 5 | Chat list, navigation, project switching |
| `settings/` | 2 | App settings UI |
| `layout/` | 1 | Main layout with resizable panels |
| `hooks/` | 1 | Automation hook definitions |

### Agents Feature Deep Dive (`src/renderer/features/agents/`)

The largest feature (131 files), organized into:

| Directory | Purpose |
|-----------|---------|
| `main/` | Core chat components: `active-chat.tsx`, `messages-list.tsx`, `chat-input-area.tsx`, `new-chat-form.tsx` |
| `ui/` | Tool result renderers, preview panels, diff views |
| `commands/` | Slash command UI and execution |
| `atoms/` | Jotai atoms for agent UI state |
| `stores/` | Zustand stores for persisted agent state |
| `hooks/` | Chat-specific React hooks |
| `context/` | React context providers for chat state |
| `components/` | Shared agent UI components |
| `search/` | Chat search functionality |
| `mentions/` | @-mention within chat messages |
| `lib/` | Agent-specific utilities |
| `utils/` | Helper functions |

### UI Components (`src/renderer/components/ui/`)

36 Radix-based UI primitives:

accordion, alert-dialog, badge, button, button-group, canvas-icons, checkbox, collapsible, command, context-menu, dialog, dropdown-menu, error-boundary, hover-card, icons, input, kbd, label, logo, network-status, popover, progress, project-icon, prompt-input, resizable-bottom-panel, resizable-sidebar, search-combobox, select, skeleton, split-button, switch, tabs, textarea, toggle-group, tooltip, virtual-list

### Global Lib (`src/renderer/lib/`)

| File/Dir | Purpose |
|----------|---------|
| `trpc.ts` | Local tRPC client (main process communication) |
| `remote-trpc.ts` | Remote tRPC client (cloud API) |
| `remote-api.ts` | Remote API helpers |
| `api-fetch.ts` | Fetch wrapper for API calls |
| `analytics.ts` | PostHog analytics integration |
| `jotai-store.ts` | Global Jotai store instance |
| `mock-api.ts` | DEPRECATED — legacy mock data |
| `window-storage.ts` | Window-scoped storage utilities |
| `utils.ts` | General utility functions |
| `vscode-themes.ts` | VS Code theme support |
| `overlay-styles.ts` | Overlay/modal styling |
| `editor-icons.ts` | File type icon mappings |
| `codesandbox-constants.ts` | CodeSandbox integration constants |
| `atoms/` | Global Jotai atoms (`agents-settings-dialog.ts`, `index.ts`) |
| `stores/` | Global Zustand stores (`changes-store.ts`) |
| `hooks/` | Global hooks (9 hooks: code-theme, file-change-listener, update-checker, voice-recording, etc.) |
| `themes/` | Theme configuration |
| `hotkeys/` | Keyboard shortcut definitions |
| `utils/` | Utility subdirectory |

---

## 3. Build & Release (`scripts/`)

| Script | Purpose |
|--------|---------|
| `download-claude-binary.mjs` | Download Claude CLI binary (platform-specific) |
| `download-codex-binary.mjs` | Download Codex binary (platform-specific) |
| `generate-update-manifest.mjs` | Generate `latest-mac.yml` / `latest-mac-x64.yml` manifests |
| `generate-icon.mjs` | Generate app icons from source |
| `patch-electron-dev.mjs` | Patch Electron for dev mode quirks |
| `sync-to-public.sh` | Sync private repo to public repo |

### Build Pipeline
```
bun run release =
  rm -rf release →
  bun i →
  claude:download →
  codex:download →
  build (electron-vite) →
  package:mac (electron-builder) →
  dist:manifest →
  upload-release-wrangler.sh
```

---

## 4. Configuration Files

| File | Purpose |
|------|---------|
| `electron.vite.config.ts` | Vite config for main/preload/renderer |
| `electron-builder.yml` | Electron Builder packaging config |
| `electron-shim.js` | Electron dev mode shim |
| `drizzle.config.ts` | Drizzle Kit config for migrations |
| `tsconfig.json` | TypeScript configuration |
| `tailwind.config.js` | Tailwind CSS configuration |
| `postcss.config.js` | PostCSS configuration |
| `.env.example` | Environment variable template |

---

## 5. OpenSpec System (`openspec/`)

Change proposal system for managing architectural decisions:

| File | Purpose |
|------|---------|
| `AGENTS.md` | Instructions for creating/applying change proposals |
| `project.md` | Project-level spec and guidelines |

---

## 6. Key Patterns & Conventions

### IPC Flow
```
Renderer → tRPC client (trpc.ts) → trpc-electron IPC → Main process router → Response
```

### State Layer Rules
- **Jotai**: Ephemeral UI state (selected items, open/close, previews)
- **Zustand**: Persisted client state (tab positions, pins → localStorage)
- **React Query (tRPC)**: Server state (DB data, AI responses → auto-cache)

### New Feature Checklist
1. Create tRPC router in `src/main/lib/trpc/routers/`
2. Register in `routers/index.ts` → `AppRouter` type auto-updates
3. Create feature directory in `src/renderer/features/`
4. Use Jotai atoms for UI state, tRPC queries for data
5. Use Radix UI + `cn()` + CVA for components
6. Run `bun run ts:check` to verify
