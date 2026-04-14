# 1Code Project Index

> Auto-generated project knowledge base for AI-assisted development.
> Last indexed: 2026-04-09 | Version: 0.0.72 | Files: 532 TS/TSX in `src/`

**Fork posture:** Enterprise fork of upstream 1Code. Decoupling from `1code.dev` SaaS in favor of self-hosted infrastructure (LiteLLM + Microsoft Entra via Envoy Gateway). All upstream-dependent features (F1–F12) catalogued in `docs/enterprise/upstream-features.md`. F11 + F12 (sub-chat name + commit message generation) resolved 2026-04-13 via `src/main/lib/aux-ai.ts` provider-aware dispatch.

---

## Quick Reference

| Item | Location |
|------|----------|
| App entry | `src/main/index.ts` |
| React root | `src/renderer/App.tsx` |
| IPC bridge | `src/preload/index.ts` |
| DB schema (source of truth) | `src/main/lib/db/schema/index.ts` |
| Build config | `electron.vite.config.ts` |
| tRPC router registry | `src/main/lib/trpc/routers/index.ts` |
| Git tRPC router | `src/main/lib/git/index.ts` (mounted as `changes`) |
| Feature flags | `src/main/lib/feature-flags.ts` |
| Auth strategy (chosen) | `docs/enterprise/auth-strategy.md` v2.1 |
| Upstream dependency catalog | `docs/enterprise/upstream-features.md` v2 |

---

## 1. Main Process (`src/main/`) — 102 TS files

### Core Files

| File | Purpose |
|------|---------|
| `index.ts` | App entry — window lifecycle, protocol handlers, auto-update |
| `auth-manager.ts` | OAuth flow, token refresh, credential management |
| `auth-store.ts` | Encrypted credential storage via Electron `safeStorage` |
| `auto-updater.ts` | electron-updater config (github provider, reads app-update.yml baked at build time) |
| `constants.ts` | App-wide constants |
| `windows/main.ts` | BrowserWindow creation, IPC handler registration |

### Database Layer (`src/main/lib/db/`)

| File | Purpose |
|------|---------|
| `index.ts` | DB initialization, auto-migrate on startup |
| `schema/index.ts` | Drizzle table definitions (source of truth) |
| `utils.ts` | ID generation (nanoid via `createId`) |

**Tables (7):** `projects`, `chats`, `sub_chats`, `claude_code_credentials` (DEPRECATED), `anthropic_accounts`, `anthropic_settings`, `feature_flag_overrides`

**Migrations (9):** `drizzle/0000_*.sql` through `drizzle/0008_brainy_sleepwalker.sql`

### Feature Flags (`src/main/lib/feature-flags.ts`)

