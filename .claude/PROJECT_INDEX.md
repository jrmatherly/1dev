# 1Code Project Index

> Auto-generated project knowledge base for AI-assisted development.
> Last indexed: 2026-04-08 | Version: 0.0.72 | Files: 504 TS/TSX in `src/`

**Fork posture:** Enterprise fork of upstream 1Code. Decoupling from `1code.dev` SaaS in favor of self-hosted infrastructure (LiteLLM + Microsoft Entra via Envoy Gateway). All upstream-dependent features (F1–F10) catalogued in `.scratchpad/upstream-features-inventory.md`.

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
| Auth strategy (chosen) | `.scratchpad/auth-strategy-envoy-gateway.md` v2.1 |
| Upstream dependency catalog | `.scratchpad/upstream-features-inventory.md` v2 |

---

## 1. Main Process (`src/main/`) — 102 TS files

### Core Files

| File | Purpose |
|------|---------|
| `index.ts` | App entry — window lifecycle, protocol handlers, auto-update |
| `auth-manager.ts` | OAuth flow, token refresh, credential management |
| `auth-store.ts` | Encrypted credential storage via Electron `safeStorage` |
| `auto-updater.ts` | electron-updater config (CDN_BASE on line 33 = upstream CDN) |
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

### tRPC Routers (`src/main/lib/trpc/routers/`) — 21 routers in `createAppRouter`

20 feature routers imported from `routers/` + 1 git router from `../../git` mounted as `changes`. The file `agent-utils.ts` in `routers/` is a **helper module, not a router**.

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
| `mock-api.ts` | **DEPRECATED — still imported by 6 files in `features/agents/`. Migrate before deletion.** Retirement tracked in `openspec/changes/retire-mock-api-translator/` |
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

## 3. Build & Release (`scripts/`)

