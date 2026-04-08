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
    schema/index.ts   — Drizzle table definitions (source of truth, 7 tables)
    utils.ts          — ID generation (nanoid)
  feature-flags.ts    — Type-safe feature flag API backed by feature_flag_overrides table (Phase 0 gate #12)
  trpc/
    index.ts          — tRPC router/procedure factory
    routers/index.ts  — createAppRouter mounts 21 routers (20 from routers/ + 1 git router from ../../git)
    routers/agent-utils.ts — Shared helpers (NOT a router — utility file)
    routers/claude.ts            — Claude SDK streaming
    routers/claude-code.ts       — Claude Code binary management (uses upstream sandbox for OAuth redirect — hidden P0 dep, Gate #8 pending)
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
    routers/plugins.ts           — Plugin system (local-only — reads ~/.claude/plugins/ directly, NOT upstream)
    routers/skills.ts            — Skills system
    routers/commands.ts          — Slash command registry
    routers/voice.ts             — Voice features (OpenAI Whisper; BYOK path is local, hosted path is upstream-dependent)
    routers/worktree-config.ts   — Worktree configuration
    routers/sandbox-import.ts    — Sandbox import flow (upstream-dependent)
    routers/debug.ts             — Debug utilities
    routers/feature-flags.ts     — Feature flag override CRUD (Phase 0 gate #12, mounted as `featureFlags`)
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

## Database (7 tables, source of truth: src/main/lib/db/schema/index.ts)
- **Location**: `{userData}/data/agents.db` (SQLite via better-sqlite3)
- **Tables**:
  - `projects` — id, name, path, timestamps + git metadata (gitRemoteUrl, gitProvider, gitOwner, gitRepo) + iconPath
  - `chats` — id, name, projectId, timestamps, archivedAt + worktree fields (worktreePath, branch, baseBranch) + PR tracking (prUrl, prNumber) + index on worktreePath
  - `sub_chats` — id, name, chatId, sessionId, streamId, mode (plan|agent), messages (JSON), timestamps
  - `claude_code_credentials` — DEPRECATED, use anthropic_accounts
  - `anthropic_accounts` — multi-account OAuth (email, displayName, oauthToken, lastUsedAt)
  - `anthropic_settings` — singleton row tracking activeAccountId
  - `feature_flag_overrides` — key (PK), value (JSON-encoded text), updatedAt. Backs `src/main/lib/feature-flags.ts`. Added 2026-04-08 in migration `0008_brainy_sleepwalker.sql` (Phase 0 gate #12).
- **Migrations**: 9 migration files in `drizzle/` (`0000_*.sql` through `0008_brainy_sleepwalker.sql`)
- **Auto-migration**: `initDatabase()` runs on app start from `drizzle/` (dev) or `resources/migrations` (packaged)

## Key Entry Points
- `electron.vite.config.ts` — Build config (main/preload/renderer)
- `src/main/index.ts` — Main process entry
- `src/preload/index.ts` — IPC bridge (context isolation, exposes desktopApi)
- `src/renderer/App.tsx` — React app root

## Review & Strategy Artifacts (not in src/)
- `.full-review/` — Comprehensive multi-phase review (5 phases: 00-scope through 05-final-report, plus 06-remediation-research). 135 findings cataloged.
- `.full-review/envoy-gateway-review/` — Comprehensive review of the Envoy Gateway strategy (9 files, 47 findings, all 8 Critical resolved as of 2026-04-08, includes Smoke Test Addendum in `05-final-report.md`)
- `.scratchpad/auth-strategy-envoy-gateway.md` **v2.1** (CHOSEN strategy) — Envoy Gateway dual-auth, **empirically validated** via live smoke test 2026-04-08 against the Talos cluster
- `.scratchpad/enterprise-auth-integration-strategy.md` (v5) — MSAL-in-Electron architecture, retained as fallback
- `.scratchpad/forwardaccesstoken-smoke-test.md` — reproducible runbook for the 2026-04-08 dual-auth validation
- `.scratchpad/upstream-features-inventory.md` (**v2** as of 2026-04-08) — F1-F10 upstream-backend catalog. **All 10 entries have restoration decisions** (Phase 0 gate #15). Self-host-everything theme locked. F7 (Plugin Marketplace) and F9 (Live Browser Previews) investigated and require no restoration work.
- `openspec/changes/` — Active OpenSpec proposals: `add-feature-flag-infrastructure` (Phase 0 gate #12), `retire-mock-api-translator`
- Cluster deployment target: `/Users/jason/dev/ai-k8s/talos-ai-cluster/` (Talos + Flux v2 + Envoy Gateway v1.7.1 + cert-manager + SOPS/Age). LiteLLM deployed with Azure OpenAI / Azure AI Foundry models including `azure_ai/claude-*`. LiteLLM OSS edition has 5-user SSO limit. Hubble UI OIDC SecurityPolicy is the single-auth OIDC reference; dual-auth (passThroughAuthHeader + jwt.optional) is new as of the 2026-04-08 smoke test.

## Phase 0 Hard Gate Status (2026-04-08, 12 of 15 complete)
- ✅ #1-6 — `auth:get-token` IPC handler deletion + token preview log sanitization (regression guards in `tests/regression/`)
- ✅ #7 — Claude binary SHA-256 + GPG signature verification, Codex SHA-256 verification
- ⏳ **#8 — upstream sandbox OAuth extraction from `claude-code.ts`** (only remaining gate; current implementation uses an upstream sandbox as the OAuth redirect host — must be replaced with localhost-loopback like `auth-manager.ts` already uses)
- ✅ #9 — `.github/workflows/ci.yml` minimum-viable CI (runs all 4 quality gates on PR to main)
- ✅ #10 — Dependabot config (UI secret-scanning enable still pending)
- ✅ #11 — `bun:test` framework + 5 regression guards under `tests/regression/`
- ✅ #12 — Feature flag infrastructure (Drizzle table + lib module + tRPC router)
- ✅ #13 — OpenSpec 1.2.0 migration (config.yaml, skills under `.claude/skills/openspec-*`, old `openspec/AGENTS.md` deleted)
- ✅ #14 — Electron 39.8.6 → 39.8.7 patch
- ✅ #15 — F1-F10 restoration decisions (`upstream-features-inventory.md` v2)

## Regression Tests (`tests/regression/`, run via `bun test`)
- `auth-get-token-deleted.test.ts` — guards Gate #1-4 against re-introduction of dead IPC handler
- `token-leak-logs-removed.test.ts` — scans `src/main/` for forbidden log strings (Gate #5-6)
- `credential-manager-deleted.test.ts` — guards against re-creating orphan `credential-manager.ts`
- `gpg-verification-present.test.ts` — guards Gate #7 against GPG verification removal
- `feature-flags-shape.test.ts` — guards Gate #12 feature flag key shape against renames

## Resolved Security Findings (from earlier .full-review/, now closed)
- ~~`auth:get-token` IPC handler dead code (CVSS 9.0)~~ — RESOLVED (Phase 0 #1-4)
- ~~Token preview logging in `claude.ts` and `claude/env.ts`~~ — RESOLVED (Phase 0 #5-6)
- ~~Binary downloaders may not verify SHA-256~~ — RESOLVED (Phase 0 #7), now also verifies GPG for Claude
- ~~`validateSender` uses old `event.sender.getURL()` pattern~~ — Need to verify whether this was fixed; not in Phase 0 hard gate list
- ⏳ Claude Code OAuth flow uses upstream sandbox as redirect host (`claude-code.ts:178-220`) — **only Phase 0 gate still pending (#8)**
