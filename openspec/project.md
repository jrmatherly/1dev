# Project Context

## Purpose
**1Code** (by 21st.dev) - A local-first Electron desktop app for parallel AI-assisted development. Users create chat sessions linked to local project folders, interact with multiple AI backends (Claude, Codex, Ollama) in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, terminal, etc.).

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

## Project Conventions

### Code Style
- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)
- Simplicity over complexity - don't overcomplicate things

### Architecture Patterns
- **IPC Communication**: tRPC with `trpc-electron` for type-safe main↔renderer communication
- **State Management**:
  - Jotai: UI state (selected chat, sidebar open, preview settings)
  - Zustand: Sub-chat tabs and pinned state (persisted to localStorage)
  - React Query: Server state via tRPC (auto-caching, refetch)
- **Database**: Drizzle ORM with SQLite, auto-migration on app startup
- **AI Integration**: Dynamic import of `@anthropic-ai/claude-agent-sdk` with two modes: "plan" (read-only) and "agent" (full permissions). Also supports Codex CLI and Ollama for local models.

### Testing Strategy
No test suite is currently configured (no Jest, Vitest, or Playwright). `bun run ts:check` (tsgo) is the only automated quality gate.

### Git Workflow
- Main branch: `main`
- Feature branches for development
- PRs for code review

## Domain Context
- **Chat Sessions**: Users create chats linked to local project folders
- **Sub-chats**: Sessions within a chat that can have different modes (plan/agent)
- **Tool Execution**: Real-time display of AI tool execution (bash, file edits, web search)
- **Session Resume**: Sessions can be resumed via `sessionId` stored in SubChat
- **Terminal**: Integrated terminal (node-pty + xterm.js) accessible via sidebar or bottom panel

## Important Constraints
- Local-first: All data stored locally in SQLite (`{userData}/data/agents.db`)
- Auth via OAuth with encrypted credential storage (safeStorage)
- macOS notarization required for releases
- Dev vs Production use separate userData paths and protocols

## External Dependencies
- **Claude Agent SDK**: `@anthropic-ai/claude-agent-sdk` for AI interactions
- **Codex CLI**: OpenAI Codex binary for code generation
- **Ollama**: Local model support for offline-first AI
- **21st.dev CDN**: Auto-update manifests and releases at `https://cdn.21st.dev/releases/desktop`
- **OAuth Provider**: Authentication flow

## Detailed Reference
For detailed architecture, commands, debugging guides, and release process, see [CLAUDE.md](../CLAUDE.md).