| Script | Purpose |
|--------|---------|
| `download-claude-binary.mjs` | Download Claude CLI binary (pinned `2.1.96`). **Verifies SHA-256 + GPG signature** against `manifest.json` (Phase 0 gate #7) |
| `download-codex-binary.mjs` | Download Codex binary (pinned `0.118.0`). Verifies SHA-256 against GitHub release `asset.digest` |
| `anthropic-release-pubkey.asc` | Vendored Anthropic GPG release-signing pubkey (fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`) |
| `generate-update-manifest.mjs` | Generate `latest-mac.yml` / `latest-mac-x64.yml` |
| `generate-icon.mjs` | Generate app icons |
| `patch-electron-dev.mjs` | Patch Electron for dev mode quirks |

### Build Pipeline
```
bun run release =
  rm -rf release →
  bun i →
  claude:download (SHA + GPG verified) →
  codex:download (SHA verified) →
  build (electron-vite) →
  package:mac (electron-builder + notarize) →
  dist:manifest →
  upload to R2 CDN
```

---

## 4. Tests (`tests/regression/`) — bun:test

Phase 0 regression guards (no Jest/Vitest/Playwright). Run with `bun test`.

| Test | Guards Against |
|------|----------------|
| `auth-get-token-deleted.test.ts` | Re-introducing the dead `auth:get-token` IPC handler (gates #1–4) |
| `token-leak-logs-removed.test.ts` | Re-introducing token preview log strings in `src/main/` (gates #5–6) |
| `credential-manager-deleted.test.ts` | Re-creating `credential-manager.ts` orphan |
| `gpg-verification-present.test.ts` | Removing GPG signature verification from Claude binary downloader (gate #7) |
| `feature-flags-shape.test.ts` | Renaming feature flag keys without migration |

**Quality gates (run all 4 before PR — none is a superset):**
1. `bun run ts:check` — tsgo TypeScript check
2. `bun run build` — esbuild packaging validation
3. `bun test` — regression guards
4. `bun audit` — dependency advisories

CI enforces the same 4 in `.github/workflows/ci.yml`.

---

## 5. Configuration Files

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

## 6. OpenSpec System (`openspec/`)

Spec-driven change proposal workflow (OpenSpec 1.2.0).

| Path | Purpose |
|------|---------|
| `project.md` | Project-level spec context |
| `config.yaml` | OpenSpec configuration |
| `changes/add-feature-flag-infrastructure/` | Active proposal: Phase 0 gate #12 (24 tasks across 6 phases) |
| `changes/retire-mock-api-translator/` | Active proposal: Retire 657-line untyped `mock-api.ts` facade |

Each change directory contains `proposal.md`, `tasks.md`, `README.md`, and `specs/<capability>/spec.md`.

---

## 7. Claude Code Configuration (`.claude/`)

| Path | Purpose |
|------|---------|
| `PROJECT_INDEX.md` | This file — repo navigation map |
| `settings.json` / `settings.local.json` | Hooks, permissions, MCP config |
| `commands/opsx/` | OpenSpec slash commands (apply, archive, explore, propose) |
| `skills/openspec-{apply,archive,explore,propose}-change/` | OpenSpec workflow skills |
| `skills/docs-drift-check/` | Documentation drift detector |
| `skills/upstream-boundary-check/` | Guards `remoteTrpc.*` and `${apiUrl}/...` call sites |
| `skills/new-router/` | Scaffold new tRPC router |
| `skills/release/` | Release pipeline helper |
| `agents/security-reviewer.md` | Security-focused subagent |
| `agents/ui-reviewer.md` | UI-focused subagent |
| `agents/upstream-dependency-auditor.md` | Investigates F1–F10 upstream dependencies |

---

## 8. Working Directories (gitignored)

- `.scratchpad/` — Strategy/research docs (auth strategies, upstream inventory, smoke tests)
- `.full-review/` — Output from `comprehensive-review:full-review` plugin
- `.serena/memories/` — Serena project memories (read via `mcp__serena__read_memory`)
- `.remember/` — Session continuity buffer
- `.code-review-graph/` — Knowledge graph cache

---

## 9. Key Patterns & Conventions

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
6. Run all 4 quality gates: `bun run ts:check && bun run build && bun test && bun audit`

### File Naming
- Components: PascalCase (`ActiveChat.tsx`)
- Hooks/utilities: camelCase (`useFileUpload.ts`)
- Stores: kebab-case (`sub-chat-store.ts`)
- Atoms: camelCase + `Atom` suffix (`selectedAgentChatIdAtom`)

---

## 10. Tech Stack

| Layer | Tech | Pin |
|-------|------|-----|
| Desktop | Electron | ~39 (EOL 2026-05-05 — plan upgrade) |
| Build | electron-vite 3, electron-builder | Vite **must stay 6.x** |
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

## 11. Phase 0 Hard Gate Status (Self-Hosting Migration)

| # | Gate | Status |
|---|------|--------|
| 1–4 | Delete dead `auth:get-token` IPC handler + preload bridge + types | ✅ Done |
| 5–6 | Remove 5 token preview logs from `claude.ts` and `claude/env.ts` | ✅ Done |
| 7 | Binary checksum + GPG verification | ✅ Done (Claude SHA+GPG, Codex SHA-only — upstream ceiling) |
| 8 | Upstream sandbox OAuth extraction | ⏳ Pending |
| 9 | Minimum CI workflow | ✅ Done (`.github/workflows/ci.yml`) |
| 10 | Dependabot config | ✅ Done (secret scanning UI enable still needed) |
| 11 | Test framework + regression guards | ✅ Done (bun:test, 5 guards) |
| 12 | Feature flag infrastructure + Drizzle schema | ✅ Done (router, lib module, migration `0008`, OpenSpec proposal) |
| 13 | OpenSpec conversion | ⏳ In progress (2 active proposals) |
| 14 | Electron 39.8.6 → 39.8.7 patch | ✅ Done |
| 15 | F1–F10 upstream restoration decisions | ✅ Done (all 10 catalogued in inventory v2) |

---

## 12. Documentation Sync Targets

These files contain overlapping project info — keep in sync (per CLAUDE.md):

- `CLAUDE.md` — authoritative architecture/commands/patterns
- `README.md` — user-facing
- `CONTRIBUTING.md` — contributor setup
- `AGENTS.md` — AI agent quick reference
- `openspec/project.md` — spec context
- `.serena/memories/*.md` — Serena memories
- `.claude/PROJECT_INDEX.md` — this file

Common drift points: SDK versions, Electron/Vite/Tailwind/Shiki pins, Claude/Codex binary pins, tRPC router count, DB schema columns, renderer feature directory list.