New as of 2026-04-08 (Phase 0 hard gate #12). Type-safe flag API backed by `feature_flag_overrides` table. Initial flags wired for the auth migration. Tests in `tests/regression/feature-flags-shape.test.ts`. Spec lives in `openspec/changes/add-feature-flag-infrastructure/`.

### tRPC Routers (`src/main/lib/trpc/routers/`) — 23 routers in `createAppRouter`

22 feature routers imported from `routers/` + 1 git router from `../../git` mounted as `changes`. The file `agent-utils.ts` in `routers/` is a **helper module, not a router**.

| Router file | Mounted as | Purpose |
|-------------|------------|---------|
| `projects.ts` | `projects` | Project CRUD, local folder management |
| `chats.ts` | `chats` | Chat CRUD, archive, worktree linking |
| `claude.ts` | `claude` | Claude SDK streaming, message subscriptions |
| `claude-code.ts` | `claudeCode` | Claude Code binary management, OAuth (uses upstream sandbox redirect — P0 hidden upstream dep) |
| `claude-settings.ts` | `claudeSettings` | Claude configuration, model preferences |
| `anthropic-accounts.ts` | `anthropicAccounts` | Multi-account Anthropic auth, safeStorage |
| `ollama.ts` | `ollama` | Ollama local model support, offline mode |
| `codex.ts` | `codex` | OpenAI Codex via `@zed-industries/codex-acp` |
| `terminal.ts` | `terminal` | PTY sessions, terminal I/O |
| `enterprise-auth.ts` | `enterpriseAuth` | Enterprise Entra ID auth (signIn/signOut/getStatus/refreshToken) |
| `litellm-models.ts` | `litellmModels` | Query LiteLLM proxy `/v1/models` with a virtual key (BYOK-LiteLLM wizard auto-populate; Group 8 of `add-dual-mode-llm-routing`) |
| `external.ts` | `external` | Clipboard, shell, OS utilities + remote backend bridges |
| `files.ts` | `files` | File read/write, directory listing |
| `debug.ts` | `debug` | Debug data export, DB inspection |
| `skills.ts` | `skills` | Skills system for AI assistants |
| `agents.ts` | `agents` | Agent management and configuration |
| `worktree-config.ts` | `worktreeConfig` | Git worktree configuration |
| `sandbox-import.ts` | `sandboxImport` | CodeSandbox project import (uses upstream `${apiUrl}/...`) |
| `commands.ts` | `commands` | Slash command registry and execution |
| `voice.ts` | `voice` | Voice features (uses upstream `${apiUrl}/...`) |
| `plugins.ts` | `plugins` | Plugin discovery (local-only — reads `~/.claude/plugins/`) |
| `feature-flags.ts` ⭐ | `featureFlags` | NEW 2026-04-08 — flag overrides, type-safe API |
| `../../git/index.ts` | `changes` | Git ops via `simple-git` (named `changes` to match Superset API) |

Helpers (not routers): `agent-utils.ts`, `index.ts` (composition root)

### Git Operations (`src/main/lib/git/`)

Full git integration via `simple-git`. Includes branches, staging, stash, status, diff parsing, file contents at refs, worktree management, GitHub API integration, file watcher, and security utilities. See `index.ts` for the tRPC router factory `createGitRouter()`.

### Other `src/main/lib/` Modules

- `claude/` — Claude SDK integration (`index.ts`, `transform.ts`, `types.ts`, `offline-handler.ts`, `raw-logger.ts`, `env.ts`)
- `terminal/` — PTY layer (`manager.ts`, `session.ts`, `port-manager.ts`, `port-scanner.ts`, `data-batcher.ts`, history)
- `ollama/` — Ollama detection (`detector.ts`, `network-detector.ts`, `index.ts`)
- `platform/` — OS-specific abstractions (`darwin.ts`, `linux.ts`, `windows.ts`)
- `plugins/` — Plugin loader
- `fs/` — Filesystem helpers (`dirent.ts`)

---

## 2. Renderer (`src/renderer/`) — 395 TS/TSX files

### Features (by file count)

| Feature | Files | Purpose |
|---------|-------|---------|
| `agents/` | 131 | Core chat interface — messages, input, tool rendering, slash commands |
| `changes/` | 48 | Git change tracking — diff views, staging, commits |
| `terminal/` | 17 | Integrated terminal — xterm.js + node-pty |
| `mentions/` | 16 | @-mention system for files, symbols |
| `details-sidebar/` | 15 | Detail panel for selected items |
| `automations/` | 14 | Automation rules and triggers |
| `file-viewer/` | 9 | File browser and viewer |
| `kanban/` | 6 | Kanban board for task management |
| `onboarding/` | 6 | First-run experience and setup |
| `sidebar/` | 5 | Chat list, navigation, project switching |
| `settings/` | 2 | App settings UI |
| `layout/` | 1 | Main layout with resizable panels |
| `hooks/` | 1 | Automation hook definitions |

### Agents Feature Deep Dive (`src/renderer/features/agents/`)

The largest feature (131 files):

| Subdirectory | Purpose |
|--------------|---------|
| `main/` | Core chat: `active-chat.tsx`, `messages-list.tsx`, `chat-input-area.tsx`, `new-chat-form.tsx`, `assistant-message-item.tsx` |
| `ui/` | Tool result renderers (bash, diff, archive popover, sub-chat selector), preview panels |
| `commands/` | Slash command UI and execution |
| `atoms/` | Jotai atoms for agent UI state |
| `stores/` | Zustand stores for persisted agent state |
| `hooks/` | Chat-specific React hooks (`use-agents-file-upload`, `use-desktop-notifications`) |
| `context/` | React context providers for chat state |
| `components/` | Shared agent UI components (`agent-send-button`) |
| `search/` | Chat search functionality |
| `mentions/` | @-mention within chat messages |
| `lib/` | Agent-specific utilities (`agents-actions.ts`, `drafts.ts`) |
| `utils/` | Helper functions (`format-time-ago`, `pluralize`) |

### UI Components (`src/renderer/components/ui/`)

Radix-based primitives: accordion, alert-dialog, badge, button, button-group, canvas-icons, checkbox, collapsible, command, context-menu, dialog, dropdown-menu, error-boundary, hover-card, icons, input, kbd, label, logo, network-status, popover, progress, project-icon, prompt-input, resizable-bottom-panel, resizable-sidebar, search-combobox, select, skeleton, split-button, switch, tabs, textarea, toggle-group, tooltip, virtual-list

### Global Lib (`src/renderer/lib/`)

| File/Dir | Purpose |
|----------|---------|
| `trpc.ts` | Local tRPC client (main process communication) |
| `remote-trpc.ts` | **Remote tRPC client (upstream `21st.dev` backend — retiring)** |
| `remote-app-router.ts` | Typed `AppRouter` stub for remote (TRPCBuiltRouter pattern) |
| `remote-types.ts` | Shared types for remote tRPC (breaks circular dep) |
| `remote-api.ts` | Remote API helpers |
| `api-fetch.ts` | Fetch wrapper for API calls |
| `analytics.ts` | PostHog analytics integration |
| `jotai-store.ts` | Global Jotai store instance |
| `mock-api.ts` | **Phase 2 complete (2026-04-09)** — 144 lines of F-entry stubs only. Zero production consumers. Phase 3 will delete entirely after F1-F10 restoration. |
| `message-parser.ts` | **NEW (Phase 2)** — typed helpers for sub-chat JSON parsing + tool part normalization (5 stages). Extracted from mock-api. |
| `window-storage.ts` | Window-scoped storage utilities |
| `vscode-themes.ts` | VS Code theme support |
| `editor-icons.ts` | File type icon mappings |
| `codesandbox-constants.ts` | CodeSandbox integration constants |
| `atoms/` | Global Jotai atoms |
| `stores/` | Global Zustand stores (`changes-store.ts`) |
| `hooks/` | Global hooks (code-theme, file-change-listener, update-checker, voice-recording, etc.) |
| `themes/` | Theme configuration |
| `hotkeys/` | Keyboard shortcut definitions |

---

## 3. Backend API Service (`services/1code-api/`)

Self-hosted replacement for the upstream `1code.dev` SaaS backend. Fastify + tRPC server with Drizzle/PostgreSQL. Also owns **LiteLLM provisioning** (user/team/key lifecycle absorbed from the Apollos portal) behind a `PROVISIONING_ENABLED` feature flag.

| File | Purpose |
|------|---------|
| `src/index.ts` | Server entry — Fastify lifecycle, rate-limit plugin, provisioning service DI, graceful shutdown |
| `src/config.ts` | Zod-validated env config with conditional `.superRefine()` for provisioning vars |
| `src/auth.ts` | Envoy Gateway header extraction + dev bypass mode |
| `src/db/schema.ts` | Drizzle schema — `users`, `provisionedKeys`, `userTeamMemberships`, `auditLog` (UUID PKs) |
| `src/db/connection.ts` | Connection pool, auto-migration, health check |
| `src/lib/teams-config.ts` | YAML loader, `getQualifyingTeams` (default suppression), `isUserAuthorized` |
| `src/lib/graph-client.ts` | MSAL confidential client + in-memory token cache + paginated `getUserGroups` |
| `src/lib/litellm-client.ts` | LiteLLM admin API client (8 methods) with 404-returns-null for `getUser`/`getTeam` |
| `src/lib/audit.ts` | Closed `AuditAction` literal union + `logAction` helper |
| `src/lib/scheduler.ts` | `node-cron` deprovisioning + rotation jobs with stop handle |
| `src/lib/slugify.ts` | Kebab-case slugifier for key aliases |
| `src/services/provisioning.ts` | Two-phase read-then-write provisioning state machine (Decision 8) |
| `src/services/key-service.ts` | Decision 9 five-state key status, list/create/rotate/revoke |
| `src/services/deprovisioning.ts` | Deprovisioning cron with mass-threshold abort guard |
| `src/services/rotation.ts` | Rotation cron with `rotatedFromId` linkage |
| `src/schemas/provision.ts` | Zod response schemas for `/api/provision*` |
| `src/schemas/keys.ts` | Zod request/response schemas for `/api/keys*` |
| `src/routes/health.ts` | `GET /health` — K8s probe (no auth) |
| `src/routes/changelog.ts` | `GET /api/changelog/desktop` — markdown file changelog feed |
| `src/routes/plan.ts` | `GET /api/desktop/user/plan` — enterprise plan resolution |
| `src/routes/profile.ts` | `PATCH /api/user/profile` — display name upsert |
| `src/routes/provision.ts` | `GET /api/provision/status` + `POST /api/provision` (rate-limited, flag-gated) |
| `src/routes/keys.ts` | `GET /api/keys` + `POST /api/keys/new` + rotate/revoke (ownership 404) |
| `config/teams.yaml.example` | Committed template for the runtime `teams.yaml` (gitignored) |
| `Dockerfile` | Multi-stage build (bun install → bun build → distroless) |
| `drizzle.config.ts` | Drizzle Kit config for PostgreSQL migrations |

**Container:** `ghcr.io/jrmatherly/1code-api` — built by `.github/workflows/container-build.yml` on `v*` tags, multi-arch (amd64+arm64), Cosign signed.

**Docs:** [`docs/enterprise/1code-api-provisioning.md`](../docs/enterprise/1code-api-provisioning.md) · [`docs/enterprise/apollos-decommission-runbook.md`](../docs/enterprise/apollos-decommission-runbook.md)

---

## 4. Build & Release (`scripts/`)

| Script | Purpose |
|--------|---------|
| `download-claude-binary.mjs` | Download Claude CLI binary (pinned `2.1.96`). **Verifies SHA-256 + GPG signature** against `manifest.json` (Phase 0 gate #7) |
| `download-codex-binary.mjs` | Download Codex binary (pinned `0.118.0`). Verifies SHA-256 against GitHub release `asset.digest` |
| `anthropic-release-pubkey.asc` | Vendored Anthropic GPG release-signing pubkey (fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`) |
| ~~`generate-update-manifest.mjs`~~ | *Deleted* — electron-builder auto-generates manifests with github provider |
| `generate-icon.mjs` | Generate app icons |
| `patch-electron-dev.mjs` | Patch Electron for dev mode quirks |

### Build Pipeline
```
bun run release =
  git tag -a v0.0.XX -m "v0.0.XX" && git push origin main v0.0.XX →
  .github/workflows/release.yml triggers →
  matrix-build (macos-15, ubuntu, windows) →
    bun install → claude:download → codex:download → build → package:{mac,linux,win} →
    upload-artifact →
  release job →
    download-artifact → softprops/action-gh-release → draft GitHub Release
```

---

## 5. Tests (`tests/regression/` + `services/1code-api/tests/`) — bun:test

Regression guards (no Jest/Vitest/Playwright). Run with `bun test` from the repo root to execute the full suite across the main app and the `1code-api` service.

- **30 test files in `tests/regression/`** (29 regression guards + 1 frontmatter shim unit test; **174 tests / 414 expect() / ~6s**): authoritative catalog at [`docs/conventions/regression-guards.md`](../docs/conventions/regression-guards.md). Recent additions 2026-04-13 (from archived `remediate-dev-server-findings`): `aux-ai-provider-dispatch`, `no-apollosai-aux-ai-fetch`, `signed-fetch-cache`, `raw-logger-concurrent-writes`, `no-legacy-oauth-byok-leak`, `login-flow-uses-msal`, `spawn-env-invariants`, `no-entra-in-anthropic-auth-token`, `no-legacy-litellm-proxy-url`, `no-migrate-legacy`.
- **20 service test files** under `services/1code-api/tests/` covering unit tests (`tests/lib/`, `tests/services/`, `tests/routes/`) and 3 docker-compose integration tests (`tests/integration/`) that skip without the harness.
- **Combined total: 207 tests across 37 files** (197 pass + 10 skipped integration, 0 fail) as of 2026-04-12 post-`replace-gray-matter-with-front-matter` archive.

**Quality gates (run all 6 before PR — none is a superset):**
1. `bun run ts:check` — tsgo TypeScript check (baseline 0)
2. `bun run lint` — ESLint + eslint-plugin-sonarjs
3. `bun run build` — electron-vite 5 packaging validation
4. `bun test` — 29 regression guards + 1 unit test (174 tests / 414 expect()) + 20 1code-api test files (242 tests, 232 pass + 10 skipped integration) = ~416 tests across ~71 files
5. `bun audit` — dependency advisories
6. `cd docs && bun run build` — xyd-js documentation site

CI enforces the same 6 in `.github/workflows/ci.yml`.

---

## 6. Configuration Files

| File | Purpose |
|------|---------|
| `electron.vite.config.ts` | Vite config for main/preload/renderer (Vite **must stay 6.x**) |
| `electron-builder.yml` | Electron Builder packaging config |
| `electron-shim.js` | Electron dev mode shim |
| `drizzle.config.ts` | Drizzle Kit config for migrations |
| `tsconfig.json` | TypeScript configuration |
| `tailwind.config.js` | Tailwind v3 (**must stay 3.x** — `cn()` used in 134+ files) |
| `postcss.config.js` | PostCSS configuration |
| `.env.example` | Environment variable template |
| `.github/workflows/ci.yml` | CI: ts:check + build + test + audit on PR to `main` |

---

## 7. OpenSpec System (`openspec/`)

Spec-driven change proposal workflow (OpenSpec 1.2.0).

| Path | Purpose |
|------|---------|
| `project.md` | Project-level spec context |
| `config.yaml` | OpenSpec configuration |
| `changes/add-feature-flag-infrastructure/` | Active proposal: Phase 0 gate #12 (24 tasks across 6 phases) |
| `archive/2026-04-09-migrate-mock-api-consumers/` | Phase 2 mock-api consumer migration — 6 files, 13 useUtils sites, message-parser.ts extraction (archived) |

Each change directory contains `proposal.md`, `tasks.md`, `README.md`, and `specs/<capability>/spec.md`.

---

## 8. Claude Code Configuration (`.claude/`)

| Path | Purpose |
|------|---------|
| `PROJECT_INDEX.md` | This file — repo navigation map |
| `settings.json` / `settings.local.json` | Hooks, permissions, MCP config |
| `commands/opsx/` | OpenSpec slash commands (apply, archive, explore, propose) |
| `skills/openspec-{apply-change,archive-change,explore,propose,propose-gate}/` | OpenSpec workflow skills (4 generated + 1 custom gate skill) |
| `skills/docs-drift-check/` | Documentation drift detector |
| `skills/upstream-boundary-check/` | Guards `remoteTrpc.*` and `${apiUrl}/...` call sites |
| `skills/new-router/` | Scaffold new tRPC router |
| `skills/release/` | Release pipeline helper |
| `agents/security-reviewer.md` | Security-focused subagent |
| `agents/ui-reviewer.md` | UI-focused subagent |
| `agents/upstream-dependency-auditor.md` | Investigates F1–F12 upstream dependencies |

---

## 9. Working Directories (gitignored)

- `.scratchpad/` — Ephemeral local-only working notes (gitignored). Canonical docs live in `docs/`
- `.full-review/` — Output from `comprehensive-review:full-review` plugin
- `.serena/memories/` — Serena project memories (read via `mcp__serena__read_memory`)
- `.remember/` — Session continuity buffer
- `.code-review-graph/` — Knowledge graph cache

---

## 10. Key Patterns & Conventions

### IPC Flow
```
Renderer → tRPC client (trpc.ts) → trpc-electron IPC → Main process router → Response
```

### Upstream Backend Boundary
- `remoteTrpc.*` (`src/renderer/lib/remote-trpc.ts`) → upstream typed tRPC client (will break on retirement)
- Raw `fetch(\`${apiUrl}/...\`)`→ secondary upstream channel (`voice.ts`,`sandbox-import.ts`,`claude-code.ts` OAuth, `agents-help-popover.tsx`)
- Inventory: `grep -rn "remoteTrpc\." src/renderer/`

### State Layer Rules
- **Jotai** — Ephemeral UI state (selected items, open/close, previews)
- **Zustand** — Persisted client state (tab positions, pins → localStorage)
- **React Query (tRPC)** — Server state (DB data, AI responses → auto-cache)

### New Feature Checklist
1. Create tRPC router in `src/main/lib/trpc/routers/`
2. Register in `routers/index.ts` → `AppRouter` type auto-updates
3. Create feature directory in `src/renderer/features/`
4. Use Jotai atoms for UI state, tRPC queries for data
5. Use Radix UI + `cn()` + CVA for components
6. Run all 6 quality gates: `bun run ts:check && bun run lint && bun run build && bun test && bun audit && cd docs && bun run build`

### File Naming
- Components: PascalCase (`ActiveChat.tsx`)
- Hooks/utilities: camelCase (`useFileUpload.ts`)
- Stores: kebab-case (`sub-chat-store.ts`)
- Atoms: camelCase + `Atom` suffix (`selectedAgentChatIdAtom`)

---

## 11. Tech Stack

| Layer | Tech | Pin |
|-------|------|-----|
| Desktop | Electron | ~40.8 (EOL 2026-06-30 — upgrade to 41 tracked in OpenSpec) |
| Build | electron-vite 5.0.0, electron-builder | Vite 7 safe; Vite 8 needs electron-vite 6.0.0 (beta) |
| UI | React 19, TypeScript 5, Tailwind | Tailwind **must stay 3.x** |
| Components | Radix UI, Lucide, Motion, Sonner | — |
| State | Jotai, Zustand, React Query | — |
| Backend | tRPC v11, Drizzle ORM, better-sqlite3 | — |
| Code highlighting | shiki | **must stay 3.x** (`@pierre/diffs` constraint) |
| AI SDK | `@anthropic-ai/claude-agent-sdk` | `0.2.45` |
| Codex bridge | `@zed-industries/codex-acp` | `0.9.3` |
| Claude CLI | binary download | pinned `2.1.96` |
| Codex CLI | binary download | pinned `0.118.0` |
| TS checker | `tsgo` (Go-based, much faster than `tsc`) | `@typescript/native-preview` |
| Package manager | bun | — |
| Test framework | bun:test | — |

---

## 12. Phase 0 Hard Gate Status (Self-Hosting Migration)

**Canonical status:** [`docs/enterprise/phase-0-gates.md`](../docs/enterprise/phase-0-gates.md). Summary (all gates complete as of 2026-04-09):

| # | Gate | Status |
|---|------|--------|
| 1–4 | Delete dead `auth:get-token` IPC handler + preload bridge + types | ✅ Done |
| 5–6 | Remove 5 token preview logs from `claude.ts` and `claude/env.ts` | ✅ Done |
| 7 | Binary checksum + GPG verification | ✅ Done (Claude SHA+GPG, Codex SHA-only) |
| 8 | Upstream sandbox OAuth extraction | ✅ Done (archived `remove-upstream-sandbox-oauth`) |
| 9 | Minimum CI workflow | ✅ Done (`.github/workflows/ci.yml`) |
| 10 | Dependabot config | ✅ Done |
| 11 | Test framework + regression guards | ✅ Done (bun:test, 29 guards + 1 unit test; combined repo total 174 regression + 242 service = ~416 tests / 406 pass post-remediate-dev-server-findings archive 2026-04-13) |
| 12 | Feature flag infrastructure + Drizzle schema | ✅ Done |
| 13 | OpenSpec 1.2.0 migration | ✅ Done |
| 14 | Electron upgrade (39 → 40 → 41) | ✅ Done (archived `upgrade-electron-40` + `2026-04-11-upgrade-electron-41`, currently on Electron 41.2.0) |
| 15 | F1–F12 upstream restoration decisions | ✅ Done (F11 + F12 resolved 2026-04-13 via aux-ai.ts; 3/4 modes full, subscription-direct qualified with Ollama/heuristic fallbacks) |

---

## 13. Documentation Sync Targets

**Canonical source-of-truth:** `docs/` (xyd-js site, tabs: Architecture, Enterprise, Conventions, Operations, API Reference). Enforced by `openspec/specs/documentation-site/spec.md`.

These files are **mirrors or pointers** to the canonical `docs/` pages — they must stay consistent but MUST NOT duplicate full content:

- `CLAUDE.md` — concise identity + critical rules + pointers (124 lines post-2026-04-09 restructure)
- `README.md` — user-facing
- `CONTRIBUTING.md` — contributor setup
- `AGENTS.md` — AI agent quick reference
- `.serena/memories/*.md` — Serena memories (6 files)
- `.claude/PROJECT_INDEX.md` — this file
- `.claude/rules/*.md` — Claude Code behavioral rules (9 rules + README)
- `openspec/project.md` — spec context
- `openspec/config.yaml` — injected context + rules

Common drift points are catalogued in `.claude/skills/docs-drift-check/SKILL.md`. Run `/docs-drift-check` after:
- Schema changes (`src/main/lib/db/schema/`)
- tRPC router add/remove
- Version pin bumps (Vite, Tailwind, Shiki, Electron, Claude, Codex, xyd-js)
- Substantive edits to any documentation surface above
