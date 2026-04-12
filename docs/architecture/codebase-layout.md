---
title: Codebase Layout
icon: folder-tree
---

# Codebase Layout {subtitle="Three-process Electron app plus self-hosted backend services"}

1Code is an **Electron desktop application** with a parallel **self-hosted backend service**. The repository organizes code across three Electron processes (main, preload, renderer), a separate backend service, Kubernetes deployment manifests, documentation, and OpenSpec change proposals.

## Top-level tree

```
├── src/                   # Electron desktop app (three processes)
│   ├── main/              # Node.js main process — tRPC routers, DB, subprocess spawn
│   ├── preload/           # IPC bridge with context isolation
│   └── renderer/          # React 19 + Tailwind 4 UI
├── services/              # Self-hosted backend services (replace upstream 1code.dev)
│   └── 1code-api/         # Fastify + tRPC + Drizzle/PostgreSQL
├── deploy/                # Kubernetes Flux v2 manifests
│   └── kubernetes/1code-api/
├── docs/                  # Canonical xyd-js documentation site
├── openspec/              # OpenSpec 1.2.0 change proposals + 13 capability specs
│   ├── changes/           # Active + archived change proposals
│   └── specs/             # Baseline capability specs
├── .claude/               # Claude Code behavioral rules, skills, subagents
│   ├── rules/             # 10 rules (2 global + 8 path-scoped)
│   ├── skills/            # 17 workflow skills
│   └── agents/            # 5 subagents
├── .serena/memories/      # Serena project memories (6 files)
├── .github/workflows/     # CI (ci.yml, release.yml, container-build.yml)
├── drizzle/               # Generated DB migrations (10 files)
├── tests/regression/      # bun:test regression guards (19 guards + 1 unit test)
├── scripts/               # Build + binary-download scripts (Claude CLI, Codex)
└── docs-drift-check/      # (inside .claude/skills/) drift audit catalog
```

## Services layer

The `services/` directory contains self-hosted backend services that replace the upstream `1code.dev` SaaS:

| Service | Stack | Purpose |
|---------|-------|---------|
| `services/1code-api/` | Fastify + tRPC + Drizzle/PostgreSQL | Backend API — changelog, plan, profile, health endpoints + LiteLLM provisioning subsystem |

Container images are built via `.github/workflows/container-build.yml` (multi-arch amd64+arm64, Cosign keyless signing, SLSA provenance) and pushed to `ghcr.io/jrmatherly/1code-api`. The `aquasecurity/trivy-action` is SHA-pinned to the post-compromise `0.35.0` commit.

## Main process (`src/main/`)

The Node.js main process owns all privileged operations — subprocess spawning, file I/O outside the sandbox, OS integration, credential encryption, and the SQLite database.

Key files:

| File | Purpose |
|------|---------|
| `index.ts` | App entry — creates `BrowserWindow`, registers IPC handlers, hooks protocol |
| `auth-manager.ts` | Strangler Fig adapter — branches between legacy `AuthStore` and enterprise `EnterpriseAuth` via `enterpriseAuthEnabled` flag |
| `lib/credential-store.ts` | **Unified 3-tier credential encryption** — all `safeStorage.encryptString/decryptString` calls go here |
| `lib/safe-external.ts` | **Scheme-validated `safeOpenExternal()`** — all `shell.openExternal()` calls go here (blocks `file:`/`javascript:`/`data:`) |
| `lib/frontmatter.ts` | **Canonical frontmatter parser shim** — wraps `front-matter@4.0.2`; all main-process frontmatter parsing goes here |
| `lib/enterprise-auth.ts` | MSAL Node Entra token acquisition (wired into auth-manager) |
| `lib/claude/env.ts` | `applyEnterpriseAuth()` — the ONLY sanctioned way to set `ANTHROPIC_AUTH_TOKEN` in spawn env |
| `lib/terminal/session.ts` | **Lazy import** for `node-pty` (prevents crash if native module fails) |
| `lib/db/schema/index.ts` | **Drizzle schema — source of truth** (see [Database](./database.md)) |
| `lib/trpc/routers/index.ts` | `createAppRouter` composition (see [tRPC Routers](./trpc-routers.md)) |
| `lib/trpc/schemas/mcp-url.ts` | MCP server URL SSRF-prevention schema |
| `lib/feature-flags.ts` | Type-safe feature flags backed by DB with in-memory cache |

