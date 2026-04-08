# Codebase Structure

## Top-Level
```
src/           — Application source code
drizzle/       — Database migration files
resources/     — Static assets (icons, migrations for packaged app)
scripts/       — Build, release, and utility scripts
build/         — Electron-builder config
openspec/      — OpenSpec change proposal system
.scratchpad/   — Working strategy/research docs (gitignored)
.full-review/  — Comprehensive review artifacts (gitignored)
.serena/       — Serena project memories
```

## Main Process (`src/main/`)
```
index.ts              — App entry, window lifecycle
auth-manager.ts       — OAuth flow, token refresh
auth-store.ts         — Encrypted credential storage (safeStorage)
constants.ts          — App constants
windows/main.ts       — Window creation, IPC handlers
lib/
  auto-updater.ts     — electron-updater config; CDN_BASE on line 33 = upstream CDN (flip for self-host)
  db/
    index.ts          — DB init, auto-migrate on startup
    schema/index.ts   — Drizzle table definitions (source of truth, 6 tables)
    utils.ts          — ID generation (nanoid)
  trpc/
    index.ts          — tRPC router/procedure factory
    routers/index.ts  — createAppRouter mounts 20 routers (19 from routers/ + 1 git router from ../../git)
    routers/agent-utils.ts — Shared helpers (NOT a router — utility file)
    routers/claude.ts            — Claude SDK streaming
    routers/claude-code.ts       — Claude Code binary management (uses upstream sandbox for OAuth redirect — hidden P0 dep)
    routers/claude-settings.ts   — Claude-specific user settings
    routers/anthropic-accounts.ts— Multi-account Anthropic OAuth
    routers/codex.ts             — Codex integration
    routers/ollama.ts            — Ollama local models
    routers/projects.ts          — Project CRUD
    routers/chats.ts             — Chat CRUD
    routers/agents.ts            — Agent management
    routers/terminal.ts          — Terminal/PTY sessions
    routers/files.ts             — File operations
    routers/external.ts          — External / remote backend bridges
    routers/plugins.ts           — Plugin system
    routers/skills.ts            — Skills system
    routers/commands.ts          — Slash command registry
    routers/voice.ts             — Voice features (OpenAI Whisper; BYOK path is local, hosted path is upstream-dependent)
    routers/worktree-config.ts   — Worktree configuration
    routers/sandbox-import.ts    — Sandbox import flow (upstream-dependent)
    routers/debug.ts             — Debug utilities
    schemas/mcp-url.ts           — SSRF-safe MCP server URL validation schema
```

## Renderer (`src/renderer/`)
```
App.tsx               — Root with providers
features/
  agents/             — Main chat interface (core feature)
    main/             — active-chat.tsx, messages, input
    ui/               — Tool renderers, preview, diff view
    components/       — Shared agent-scoped components
    commands/         — Slash commands
    atoms/            — Jotai atoms for agent state
    stores/           — Zustand stores
    hooks/            — Chat-specific hooks
    context/          — React context providers
    lib/              — Agent-scoped utilities
    utils/            — Pure helper functions
    search/           — Chat search
    mentions/         — @-mention system
    constants.ts      — Agent constants
  sidebar/            — Chat list, navigation
  terminal/           — Integrated terminal (node-pty + xterm)
  kanban/             — Kanban board view
  file-viewer/        — File browser/viewer
  hooks/              — Automation hooks
  automations/        — Automations & inbox (FULLY upstream-dependent via remoteTrpc.*)
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
  remote-trpc.ts      — Remote tRPC client (TYPED — upstream backend boundary marker)
  remote-app-router.ts — Typed AppRouter stub (TRPCBuiltRouter pattern)
  remote-types.ts     — Shared types for remote tRPC (breaks circular dep)
  remote-api.ts       — Thin facade over remoteTrpc.agents.*
  api-fetch.ts        — getApiBaseUrl() + cached base URL helper
  jotai-store.ts      — Jotai store provider
  window-storage.ts   — Window state persistence
  analytics.ts        — PostHog analytics
  mock-api.ts         — DEPRECATED but still imported by 6 files in features/agents/ (DO NOT delete without migrating call sites)
```

## Database (6 tables, source of truth: src/main/lib/db/schema/index.ts)
- **Location**: `{userData}/data/agents.db` (SQLite via better-sqlite3)
- **Tables**:
  - `projects` — id, name, path, timestamps + git metadata (gitRemoteUrl, gitProvider, gitOwner, gitRepo) + iconPath
  - `chats` — id, name, projectId, timestamps, archivedAt + worktree fields (worktreePath, branch, baseBranch) + PR tracking (prUrl, prNumber) + index on worktreePath
  - `sub_chats` — id, name, chatId, sessionId, streamId, mode (plan|agent), messages (JSON), timestamps
  - `claude_code_credentials` — DEPRECATED, use anthropic_accounts
  - `anthropic_accounts` — multi-account OAuth (email, displayName, oauthToken, lastUsedAt)
  - `anthropic_settings` — singleton row tracking activeAccountId
- **Auto-migration**: `initDatabase()` runs on app start from `drizzle/` (dev) or `resources/migrations` (packaged)

## Key Entry Points
- `electron.vite.config.ts` — Build config (main/preload/renderer)
- `src/main/index.ts` — Main process entry
- `src/preload/index.ts` — IPC bridge (context isolation, exposes desktopApi)
- `src/renderer/App.tsx` — React app root

## Review & Strategy Artifacts (not in src/)
- `.full-review/` — Comprehensive multi-phase review (5 phases: 00-scope through 05-final-report, plus 06-remediation-research). 135 findings cataloged.
- `.scratchpad/enterprise-auth-integration-strategy.md` (v5) — MSAL-in-Electron auth architecture
- `.scratchpad/auth-strategy-envoy-gateway.md` (v1) — Envoy Gateway dual-auth alternative
- `.scratchpad/upstream-features-inventory.md` — F1-F10 upstream-backend dependency catalog (created 2026-04-08)
- Cluster deployment target: `/Users/jason/dev/ai-k8s/talos-ai-cluster/` (Talos + Flux v2 + Envoy Gateway + cert-manager + SOPS/Age). LiteLLM already deployed with Azure OpenAI / Azure AI Foundry models including `azure_ai/claude-*`. LiteLLM OSS edition has 5-user SSO limit. Hubble UI OIDC SecurityPolicy is the proven Entra ID OIDC pattern in cluster.

## Known Security Findings (from .full-review/)
- `auth:get-token` IPC handler is dead code (CVSS 9.0 if exploited): `src/preload/index.ts:198`, `:461`, `src/main/windows/main.ts:434-437` — safe to delete
- Token preview logging in `src/main/lib/trpc/routers/claude.ts:200-204` AND `:244-248` (two separate occurrences)
- `download-claude-binary.mjs` / `download-codex-binary.mjs` may not verify SHA256 checksums (supply chain risk)
- `validateSender` uses `event.sender.getURL()` instead of the Electron 28+ `event.senderFrame.url` pattern
- Claude Code OAuth flow uses upstream sandbox as a redirect host (`claude-code.ts:178-220`) — P0 hidden dependency
