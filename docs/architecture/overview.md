---
title: Architecture Overview
icon: layout-dashboard
---

# Architecture Overview

1Code is a local-first Electron desktop application for parallel AI-assisted development. This page summarizes the three-process architecture, IPC model, state management, and AI backend integration. Deeper dives live in the sibling pages: [Codebase layout](./codebase-layout), [Database](./database), [tRPC routers](./trpc-routers), [Tech stack](./tech-stack), [Upstream boundary](./upstream-boundary).

## Three-process model

Electron enforces a strict separation of concerns across three Node.js / Chromium processes:

| Process | Location | Runtime | Purpose |
|---|---|---|---|
| **Main** | `src/main/` | Node.js (Electron 41, Node 24) | Privileged operations: SQLite, file system, spawning Claude/Codex CLI subprocesses, OAuth flows, MSAL, credential encryption |
| **Preload** | `src/preload/` | Node.js (sandboxed bridge) | Exposes a narrow tRPC client surface to the renderer via `contextBridge` — no direct IPC from the renderer |
| **Renderer** | `src/renderer/` | Chromium 146 (React 19, Tailwind 4) | UI only. Cannot import Node modules. Talks to main exclusively through the preload-exposed tRPC client |

The renderer is the UI; the main process is the privileged backend; the preload is the audited bridge. The goal is for `contextIsolation: true` + `nodeIntegration: false` to remain the permanent posture, with `sandbox: true` as a planned tightening (tracked in §8.9 retest).

## IPC architecture — tRPC over `trpc-electron`

All renderer → main communication uses **tRPC** transported by `trpc-electron`, not raw `ipcMain.handle` / `ipcRenderer.invoke`. The main process composes 22 routers in `createAppRouter` (see [tRPC routers](./trpc-routers)). The renderer imports a typed client from `src/renderer/lib/trpc.ts` that mirrors the router tree. Inputs are validated by `zod` schemas; outputs are serialized by `superjson` to preserve `Date`, `Map`, `Set`, and `undefined`.

Security-sensitive procedures (enterprise-auth `signOut`/`refreshToken`, `external.openExternal`) are wrapped with `authedProcedure` in `src/main/lib/trpc/index.ts`, which throws `TRPCError UNAUTHORIZED` when `authManager.isAuthenticated()` returns false. The middleware honors `isDevAuthBypassed()` so local development with `MAIN_VITE_DEV_BYPASS_AUTH=true` skips the guard.

Two narrow upstream-facing IPC handlers — `api:signed-fetch` and `api:stream-fetch` in `src/main/windows/main.ts` — bridge renderer calls to the upstream `1code.dev` / `apollosai.dev` API. Both enforce URL-origin allowlisting against `getApiUrl()` before attaching auth headers. See [Upstream boundary](./upstream-boundary) for the F-entry catalog.

## State management model

The renderer uses three cooperating state layers:

| Layer | Library | Role |
|---|---|---|
| **Server state** | React Query (via `@trpc/react-query`) | Cache, refetch, and invalidation for all tRPC queries. Mutations invalidate keyed caches to drive re-render. |
| **UI state** | Jotai atoms | Ephemeral UI state (current chat, selected file, panel open/closed). Not persisted. |
| **Persisted UI state** | Zustand stores with localStorage middleware | Theme preference, sidebar width, window layout, recent projects. |

There is **no global Redux store**. Components read from Jotai/Zustand for UI and use tRPC hooks (`trpc.chats.list.useQuery`) for server state. The main process is the authoritative source for all persisted data — the renderer is a projection of the SQLite database.

## AI backend integration

Three AI backends are supported, each invoked from the main process:

- **Claude** via `@anthropic-ai/claude-agent-sdk` (ESM-only; loaded through dynamic `import()` at runtime, not bundled — Vite is configured to externalize it)
- **Codex** via the `codex` CLI binary (pinned 0.118.0, SHA256-verified, shipped in `resources/`)
- **Ollama** via HTTP to a local server (optional; auto-detected at startup)

Users select a backend per chat session. Each backend has two interaction modes:

- **Plan mode** — multi-step planning with tool invocation previews before execution (gated by `ExitPlanMode`)
- **Agent mode** — direct tool execution with real-time streaming

The Claude SDK session is held in `src/main/lib/trpc/routers/claude.ts` (§7 decomposition pending — the file is 3,298 lines as of 2026-04-12). Sessions are streamed via tRPC subscriptions (`observable`) and terminated with a cleanup pass that cancels any in-flight tool calls.

## Database

A single SQLite database at `{userData}/data/agents.db` holds 7 Drizzle tables (`projects`, `chats`, `sub_chats`, `claude_code_credentials`, `anthropic_accounts`, `anthropic_settings`, `feature_flag_overrides`). Schema is declared in `src/main/lib/db/schema/index.ts` (source of truth); migrations are generated via `bun run db:generate` and applied automatically at startup. See [Database](./database) for the full ERD and migration workflow.

Auth and credential material is encrypted via `src/main/lib/credential-store.ts` which wraps Electron's `safeStorage` API with a three-tier fallback (OS keystore → `basic_text` obfuscation → refuse storage). Direct `safeStorage.*` calls outside `credential-store.ts` are forbidden and enforced by `tests/regression/credential-storage-tier.test.ts`.

## Enterprise fork posture

This fork is being decoupled from the upstream `1code.dev` SaaS backend. The replacement stack lives at `services/1code-api/` (Fastify + tRPC + Drizzle/PostgreSQL) and is deployed behind Envoy Gateway with Microsoft Entra ID auth. The restoration theme (locked 2026-04-08): anything the upstream SaaS provides is reverse-engineered and self-hosted — "drop the feature" and "use someone else's hosted service" are both off the table.

Canonical references: [Fork posture](../enterprise/fork-posture), [Upstream features F1–F10](../enterprise/upstream-features), [Auth strategy v2.1](../enterprise/auth-strategy), [1code-api provisioning](../enterprise/1code-api-provisioning).

## Further reading

- [Codebase layout](./codebase-layout) — full `src/` tree with responsibilities
- [Database](./database) — 7-table Drizzle schema + migration workflow
- [tRPC routers](./trpc-routers) — 22-router composition
- [Tech stack](./tech-stack) — version pins and rationale
- [Upstream boundary](./upstream-boundary) — `remoteTrpc.*` call sites and F-entry catalog
