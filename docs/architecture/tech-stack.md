---
title: Tech Stack
icon: layers
---

# Tech Stack {subtitle="Layer-by-layer technology choices for 1Code"}

| Layer | Technology | Version / Pin | Notes |
|-------|-----------|---------------|-------|
| **Desktop** | Electron | `~40.8` | Node 24, Chromium 144. Upgraded from 39 on 2026-04-09. |
| **Build** | electron-vite | `5.0.0` | `build.externalizeDeps` replaces the old `externalizeDepsPlugin`. |
| **Packaging** | electron-builder | `26.x` | macOS (DMG + ZIP), Windows (NSIS + portable), Linux (AppImage + DEB). |
| **UI** | React | `19.x` | TypeScript 5 strict mode. |
| **Styling** | Tailwind CSS | `3.x` | Pinned — `tailwind-merge` v3 requires TW v4; 134 files use `cn()`. See [Pinned Dependencies](../conventions/pinned-deps.md). |
| **Components** | Radix UI | — | Headless primitives. Lucide icons, Motion (animations), Sonner (toasts). |
| **State (UI)** | Jotai | — | Atoms for UI state (selected chat, sidebar open, preview settings). |
| **State (persisted)** | Zustand | — | Sub-chat tabs and pinned state. `useAgentSubChatStore` does NOT use `persist()` middleware — rebuilt from DB on `setChatId()`. |
| **State (server)** | React Query via tRPC | — | Auto-caching, refetch, optimistic updates. |
| **IPC** | tRPC + trpc-electron | — | 21 routers in `createAppRouter`. See [tRPC Routers](./trpc-routers.md). |
| **Database** | Drizzle ORM + better-sqlite3 | — | 7 tables, auto-migration on startup. See [Database](./database.md). |
| **Terminal** | node-pty + xterm.js | — | Lazy-loaded in `session.ts` to prevent crash if native module fails. |
| **Editor** | Monaco Editor | — | Code viewer and diff display. |
| **AI (Claude)** | `@anthropic-ai/claude-agent-sdk` | — | Plan/agent modes, session resume via `sessionId`, streaming via tRPC subscription. |
| **AI (Codex)** | Codex CLI binary | pinned `0.118.0` | Managed via `codex.ts` router. Supports dynamic short-lived bearer token refresh. |
| **AI (Ollama)** | Ollama | — | Local model support via `ollama.ts` router. |
| **Claude CLI** | Claude Code binary | pinned `2.1.96` | SHA-256 + GPG signature verification on download. See [Pinned Dependencies](../conventions/pinned-deps.md). |
| **Syntax highlighting** | Shiki | `3.x` | Pinned — `@pierre/diffs` requires `^3.0.0`. |
| **Package manager** | Bun | — | `bun.lock` tracked for reproducible builds. |
| **Testing** | bun:test | — | 12 regression guards, 48 tests. See [Regression Guards](../conventions/regression-guards.md). |
| **Documentation** | xyd-js | pinned `0.0.0-build-...` | Lockstep pre-release builds. See [Pinned Dependencies](../conventions/pinned-deps.md). |
| **Analytics** | PostHog, Sentry | — | Disabled by default in OSS builds. Activated via `.env.local`. |

## File Naming Conventions

| Pattern | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `ActiveChat.tsx`, `AgentsSidebar.tsx` |
| Utilities / hooks | camelCase | `useFileUpload.ts`, `formatters.ts` |
| Stores | kebab-case | `sub-chat-store.ts`, `agent-chat-store.ts` |
| Atoms | camelCase + `Atom` suffix | `selectedAgentChatIdAtom` |

## Protocol Handlers

| Environment | Protocol |
|-------------|----------|
| Production | `apollosai-agents://` |
| Development | `apollosai-agents-dev://` |

Dev mode uses a separate `userData` path (`~/Library/Application Support/Agents Dev/`) to prevent conflicts with production installs.

## Related Pages

- [Codebase Layout](./codebase-layout.md) — full directory tree
- [Database](./database.md) — Drizzle schema and migration workflow
- [tRPC Routers](./trpc-routers.md) — router inventory
- [Pinned Dependencies](../conventions/pinned-deps.md) — why specific versions are frozen
- [Quality Gates](../conventions/quality-gates.md) — the 5 gates every PR must pass