## Preload (`src/preload/`)

The preload script runs with **context isolation enabled** — it exposes a minimal, typed API surface to the renderer via `contextBridge.exposeInMainWorld()`. The renderer cannot call into Node.js or Electron APIs directly.

## Renderer (`src/renderer/`)

React 19 + Tailwind 4 single-page app. Organized by **feature modules** under `features/`:

```
src/renderer/
├── App.tsx                       # Router + top-level providers
├── login.html                    # Pre-auth sign-in page (separate entry)
├── contexts/                     # React context providers
│   └── TRPCProvider.tsx          # Single tRPC + React Query provider
├── components/                   # Shared UI components
│   ├── dialogs/                  # Modal dialogs (settings tabs)
│   └── ui/                       # shadcn/ui components
├── features/                     # Feature modules (one per domain)
│   ├── agents/                   # Chat/agent UI (main feature — includes 8,743-line active-chat.tsx)
│   ├── automations/              # Scheduled tasks
│   ├── changes/                  # Git diff viewer
│   ├── layout/                   # App shell, sidebars
│   ├── settings/                 # Settings page
│   ├── sidebar/                  # Left nav
│   └── workspaces/               # Project/workspace switcher
├── lib/                          # Shared renderer utilities
│   ├── analytics.ts              # PostHog SDK integration (env-var-gated)
│   ├── mock-api.ts               # Shrunk F-entry stubs (Phase 2: 655 → 144 lines)
│   ├── message-parser.ts         # 5-stage tool normalization pipeline
│   ├── remote-trpc.ts            # Upstream tRPC client (F-entry boundary)
│   └── hooks/                    # Custom React hooks
├── stores/                       # Jotai atoms + Zustand stores
└── types/                        # Renderer-specific type declarations
```

### State management

- **Jotai** — UI state (selected chat, sidebar open, preview settings)
- **Zustand** — persisted tabs, pinned sub-chats (note: `useAgentSubChatStore` does NOT use `persist()` — it rebuilds from DB on `setChatId()`)
- **React Query** via tRPC — server state (auto-caching, refetching)

## Documentation site (`docs/`)

The `docs/` directory is a **tracked xyd-js site** with 5 tabs (Overview, Architecture, Conventions, Operations, Enterprise). The canonical home for all fork documentation. Built via `cd docs && bun run build`.

## OpenSpec (`openspec/`)

OpenSpec 1.2.0 change proposals and baseline capability specs. The workflow:

1. `/opsx:propose` — create a change with all artifacts
2. `/opsx:apply` — implement tasks (iterates checkboxes in `tasks.md`)
3. `/opsx:verify` — validate before archiving
4. `/opsx:archive` — promote delta specs to baselines

Current state:
- **13 baseline capability specs** (91 requirements)
- **Active changes**: `upgrade-vite-8-build-stack` (15/50 — Phase B blocked), `security-hardening-and-quality-remediation` (45/81 — Phase C in progress)

## File-naming conventions

| Kind | Convention | Example |
|------|-----------|---------|
| React components | PascalCase | `SettingsDialog.tsx` |
| Utilities, hooks | kebab-case | `use-file-change-listener.ts` |
| Stores | kebab-case | `agent-chat-store.ts` |
| tRPC routers | kebab-case | `claude-code.ts` |
| Tests | `<name>.test.ts` | `mcp-url-ssrf-prevention.test.ts` |

## Related

- [Database](./database.md) — Drizzle schema + migrations
- [tRPC Routers](./trpc-routers.md) — 22-router `createAppRouter` composition
- [Tech Stack](./tech-stack.md) — layer-by-layer technology choices
- [Upstream Backend Boundary](./upstream-boundary.md) — `remoteTrpc.*` call sites
