# Codebase Structure

## Top-Level
```
src/           — Application source code
drizzle/       — Database migration files
resources/     — Static assets (icons, migrations for packaged app)
scripts/       — Build, release, and utility scripts (sync-to-public.sh DELETED 2026-04-09 with rebrand-residual-sweep)
build/         — Electron-builder config
openspec/      — OpenSpec change proposal system
  specs/       — Durable capability specs (promoted from archived changes). First spec: brand-identity (added 2026-04-09)
  changes/     — Active change proposals
  changes/archive/ — Archived completed changes (e.g. 2026-04-09-rebrand-residual-sweep)
.scratchpad/   — Working strategy/research docs (gitignored)
.full-review/  — Comprehensive review artifacts (gitignored)
.serena/       — Serena project memories
tests/regression/ — bun:test regression guards (6 files, 14 tests as of 2026-04-09)
```

## Main Process (`src/main/`)
```
index.ts              — App entry, window lifecycle. Line 600: Windows AppUserModelId is dev.apollosai.agents[.dev] (rebranded 2026-04-08)
auth-manager.ts       — OAuth flow, token refresh. Line 87: user-agent is "1Code ${version}" (rebranded from "21st Desktop")
auth-store.ts         — Encrypted credential storage (safeStorage)
constants.ts          — App constants
windows/main.ts       — Window creation, IPC handlers
lib/
  auto-updater.ts     — electron-updater config; CDN_BASE = https://cdn.apollosai.dev/releases/desktop
  cli.ts              — CLI launcher. Line 6 has an upstream PR attribution comment (github.com/21st-dev/1code/pull/16) — Tier C, preserved deliberately per brand-identity capability spec
  claude-config.ts    — Worktree path detection (uses .1code/worktrees, rebranded from .21st/ on 2026-04-09)
  git/worktree.ts     — Worktree creation (creates under ~/.1code/worktrees/)
  mcp-auth.ts         — MCP OAuth. Client name is "1code-desktop" (rebranded from "21st-desktop")
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
    routers/projects.ts          — Project CRUD (clones repos to ~/.1code/repos/)
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
      logo.tsx (components/ui/) — aria-label="1Code logo" (rebranded from "21st logo")
      agent-preview.tsx — 2 logo sites, both aria-label="1Code logo"
    components/       — Shared agent-scoped components
      agents-help-popover.tsx — changelog link → https://apollosai.dev/changelog
    commands/         — Slash commands
    atoms/            — Jotai atoms for agent state
    stores/           — Zustand stores
    hooks/            — Chat-specific hooks
      use-changed-files-tracking.ts — worktree regex matches \.1code/worktrees
    context/          — React context providers
    lib/              — Agent-scoped utilities
    utils/            — Pure helper functions
      git-activity.ts — worktree path regex matches \.1code/worktrees
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
    sections/info-section.tsx — line 176 runtime .includes(".1code/worktrees") check
  mentions/           — Global @-mention
  layout/             — Main layout with resizable panels
components/ui/        — Radix UI wrappers
  logo.tsx            — Main app logo (aria-label="1Code logo")
  update-banner.tsx   — Update link → https://apollosai.dev/changelog
lib/
  atoms/              — Global Jotai atoms
    index.ts          — systemLight/Dark theme atoms default to "1code-light"/"1code-dark"; "1code-session-info" localStorage key
  stores/             — Global Zustand stores
  hooks/use-just-updated.ts — post-update link → https://apollosai.dev/changelog
  themes/
    builtin-themes.ts — ONE_CODE_DARK/ONE_CODE_LIGHT theme constants, IDs "1code-dark"/"1code-light", DEFAULT_*_THEME_ID exports
    diff-view-highlighter.ts — Shiki theme mappings use "1code-dark"/"1code-light"
    shiki-theme-loader.ts — Shiki theme mappings use "1code-dark"/"1code-light"
  trpc.ts             — Local tRPC client
  remote-trpc.ts      — Remote tRPC client (TYPED — upstream backend boundary marker)
  remote-app-router.ts — Typed AppRouter stub (TRPCBuiltRouter pattern). File doc comment describes "legacy upstream" without literal "21st.dev" string
  remote-types.ts     — Shared types for remote tRPC (breaks circular dep). Same legacy-upstream framing
  remote-api.ts       — Thin facade over remoteTrpc.agents.*
  api-fetch.ts        — getApiBaseUrl() + cached base URL helper
  jotai-store.ts      — Jotai store provider
  window-storage.ts   — Window state persistence
  analytics.ts        — PostHog analytics
  mock-api.ts         — DEPRECATED but still imported by 6 files in features/agents/ (DO NOT delete without migrating call sites)
login.html            — <title>1Code - Login</title> (rebranded from "21st - Login")
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
- `src/main/index.ts` — Main process entry (line 600 sets Windows AppUserModelId)
- `src/preload/index.ts` — IPC bridge (context isolation, exposes desktopApi)
- `src/renderer/App.tsx` — React app root

## User Data Filesystem Paths (rebranded 2026-04-09)
- `~/.1code/worktrees/` — git worktrees for chats (formerly `.21st/worktrees/`)
- `~/.1code/repos/` — cloned repositories (formerly `.21st/repos/`)
- `.1code/worktree.json` — per-worktree config file (name unchanged; the parent dir rename made this consistent)

## Review & Strategy Artifacts (not in src/)
- `.full-review/` — Comprehensive multi-phase review (5 phases: 00-scope through 05-final-report, plus 06-remediation-research). 135 findings cataloged.
- `.full-review/envoy-gateway-review/` — Comprehensive review of the Envoy Gateway strategy (9 files, 47 findings, all 8 Critical resolved as of 2026-04-08, includes Smoke Test Addendum in `05-final-report.md`)
- `.scratchpad/auth-strategy-envoy-gateway.md` **v2.1** (CHOSEN strategy) — Envoy Gateway dual-auth, **empirically validated** via live smoke test 2026-04-08 against the Talos cluster
- `.scratchpad/enterprise-auth-integration-strategy.md` (v5) — MSAL-in-Electron architecture, retained as fallback
- `.scratchpad/forwardaccesstoken-smoke-test.md` — reproducible runbook for the 2026-04-08 dual-auth validation
- `.scratchpad/upstream-features-inventory.md` (**v2** as of 2026-04-08) — F1-F10 upstream-backend catalog. **All 10 entries have restoration decisions** (Phase 0 gate #15). Self-host-everything theme locked. F7 (Plugin Marketplace) and F9 (Live Browser Previews) investigated and require no restoration work.
- `.scratchpad/rebrand-residual-audit.md` — 2026-04-08 audit of 17 residual brand references; informed the rebrand-residual-sweep openspec change
- `openspec/changes/` — Active OpenSpec proposals: `add-feature-flag-infrastructure` (Phase 0 gate #12), `retire-mock-api-translator`
- `openspec/changes/archive/2026-04-09-rebrand-residual-sweep/` — ARCHIVED rebrand sweep (40 files, 35 edits, commits 76fe005 + 4dbbcce on 2026-04-09)
- `openspec/specs/brand-identity/spec.md` — **FIRST CAPABILITY SPEC** in the repo. Promoted from rebrand-residual-sweep on archive. 11 SHALL/MUST requirements codifying the Tier A/B/C brand taxonomy. Authoritative source for "what counts as upstream brand vs product name vs attribution" — any future rebrand audit must cite this.
- Cluster deployment target: `/Users/jason/dev/ai-k8s/talos-ai-cluster/` (Talos + Flux v2 + Envoy Gateway v1.7.1 + cert-manager + SOPS/Age). LiteLLM deployed with Azure OpenAI / Azure AI Foundry models including `azure_ai/claude-*`. LiteLLM OSS edition has 5-user SSO limit. Hubble UI OIDC SecurityPolicy is the single-auth OIDC reference; dual-auth (passThroughAuthHeader + jwt.optional) is new as of the 2026-04-08 smoke test.

## Phase 0 Hard Gate Status (2026-04-09, 12 of 15 complete — unchanged since 2026-04-08)
- ✅ #1-6 — `auth:get-token` IPC handler deletion + token preview log sanitization (regression guards in `tests/regression/`)
- ✅ #7 — Claude binary SHA-256 + GPG signature verification, Codex SHA-256 verification
- ⏳ **#8 — upstream sandbox OAuth extraction from `claude-code.ts`** (only remaining gate; current implementation uses an upstream sandbox as the OAuth redirect host — must be replaced with localhost-loopback like `auth-manager.ts` already uses)
- ✅ #9 — `.github/workflows/ci.yml` minimum-viable CI (runs all 4 quality gates on PR to main)
- ✅ #10 — Dependabot config (UI secret-scanning enable still pending)
- ✅ #11 — `bun:test` framework + 6 regression guards under `tests/regression/` (14 tests, 40 expect calls, ~200ms total)
- ✅ #12 — Feature flag infrastructure (Drizzle table + lib module + tRPC router)
- ✅ #13 — OpenSpec 1.2.0 migration (config.yaml, skills under `.claude/skills/openspec-*`, old `openspec/AGENTS.md` deleted)
- ✅ #14 — Electron 39.8.6 → 39.8.7 patch
- ✅ #15 — F1-F10 restoration decisions (`upstream-features-inventory.md` v2)

## Regression Tests (`tests/regression/`, run via `bun test`)
Six guards as of 2026-04-09 (rebrand sweep added the 6th):
- `auth-get-token-deleted.test.ts` — guards Gate #1-4 against re-introduction of dead IPC handler
- `brand-sweep-complete.test.ts` — 2026-04-09, scans src/main/, src/renderer/, scripts/, package.json, README.md for residual /21st/i, /twentyfirst/i, /1code\.dev/i patterns. File-level allowlist exempts `src/main/lib/cli.ts` (upstream PR attribution comment) and `README.md` (Tier C attribution + historical + upstream-pointer). Enforces the brand-identity capability spec.
- `credential-manager-deleted.test.ts` — guards against re-creating orphan `credential-manager.ts`
- `feature-flags-shape.test.ts` — guards Gate #12 feature flag key shape against renames
- `gpg-verification-present.test.ts` — guards Gate #7 against GPG verification removal
- `token-leak-logs-removed.test.ts` — scans `src/main/` for forbidden log strings (Gate #5-6)

## .claude/ Automations Inventory (as of 2026-04-09)
- **Agents** (`.claude/agents/`): `db-schema-auditor`, `security-reviewer`, `trpc-router-auditor`, `ui-reviewer`, `upstream-dependency-auditor`
- **Skills** (`.claude/skills/`): `docs-drift-check` (extended 2026-04-09 with Bonus #11 deleted-file-reference check), `new-router`, `new-regression-guard` (NEW 2026-04-09, scaffolds bun:test guards), `openspec-{apply-change,archive-change,explore,propose,propose-gate}`, `phase-0-progress`, `release`, `upstream-boundary-check`, `verify-pin`, `verify-strategy-compliance`
- **Hooks** (`.claude/settings.json`): Pre/Post-tool-use hooks on Edit|Write; auth-code edit warning; ts:check baseline drift tracker (reads `.claude/.tscheck-baseline`); Vite/builder config smoke check; regression guards auto-run on auth/router edits
- `.claude/.tscheck-baseline` — contains `88`, the current ts:check error baseline, consumed by the PostToolUse hook

## Resolved Security Findings (from earlier .full-review/, now closed)
- ~~`auth:get-token` IPC handler dead code (CVSS 9.0)~~ — RESOLVED (Phase 0 #1-4)
- ~~Token preview logging in `claude.ts` and `claude/env.ts`~~ — RESOLVED (Phase 0 #5-6)
- ~~Binary downloaders may not verify SHA-256~~ — RESOLVED (Phase 0 #7), now also verifies GPG for Claude
- ~~`validateSender` uses old `event.sender.getURL()` pattern~~ — Need to verify whether this was fixed; not in Phase 0 hard gate list
- ⏳ Claude Code OAuth flow uses upstream sandbox as redirect host (`claude-code.ts:178-220`) — **only Phase 0 gate still pending (#8)**
