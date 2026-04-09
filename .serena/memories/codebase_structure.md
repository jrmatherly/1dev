# Codebase Structure

## Top-Level
```
src/           — Application source code
drizzle/       — Database migration files
resources/     — Static assets (icons, migrations for packaged app)
scripts/       — Build, release, and utility scripts
build/         — Electron-builder config
docs/          — Canonical documentation site (xyd-js, 25 pages, 5 tabs)
openspec/      — OpenSpec change proposal system
  specs/       — Durable capability specs (5: brand-identity, feature-flags, claude-code-auth-import, documentation-site, credential-storage)
  changes/     — Active change proposals
  changes/archive/ — Archived completed changes
.scratchpad/   — Ephemeral local-only working notes (gitignored). Canonical docs live in docs/
.full-review/  — Comprehensive review artifacts (gitignored)
.serena/       — Serena project memories
tests/regression/ — bun:test regression guards (10 files, 36 tests as of 2026-04-09)
```

## Main Process (`src/main/`)
```
index.ts              — App entry, window lifecycle
auth-manager.ts       — OAuth flow, token refresh
auth-store.ts         — Encrypted credential storage (delegates to credential-store.ts)
constants.ts          — App constants
windows/main.ts       — Window creation, IPC handlers
lib/
  auto-updater.ts     — electron-updater config; CDN_BASE = https://cdn.apollosai.dev/releases/desktop
  cli.ts              — CLI launcher (line 6 has upstream PR attribution — Tier C, preserved)
  claude-config.ts    — Worktree path detection (uses .1code/worktrees)
  git/worktree.ts     — Worktree creation (creates under ~/.1code/worktrees/)
  mcp-auth.ts         — MCP OAuth. Client name is "1code-desktop"
  db/
    index.ts          — DB init, auto-migrate on startup
    schema/index.ts   — Drizzle table definitions (source of truth, 7 tables)
    utils.ts          — ID generation (nanoid)
  credential-store.ts — Unified 3-tier credential encryption (Tier 1: OS keystore, Tier 2: basic_text warn, Tier 3: refuse)
  feature-flags.ts    — Type-safe feature flag API backed by feature_flag_overrides table (5 flags incl. credentialStorageRequireEncryption)
  trpc/
    index.ts          — tRPC router/procedure factory
    routers/index.ts  — createAppRouter mounts 21 routers (20 from routers/ + 1 git router from ../../git)
    routers/agent-utils.ts — Shared helpers (NOT a router — utility file)
    routers/          — 20 feature routers (claude, claude-code, claude-settings, anthropic-accounts, codex, ollama, projects, chats, agents, terminal, files, external, plugins, skills, commands, voice, worktree-config, sandbox-import, debug, feature-flags)
    schemas/mcp-url.ts — SSRF-safe MCP server URL validation schema
```

## Renderer (`src/renderer/`)
```
App.tsx               — Root with providers
features/
  agents/             — Main chat interface (core feature)
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
  trpc.ts             — Local tRPC client
  remote-trpc.ts      — Remote tRPC client (TYPED — upstream backend boundary marker)
  remote-app-router.ts — Typed AppRouter stub (TRPCBuiltRouter pattern)
  remote-types.ts     — Shared types for remote tRPC
  mock-api.ts         — DEPRECATED but still imported by 6 files in features/agents/
```

## Documentation Site (`docs/`)
```
docs.json             — xyd-js config (5 tabs: Architecture, Enterprise, Conventions, Operations, API Reference)
package.json          — @xyd-js/cli pinned to 0.0.0-build-1202121-20260121231224
bun.lock              — Tracked lockfile (926 packages)
.gitignore            — Ignores .xyd/ (build output)
introduction.md       — Landing page
architecture/         — 6 pages (1 authored: upstream-boundary, 5 stubs)
enterprise/           — 7 pages (all authored: fork-posture, upstream-features, auth-strategy, auth-fallback, envoy-smoke-test, phase-0-gates, cluster-facts)
conventions/          — 7 pages (4 authored: quality-gates, regression-guards, no-scratchpad-references, tscheck-baseline; 3 stubs)
operations/           — 4 stubs (release, debugging-first-install, env-gotchas, cluster-access)
openapi.json          — OpenAPI scaffold (future use)
public/assets/        — 1Code logo SVGs (light + dark)
```

## Database (7 tables, source of truth: src/main/lib/db/schema/index.ts)
- **Location**: `{userData}/data/agents.db` (SQLite via better-sqlite3)
- **Tables**: projects, chats, sub_chats, claude_code_credentials (DEPRECATED), anthropic_accounts, anthropic_settings, feature_flag_overrides
- **Migrations**: 9 files in `drizzle/` (`0000_*.sql` through `0008_brainy_sleepwalker.sql`)

## Review & Strategy Artifacts
- `.full-review/` — Comprehensive multi-phase review (135 findings)
- `.full-review/envoy-gateway-review/` — Envoy Gateway strategy review (47 findings, all 8 Critical resolved)
- `docs/enterprise/auth-strategy.md` — CHOSEN auth strategy (Envoy Gateway dual-auth v2.1, empirically validated)
- `docs/enterprise/auth-fallback.md` — MSAL-in-Electron fallback (v5, retained but not chosen)
- `docs/enterprise/envoy-smoke-test.md` — Reproducible dual-auth validation runbook
- `docs/enterprise/upstream-features.md` — F1-F10 upstream-backend catalog (all 10 decisions locked)
- Cluster deployment target: `/Users/jason/dev/ai-k8s/talos-ai-cluster/` (Talos + Flux v2 + Envoy Gateway v1.7.1)

## Phase 0 Hard Gate Status (15 of 15 complete ✅)
All gates closed. Phase 0.5 (harden-credential-storage) also complete — unified credential encryption in credential-store.ts.

## Regression Tests (`tests/regression/`, run via `bun test`)
Ten guards as of 2026-04-09:
- `auth-get-token-deleted.test.ts` — Gates #1-4
- `token-leak-logs-removed.test.ts` — Gates #5-6
- `credential-manager-deleted.test.ts` — tscheck remediation R1
- `gpg-verification-present.test.ts` — Gate #7
- `feature-flags-shape.test.ts` — Gate #12
- `brand-sweep-complete.test.ts` — rebrand-residual-sweep
- `no-scratchpad-references.test.ts` — documentation-site capability
- `no-upstream-sandbox-oauth.test.ts` — Gate #8
- `mock-api-no-snake-timestamps.test.ts` — mock-api translator retirement
- `credential-storage-tier.test.ts` — credential-store centralization (9 assertions)

## .claude/ Automations Inventory
- **Agents**: `db-schema-auditor`, `security-reviewer`, `trpc-router-auditor`, `ui-reviewer`, `upstream-dependency-auditor`
- **Skills**: `docs-drift-check`, `new-router`, `new-regression-guard`, `openspec-*` (5), `phase-0-progress`, `release`, `upstream-boundary-check`, `verify-pin`, `verify-strategy-compliance`
- **Hooks**: Pre/Post-tool-use on Edit|Write; auth-code edit warning; ts:check baseline drift tracker; Vite/builder smoke check; regression guards auto-run; safeStorage guard (blocks direct calls outside credential-store.ts); credential/auth regression trigger
