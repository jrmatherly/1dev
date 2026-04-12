---
title: Tech Stack
icon: layers
---

# Tech Stack {subtitle="Layer-by-layer technology choices for 1Code"}

| Layer | Technology | Version / Pin | Notes |
|-------|-----------|---------------|-------|
| **Desktop** | Electron | `~41.2` | Node.js 24.14, Chromium 146, V8 14.6. Upgraded from ~40.8 on 2026-04-09. EOL 2026-08-25. |
| **Build** | electron-vite | `5.0.0` | `build.externalizeDeps` replaces the old `externalizeDepsPlugin`. |
| **Packaging** | electron-builder | `26.x` | macOS (DMG + ZIP), Windows (NSIS + portable), Linux (AppImage + DEB). |
| **UI** | React | `19.x` | TypeScript 6 strict mode. |
| **Styling** | Tailwind CSS | `4.2.x` | CSS-first config (`@theme`, `@custom-variant dark`), Rust/Oxide engine, `@tailwindcss/vite` plugin. `tailwind-merge` v3, `tw-animate-css` v1.4 (replaces `tailwindcss-animate`). |
| **Components** | Radix UI | — | Headless primitives. Lucide icons, Motion (animations), Sonner (toasts). |
| **State (UI)** | Jotai | — | Atoms for UI state (selected chat, sidebar open, preview settings). |
| **State (persisted)** | Zustand | — | Sub-chat tabs and pinned state. `useAgentSubChatStore` does NOT use `persist()` middleware — rebuilt from DB on `setChatId()`. |
| **State (server)** | React Query via tRPC | — | Auto-caching, refetch, optimistic updates. |
| **IPC** | tRPC + trpc-electron | — | 22 routers in `createAppRouter`. See [tRPC Routers](./trpc-routers.md). |
| **Database** | Drizzle ORM + better-sqlite3 | — | 7 tables, auto-migration on startup. See [Database](./database.md). |
| **Terminal** | node-pty + xterm.js | — | Lazy-loaded in `session.ts` to prevent crash if native module fails. |
| **Editor** | Monaco Editor | — | Code viewer and diff display. |
| **AI (Claude)** | `@anthropic-ai/claude-agent-sdk` | — | Plan/agent modes, session resume via `sessionId`, streaming via tRPC subscription. |
| **AI (Codex)** | Codex CLI binary | pinned `0.118.0` | Managed via `codex.ts` router. Supports dynamic short-lived bearer token refresh. |
| **AI (Ollama)** | Ollama | — | Local model support via `ollama.ts` router. |
| **Claude CLI** | Claude Code binary | pinned `2.1.96` | SHA-256 + GPG signature verification on download. See [Pinned Dependencies](../conventions/pinned-deps.md). |
| **Syntax highlighting** | Shiki | `4.0.2` | Upgraded 2026-04-10 via `upgrade-shiki-4`. Dual-version install: top-level `shiki@4.0.2` for renderer code (`shiki-theme-loader.ts`, `diff-view-highlighter.ts`), nested `@pierre/diffs/shiki@3.23.0` for `@pierre/diffs/react` components. See [Pinned Dependencies](../conventions/pinned-deps.md). |
| **Package manager** | Bun | — | `bun.lock` tracked for reproducible builds. |
| **Testing** | bun:test | — | 19 regression guards + 1 unit test + 20 service test files = 231 tests across 40 files. See [Regression Guards](../conventions/regression-guards.md). |
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
