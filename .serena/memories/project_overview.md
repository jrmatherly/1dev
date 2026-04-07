# 1Code (ai-coding-cli)

## Purpose
Local-first Electron desktop app for parallel AI-assisted development by 21st.dev. Users create chat sessions linked to local project folders, interact with multiple AI backends (Claude, Codex, Ollama) in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, terminal).

## Tech Stack
| Layer | Tech |
|-------|------|
| Desktop | Electron ~39, electron-vite 3, electron-builder |
| UI | React 19, TypeScript 5, Tailwind CSS 3 |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai (UI), Zustand (persisted), React Query (server via tRPC) |
| Backend | tRPC (trpc-electron), Drizzle ORM, better-sqlite3 |
| Terminal | node-pty, xterm.js |
| Editor | Monaco Editor |
| AI | @anthropic-ai/claude-code, Codex CLI, Ollama |
| Package Manager | bun |
| Analytics | PostHog, Sentry |

## Current Version
v0.0.72+

## Key Features
- Multi-backend AI (Claude, Codex, Ollama)
- Integrated terminal (node-pty + xterm)
- Plugin and skills system
- File viewer, kanban board, automations
- Voice features, @-mentions, search
- Auth with encrypted credential storage (Electron safeStorage)
- Auto-update via CDN manifests
