
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

**1Code** (by apollosai.dev) - A local-first Electron desktop app for parallel AI-assisted development. Users create chat sessions linked to local project folders, interact with multiple AI backends (Claude, Codex, Ollama) in Plan or Agent mode, and see real-time tool execution (bash, file edits, web search, terminal, etc.).

**Fork posture:** This repo is the **enterprise fork** of upstream 1Code. It is being decoupled from the `1code.dev` hosted backend in favor of self-hosted infrastructure (LiteLLM, Microsoft Entra ID via Envoy Gateway). See `docs/enterprise/upstream-features.md` for the catalog of upstream-dependent features (F1-F10) and restoration priorities.

**Restoration theme (locked 2026-04-08):** Anything the upstream SaaS was providing will be **reverse-engineered, re-created, and self-hosted** — the fork controls every runtime endpoint the shipped app talks to. "Drop the feature" and "use someone else's hosted service" are both off the table. Two F-entries turned out not to need restoration after code investigation by the `upstream-dependency-auditor` agent: **F7 (Plugin Marketplace)** is local-only (reads Claude Code's `~/.claude/plugins/` directly, never talked to upstream), and **F9 (Live Browser Previews)** is dead UI on desktop (gated on `sandbox_id` which `mock-api.ts:46` hard-codes to `null`). F9 will be rebuilt as a Phase 2 greenfield feature using the existing `src/main/lib/terminal/port-manager.ts` substrate. All other F-entries (F1-F6, F8, F10) have self-hosted or local-subprocess restore decisions recorded in the inventory — Phase 0 hard gate #15 complete.

**Chosen enterprise auth strategy (2026-04-08):** `docs/enterprise/auth-strategy.md` **v2.1** (Envoy Gateway dual-auth, **empirically validated** via live smoke test against the Talos AI cluster — see `.full-review/envoy-gateway-review/05-final-report.md`). Fallback: `docs/enterprise/auth-fallback.md` v5 (MSAL-in-Electron).

**Phase 0 progress (2026-04-09): 15 of 15 hard gates complete ✅**
- ✅ **#1-6** — dead `auth:get-token` IPC handler deletion + token log sanitization
- ✅ **#7** — Claude binary SHA-256 + GPG signature verification, Codex SHA-256 verification
- ✅ **#8** — upstream sandbox OAuth removed (see `openspec/changes/archive/2026-04-09-remove-upstream-sandbox-oauth/`)
- ✅ **#9** — minimum CI workflow (`.github/workflows/ci.yml`)
- ✅ **#10** — Dependabot config (secret scanning UI enable still pending)
- ✅ **#11** — bun:test framework + regression guards (`tests/regression/`)
- ✅ **#12** — feature flag infrastructure (Drizzle schema + tRPC router + lib module)
- ✅ **#13** — OpenSpec 1.2.0 migration
- ✅ **#14** — Electron 39.8.6 → 39.8.7 patch
- ✅ **#15** — F1-F10 restoration decisions (see `docs/enterprise/upstream-features.md` v2)

Phase 1 enterprise auth (Entra SSO via MSAL + LiteLLM gateway) is deferred to a future OpenSpec proposal with its own security and architecture requirements, including a dedicated credential-storage discussion.

## Commands

```bash
# Development
bun run dev              # Start Electron with hot reload

# Build
bun run build            # Compile app
bun run package          # Package for current platform (dir)
bun run package:mac      # Build macOS (DMG + ZIP)
bun run package:win      # Build Windows (NSIS + portable)
bun run package:linux    # Build Linux (AppImage + DEB)

# Database (Drizzle + SQLite)
bun run db:generate      # Generate migrations from schema
bun run db:push          # Push schema directly (dev only)
bun run db:studio        # Open Drizzle Studio GUI

# Type Checking
bun run ts:check         # TypeScript check via tsgo (requires: npm install -g @typescript/native-preview)

# Tests
bun test                 # bun:test regression guards (under tests/regression/)

# AI Binary Management
bun run claude:download  # Download Claude CLI binary for current platform
bun run codex:download   # Download Codex binary for current platform

# Dependency Audit
bun audit                # Check for known vulnerabilities
bun outdated             # List outdated packages
```

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry, window lifecycle
│   ├── auth-manager.ts      # OAuth flow, token refresh
│   ├── auth-store.ts        # Encrypted credential storage (delegates to credential-store.ts)
│   ├── windows/main.ts      # Window creation, IPC handlers
│   └── lib/
│       ├── credential-store.ts  # Unified 3-tier credential encryption (Tier 1: OS keystore, Tier 2: basic_text warn, Tier 3: refuse)
│       ├── db/              # Drizzle + SQLite
│       │   ├── index.ts     # DB init, auto-migrate on startup
│       │   ├── schema/      # Drizzle table definitions
│       │   └── utils.ts     # ID generation
│       └── trpc/routers/    # tRPC routers (20 feature routers in routers/,
│           │                 # mounted in index.ts alongside the git router
│           │                 # from ../../git for a total of 21 in createAppRouter)
│           ├── index.ts             # createAppRouter composition root
│           ├── claude.ts            # Claude SDK streaming
│           ├── claude-code.ts       # Claude Code binary management
│           ├── claude-settings.ts   # Claude-specific user settings
│           ├── anthropic-accounts.ts# Multi-account Anthropic OAuth
│           ├── codex.ts             # Codex integration
│           ├── ollama.ts            # Ollama local model support
│           ├── projects.ts          # Project CRUD
│           ├── chats.ts             # Chat CRUD
│           ├── agents.ts            # Agent management
│           ├── terminal.ts          # Terminal/PTY sessions
│           ├── files.ts             # File operations
│           ├── external.ts          # External / remote backend bridges
│           ├── plugins.ts           # Plugin system
│           ├── skills.ts            # Skills system
│           ├── commands.ts          # Slash command registry
│           ├── voice.ts             # Voice features
│           ├── worktree-config.ts   # Worktree configuration
│           ├── sandbox-import.ts    # Sandbox import flow
│           ├── feature-flags.ts     # Feature flag override CRUD (Phase 0 gate #12)
│           ├── debug.ts             # Debug utilities
│           └── agent-utils.ts       # Shared helpers (not a router)
│           └── agent-utils.ts       # Shared helpers (not a router)
│
├── preload/                 # IPC bridge (context isolation)
│   └── index.ts             # Exposes desktopApi + tRPC bridge
│
└── renderer/                # React 19 UI
    ├── App.tsx              # Root with providers
    ├── features/
    │   ├── agents/          # Main chat interface (core feature)
    │   │   ├── main/        # active-chat.tsx, messages, input
    │   │   ├── ui/          # Tool renderers, preview, diff view
    │   │   ├── components/  # Shared agent-scoped components
    │   │   ├── commands/    # Slash commands
    │   │   ├── atoms/       # Jotai atoms for agent state
    │   │   ├── stores/      # Zustand stores
    │   │   ├── hooks/       # Chat-specific hooks
    │   │   ├── context/     # React context providers
    │   │   ├── lib/         # Agent-scoped utilities
    │   │   ├── utils/       # Pure helper functions
    │   │   ├── search/      # Chat search
    │   │   ├── mentions/    # @-mention system
    │   │   └── constants.ts # Agent constants
    │   ├── sidebar/         # Chat list, navigation
    │   ├── terminal/        # Integrated terminal (node-pty)
    │   ├── kanban/          # Kanban board view
    │   ├── file-viewer/     # File browser/viewer
    │   ├── hooks/           # Automation hooks
    │   ├── automations/     # Automation system
    │   ├── settings/        # App settings UI
    │   ├── onboarding/      # First-run experience
    │   ├── changes/         # Change tracking
    │   ├── details-sidebar/ # Detail panel
    │   ├── mentions/        # Global @-mention
    │   └── layout/          # Main layout with resizable panels
    ├── components/ui/       # Radix UI wrappers (button, dialog, etc.)
    └── lib/
        ├── atoms/           # Global Jotai atoms
        ├── stores/          # Global Zustand stores
        ├── trpc.ts          # Local tRPC client (main process)
        ├── remote-trpc.ts   # Remote tRPC client
        ├── remote-api.ts    # Remote API helpers
        ├── analytics.ts     # Analytics tracking
        └── mock-api.ts      # DEPRECATED — still imported by 6 agents/ files; migrate callers before removal
```

## Database (Drizzle ORM)

**Location:** `{userData}/data/agents.db` (SQLite)

**Schema:** `src/main/lib/db/schema/index.ts` (7 tables — source of truth)

```typescript
// Core tables:
projects    → id, name, path, timestamps,
              gitRemoteUrl, gitProvider, gitOwner, gitRepo,   // git metadata
              iconPath                                          // custom icon
chats       → id, name, projectId, timestamps, archivedAt,
              worktreePath, branch, baseBranch,                // worktree isolation
              prUrl, prNumber                                   // PR tracking
              // + index on worktreePath
sub_chats   → id, name, chatId, sessionId, streamId,
              mode (plan|agent), messages (JSON), timestamps
              // sessionId enables Claude SDK session resume
              // streamId tracks in-progress streams

// Auth/settings tables:
claude_code_credentials → encrypted OAuth token (safeStorage); DEPRECATED — use anthropic_accounts
anthropic_accounts      → multi-account: email, displayName, oauthToken, lastUsedAt
anthropic_settings      → singleton row tracking activeAccountId

// Feature flag infrastructure (Phase 0 hard gate #12, added 2026-04-08):
feature_flag_overrides  → key (PK), value (JSON-encoded text), updatedAt
                          // backs src/main/lib/feature-flags.ts
                          // spec: openspec/specs/feature-flags/spec.md
```

See the schema file for exact column types and defaults.

**Auto-migration:** On app start, `initDatabase()` runs migrations from `drizzle/` folder (dev) or `resources/migrations` (packaged).

**Queries:**
```typescript
import { getDatabase, projects, chats } from "../lib/db"
import { eq } from "drizzle-orm"

const db = getDatabase()
const allProjects = db.select().from(projects).all()
const projectChats = db.select().from(chats).where(eq(chats.projectId, id)).all()
```

## Key Patterns

### IPC Communication
- Uses **tRPC** with `trpc-electron` for type-safe main↔renderer communication
- All backend calls go through tRPC routers, not raw IPC
- Preload exposes `window.desktopApi` for native features (window controls, clipboard, notifications)

### Upstream Backend Boundary
- **`remoteTrpc.*`** (`src/renderer/lib/remote-trpc.ts`) is the typed tRPC client for the upstream `21st.dev` / `1code.dev` backend. Any `remoteTrpc.foo.bar` call site will break when upstream is retired — grep for it before claiming a feature is local.
- **`sandbox_id` vocabulary**: `sandbox_id` in `agents-content.tsx`, `agent-preview.tsx`, `mock-api.ts`, and `agents-sidebar.tsx` refers to the E2B browser sandbox for the live preview feature (F9 — dead UI, Phase 2 work). The former Claude Code OAuth flow that also used `sandbox_id` was removed in Phase 0 gate #8.
- **`storeOAuthToken` in `claude-code.ts` writes to 3 tables**: inserts `anthropicAccounts` (safeStorage-encrypted token), upserts `anthropicSettings.singleton.activeAccountId`, and mirrors to legacy `claudeCodeCredentials`. All three must succeed for the multi-account system to work correctly.
- Type contract lives in `src/renderer/lib/remote-app-router.ts` (TRPCBuiltRouter stub)
- Default base URL is `https://apollosai.dev`, overridable via `desktopApi.getApiBaseUrl()` (reads from main-process env)
- Raw `fetch(\`${apiUrl}/...\`)` is the secondary upstream channel — used in `voice.ts`,`sandbox-import.ts`,`claude-code.ts` OAuth flow, `agents-help-popover.tsx` changelog
- Refresh the inventory of upstream call sites with: `grep -rn "remoteTrpc\." src/renderer/`

### State Management
- **Jotai**: UI state (selected chat, sidebar open, preview settings)
- **Zustand**: Sub-chat tabs and pinned state (persisted to localStorage)
- **React Query**: Server state via tRPC (auto-caching, refetch)

### AI Backend Integration
- **Claude**: Dynamic import of `@anthropic-ai/claude-agent-sdk`, plan/agent modes, session resume via `sessionId`, streaming via tRPC subscription (`claude.onMessage`)
- **Codex**: OpenAI Codex CLI binary, managed via `codex.ts` router
- **Ollama**: Local model support via `ollama.ts` router
- All backends: two modes — "plan" (read-only) and "agent" (full permissions)

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron ~39, electron-vite 3, electron-builder |
| UI | React 19, TypeScript 5, Tailwind CSS 3 |
| Components | Radix UI, Lucide icons, Motion, Sonner |
| State | Jotai, Zustand, React Query |
| Backend | tRPC, Drizzle ORM, better-sqlite3 |
| AI | @anthropic-ai/claude-agent-sdk, Codex CLI, Ollama |
| Package Manager | bun |

## File Naming

- Components: PascalCase (`ActiveChat.tsx`, `AgentsSidebar.tsx`)
- Utilities/hooks: camelCase (`useFileUpload.ts`, `formatters.ts`)
- Stores: kebab-case (`sub-chat-store.ts`, `agent-chat-store.ts`)
- Atoms: camelCase with `Atom` suffix (`selectedAgentChatIdAtom`)

## Important Files

- `electron.vite.config.ts` - Build config (main/preload/renderer entries)
- `src/main/lib/db/schema/index.ts` - Drizzle schema (source of truth)
- `src/main/lib/db/index.ts` - DB initialization + auto-migrate
- `src/renderer/features/agents/atoms/index.ts` - Agent UI state atoms
- `src/renderer/features/agents/main/active-chat.tsx` - Main chat component
- `src/main/lib/trpc/routers/claude.ts` - Claude SDK integration
- `src/renderer/lib/remote-types.ts` - Shared types for remote tRPC (breaks circular dep with app-router stub)
- `src/renderer/lib/remote-app-router.ts` - Typed AppRouter stub for remote upstream backend (TRPCBuiltRouter pattern)
- `src/main/lib/trpc/schemas/mcp-url.ts` - SSRF-safe URL validation schema for MCP server URLs
- `src/main/lib/auto-updater.ts` - `electron-updater` config; `CDN_BASE` constant on line 33 is the upstream CDN — flip this for self-hosted update channel
- `src/main/lib/credential-store.ts` - Unified 3-tier credential encryption module (all encrypt/decrypt goes through here)
- `docs/enterprise/upstream-features.md` - Catalog of upstream-backend dependencies (F1-F10) with priority ratings and restore strategies

## Working Directories & Conventions

- `.scratchpad/` — Ephemeral local-only working notes (gitignored). **Never cite specific `.scratchpad/` files from tracked files** — enforced by `tests/regression/no-scratchpad-references.test.ts`. Canonical docs live in `docs/`. See `docs/conventions/no-scratchpad-references.md` for the rule and allowlist.
- **`docs/`** — Canonical documentation site (xyd-js). 25 pages across 5 tabs (Architecture, Enterprise, Conventions, Operations, API Reference). Build: `cd docs && bun install --frozen-lockfile && bun run build`. Dev server: `cd docs && bunx xyd` (port 5175). `@xyd-js/cli` pinned to `0.0.0-build-1202121-20260121231224`. CI runs `docs-build` as a 6th parallel job. The `documentation-site` capability spec at `openspec/specs/documentation-site/spec.md` codifies the rules.
- `.full-review/` — Output from `comprehensive-review:full-review` plugin (gitignored)
- `.serena/memories/` — Serena project memories: `codebase_structure`, `environment_and_gotchas`, `project_overview`, `style_and_conventions`, `suggested_commands`, `task_completion_checklist`. Read via `mcp__serena__read_memory` *after* activating the project with `mcp__serena__activate_project`.
- **`.github/workflows/ci.yml`** — CI runs 5 quality gates in parallel on every PR to `main`: `ts:check`, `build`, `test`, `audit`, and `docs-build` (xyd build against `docs/`). A 6th `status` job aggregates them for branch protection. Added 2026-04-08 (Phase 0 hard gate #9), extended 2026-04-09 with `docs-build`.
- **`tests/regression/`** — bun:test regression guards (10 guards, 36 tests: `auth-get-token-deleted`, `token-leak-logs-removed`, `credential-manager-deleted`, `gpg-verification-present`, `feature-flags-shape`, `brand-sweep-complete`, `no-upstream-sandbox-oauth`, `no-scratchpad-references`, `mock-api-no-snake-timestamps`, `credential-storage-tier`). Run with `bun test`. The `brand-sweep-complete` guard enforces the Tier A/B/C brand taxonomy from the `brand-identity` capability spec (`openspec/specs/brand-identity/spec.md`).
- **Deployment target cluster repo:** `/Users/jason/dev/ai-k8s/talos-ai-cluster/` (Talos K8s, Envoy Gateway, LiteLLM, OIDC stack — coordinate cross-repo when working on auth/backend)
- **Cluster access:** `cd /Users/jason/dev/ai-k8s/talos-ai-cluster && KUBECONFIG=./kubeconfig kubectl ...` (mise/direnv loads KUBECONFIG on cd; `~/.kube/config` is a separate unrelated config). The cluster is **Flux/GitOps managed** — never use direct `kubectl apply` for cluster resources; all changes go through `templates/config/**/*.j2` Jinja2 templates + `cluster.yaml` plaintext variables + SOPS encryption + git commit + Flux reconcile. Direct applies are reconciled away within 60s.
- **Cluster facts (discovered 2026-04-08):** Envoy Gateway `v1.7.1` (image: `mirror.gcr.io/envoyproxy/gateway:v1.7.1`); Entra tenant ID `f505346f-75cf-458b-baeb-10708d41967d`; test echo server at `https://echo.aarons.com/` (`default/echo` HTTPRoute, runs `mendhak/http-https-echo:39`, returns `.headers.authorization` lowercase); existing working OIDC SecurityPolicy reference pattern at `kube-system/hubble-ui-oidc` (single-auth OIDC; dual-auth is NEW as of the 2026-04-08 smoke test).

## Known Security Gaps & Footguns

- **HARD RULE for any auth code touching Claude/Codex spawn env vars:** Read `docs/enterprise/auth-strategy.md` §4.9 and §5.4 FIRST. Env-var injection of bearer tokens (`ANTHROPIC_AUTH_TOKEN=<bearer>`) is explicitly forbidden — co-resident processes can read `/proc/<pid>/environ` (Linux), `ps eww` (macOS), `NtQueryInformationProcess` (Windows). The mandated pattern is `applyEnterpriseAuth()` writing a 0600 tmpfile and passing `ANTHROPIC_AUTH_TOKEN_FILE=/path`. Verify `ANTHROPIC_AUTH_TOKEN_FILE` support against the pinned Claude CLI version (currently 2.1.96) before designing against it. §3.1 cluster lock-down (CiliumNetworkPolicy + HTTPRoute header strip) is a blocking prerequisite for any code that sends live traffic to LiteLLM via Envoy Gateway.
- ~~`scripts/download-claude-binary.mjs` and `scripts/download-codex-binary.mjs` do NOT verify checksums/signatures~~ — **RESOLVED 2026-04-08** (Phase 0 gate #7). The earlier footgun text was factually wrong: both scripts always verified SHA-256 against authoritative manifests (Claude: GCS `manifest.json`; Codex: GitHub release `asset.digest`). The gate closed the remaining gap: `download-claude-binary.mjs` now also verifies the detached GPG signature on `manifest.json` against a vendored Anthropic release-signing public key (`scripts/anthropic-release-pubkey.asc`, fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`) with fingerprint pinning to catch tampered keys. Signature verification is available for Claude 2.1.89+ (we pin 2.1.96). Regression guard at `tests/regression/gpg-verification-present.test.ts`. Codex releases do not publish a separate detached signature — the GitHub release metadata's TLS chain is the trust anchor for the SHA-256 digest, which is as good as upstream provides. See https://code.claude.com/docs/en/setup#binary-integrity-and-code-signing.
- ~~`auth:get-token` IPC handler is **dead code** but still registered~~ — **RESOLVED 2026-04-08** (Phase 0 gates #1-4). Handler, preload bridge, and type declaration all deleted. Regression guard at `tests/regression/auth-get-token-deleted.test.ts`.
- ~~**FIVE token preview logs**~~ — **RESOLVED 2026-04-08** (Phase 0 gates #5-6). All four sites in `src/main/lib/trpc/routers/claude.ts` and the one in `src/main/lib/claude/env.ts` removed. Regression guard at `tests/regression/token-leak-logs-removed.test.ts` scans all of `src/main/` for forbidden substrings (`Token preview:`, `tokenPreview:`, `Token total length:`, `finalCustomConfig.token.slice`, and the env.ts presence-log pattern).
- `@azure/msal-node` (v3.8.x) ≠ `@azure/msal-node-extensions` (v5.1.x) — versions diverge, do not assume parity
- **LiteLLM OSS edition: SSO is hard-capped at ≤5 users** — beyond that requires Enterprise license
- **Electron 39 EOL: 2026-05-05** — plan upgrade to Electron 40+ before that date
- **Envoy Gateway dual-auth pattern** (`passThroughAuthHeader: true` + `jwt.optional: true`) was **empirically validated on 2026-04-08** via live smoke test against the Talos AI cluster (Envoy Gateway v1.7.1, `default/echo` HTTPRoute, Outcome A — full pass). The CLI Bearer passes through to upstream character-for-character unchanged; `claimToHeaders` populates `x-user-oid`/`x-user-tid`/`x-user-azp`. Reproducible runbook: `docs/enterprise/envoy-smoke-test.md`. Evidence: `.full-review/envoy-gateway-review/envoy-claims-validation.md` "Smoke Test Results" section. **Important caveats discovered during the test**: see the Entra gotchas below.
- **`src/renderer/lib/mock-api.ts` is marked DEPRECATED but still imported by 6 files in `features/agents/`** — do not delete without migrating call sites first. **Phase 1 complete (2026-04-09):** timestamp fossil (`created_at`/`updated_at` translation) retired by OpenSpec change `retire-mock-api-translator`; consumers now read camelCase directly from Drizzle. Regression guard at `tests/regression/mock-api-no-snake-timestamps.test.ts`. Phases 2-3 (consumer port to `trpc.*` direct + file deletion) tracked as separate proposals
- **All credential encryption goes through `src/main/lib/credential-store.ts`** — do NOT call `safeStorage.encryptString()`, `safeStorage.decryptString()`, or `safeStorage.isEncryptionAvailable()` from any other file. Enforced by `tests/regression/credential-storage-tier.test.ts`. The module detects the platform tier (1=OS keystore, 2=basic_text obfuscation, 3=none) and refuses storage on Tier 3. Enterprise operators can set `credentialStorageRequireEncryption: true` to also refuse Tier 2. `getSelectedStorageBackend()` is **Linux-only** (`@platform linux`) — macOS/Windows always resolve to Tier 1 when `isEncryptionAvailable()` is true.
- **Two independent credential *flow* paths exist**: `storeOAuthToken` writes to `anthropicAccounts` (used by `importSystemToken` and `importToken` for Claude Max / direct token); `customClaudeConfigAtom` is a Jotai atom used by `api-key-onboarding-page.tsx` for BYOK API keys. These are NOT the same storage mechanism — do not conflate them. `importToken` has zero renderer callers today. Both encrypted-token paths now delegate to `credential-store.ts`.
- **Entra `requestedAccessTokenVersion` defaults to `null` = v1, NOT v2** — new Entra app registrations issue v1.0 tokens by default EVEN when calling `/oauth2/v2.0/token`. Token format is determined by the **resource API's manifest**, not the endpoint. Explicitly set `"requestedAccessTokenVersion": 2` (integer, no quotes) in the app manifest via the Entra portal's Manifest tab — takes ~60s to propagate. Without this, `aud` is `api://<client>` (not the GUID) and `iss` is `sts.windows.net/<tenant>/` (no `/v2.0` suffix), breaking Envoy JWT validation. Discovered empirically 2026-04-08 — see `.full-review/envoy-gateway-review/05-final-report.md` §C8.
- **Entra "Add optional claim" dialog does NOT show `oid`, `tid`, `azp`** — these are default v2.0 access token claims and always present. Only `email`, `upn`, `family_name`, `idtyp`, etc. appear in the dialog. Future sessions configuring Entra should only check `email` and `idtyp`; don't search for the default claims or assume they're missing.
- **`preferred_username` MUST NOT be used for authorization** per Microsoft docs — tenant-admin-mutable, empty for service principals, synthetic for B2B guests. Use `oid` (+ `tid` for cross-tenant scoping) as the authoritative identity key in any LiteLLM `user_header_mappings` or JWT-claim-based auth.

## Debugging First Install Issues

When testing auth flows or behavior for new users, you need to simulate a fresh install:

```bash
# 1. Clear all app data (auth, database, settings)
rm -rf ~/Library/Application\ Support/Agents\ Dev/

# 2. Reset macOS protocol handler registration (if testing deep links)
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -kill -r -domain local -domain system -domain user

# 3. Clear app preferences
defaults delete dev.apollosai.agents.dev  # Dev mode
defaults delete dev.apollosai.agents      # Production

# 4. Run in dev mode with clean state
bun run dev
```

**Common First-Install Bugs:**
- **OAuth deep link not working**: macOS Launch Services may not immediately recognize protocol handlers on first app launch. User may need to click "Sign in" again after the first attempt.
- **Folder dialog not appearing**: Window focus timing issues on first launch. Fixed by ensuring window focus before showing `dialog.showOpenDialog()`.

**Dev vs Production App:**
- Dev mode uses `apollosai-agents-dev://` protocol
- Dev mode uses separate userData path (`~/Library/Application Support/Agents Dev/`)
- This prevents conflicts between dev and production installs

## Releasing a New Version

> All release documentation is in this file. There is no separate RELEASE.md.

### Prerequisites for Notarization

- Keychain profile: `apollosai-notarize` (new installs). Existing dev machines may still use the pre-rebrand `21st-notarize` profile — check `xcrun notarytool history --keychain-profile <name>` against both if a notarize step fails.
- Create a fresh profile with: `xcrun notarytool store-credentials "apollosai-notarize" --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID`

### Release Commands

```bash
# Full release (downloads binaries, builds, signs, uploads)
bun run release

# Or step by step:
bun run claude:download    # Download Claude CLI binary (pinned 2.1.96)
bun run codex:download     # Download Codex binary (pinned 0.118.0)
bun run build              # Compile TypeScript
bun run package:mac        # Build & sign macOS app
bun run dist:manifest      # Generate latest-mac.yml + latest-mac-x64.yml manifests
bun run dist:upload        # Upload built artifacts to R2 CDN (scripts/upload-release.mjs)
# Notarization is submitted by electron-builder when signing succeeds.
# Stapling + manifest re-upload are manual steps described below.
```

### Bump Version Before Release

```bash
npm version patch --no-git-tag-version  # e.g. 0.0.72 → 0.0.73
```

### After Release Script Completes

1. Wait for notarization (2-5 min): `xcrun notarytool history --keychain-profile "apollosai-notarize"` (or `21st-notarize` on pre-rebrand dev machines)
2. Staple DMGs: `cd release && xcrun stapler staple *.dmg`
3. Re-upload stapled DMGs to R2 and GitHub
4. Update changelog: `gh release edit v0.0.X --notes "..."`
5. **Upload manifests (triggers auto-updates!)**

### Files Uploaded to CDN

| File | Purpose |
|------|---------|
| `latest-mac.yml` | Manifest for arm64 auto-updates |
| `latest-mac-x64.yml` | Manifest for Intel auto-updates |
| `1Code-{version}-arm64-mac.zip` | Auto-update payload (arm64) |
| `1Code-{version}-mac.zip` | Auto-update payload (Intel) |
| `1Code-{version}-arm64.dmg` | Manual download (arm64) |
| `1Code-{version}.dmg` | Manual download (Intel) |

### Auto-Update Flow

1. App checks `https://cdn.apollosai.dev/releases/desktop/latest-mac.yml` on startup and when window regains focus (with 1 min cooldown)
2. If version in manifest > current version, shows "Update Available" banner
3. User clicks Download → downloads ZIP in background
4. User clicks "Restart Now" → installs update and restarts

## Current Status

**Shipped (v0.0.72+):**
- Multi-backend AI: Claude, Codex, Ollama
- Drizzle ORM with 7 tables, auto-migration
- 21 tRPC routers in `createAppRouter` (20 feature routers in `routers/` + 1 git router from `../../git`)
- Integrated terminal (node-pty)
- Plugin and skills system
- File viewer, kanban board, automations
- Voice features, @-mentions, search
- Auth with encrypted credential storage
- Release pipeline with notarization and auto-update

## Environment Notes

- `postinstall` runs `electron-rebuild` for `better-sqlite3` and `node-pty` — if native modules fail, run `bun run postinstall` manually
- `tsgo` (Go-based TS checker) is used instead of `tsc` for `ts:check` — much faster but may have subtle differences (requires: `npm install -g @typescript/native-preview`)
- Dev builds require Claude and Codex binaries downloaded locally (`bun run claude:download && bun run codex:download`)
- **Claude CLI binary pinned to `2.1.96`** — see `claude:download` script in `package.json`. Bumping the pin requires re-testing session resume and streaming. This version supports signed-manifest GPG verification (introduced 2.1.89); the download script enforces it at `scripts/download-claude-binary.mjs`.
- **Codex CLI binary pinned to `0.118.0`** — see `codex:download` script in `package.json`. Bumping the pin requires re-testing the `@zed-industries/codex-acp` bridge. This version natively supports dynamic short-lived bearer token refresh for custom model providers, which enables the Phase 1 Envoy Gateway rotation pattern without a custom shim.
- **Vite must stay on 6.x** — `electron-vite` 3.x depends on `splitVendorChunk` which was removed in Vite 7+. Use `^6.4.2` minimum.
- **Minimal test suite** — `bun:test` (built in, no config) bootstrapped 2026-04-08 for Phase 0 regression guards under `tests/regression/`. No Jest/Vitest/Playwright — broader test adoption is Phase 0 hard gate #11. Quality gates: `bun run ts:check` (stricter, tsgo-based), `bun run build` (esbuild, validates packaging), `bun test` (regression guards, ~100ms for the current suite), `bun audit` (dependency advisories), `bunx @fission-ai/openspec@1.2.0 validate --all --strict --no-interactive` (spec validation). **Run all five before submitting a PR** — none is a superset of the others, and the four together run in under 2 minutes on an M-series Mac. The same four are enforced in CI (`.github/workflows/ci.yml`).
- **TypeScript baseline is not clean** — `bun run ts:check` currently reports ~87 pre-existing errors on `main` (auth/mentions/layout hotspots, unrelated to active work). Before investigating any TS error, establish the baseline: `git stash && bun run ts:check 2>&1 | grep -c "error TS" && git stash pop`. Only worry about *new* errors your changes introduce. Cleaning the baseline is an open Phase 0 concern.
- **Baseline file is load-bearing, not just a shortcut** — `.claude/.tscheck-baseline` contains the current numeric baseline (e.g., `88`). A `PostToolUse` hook in `.claude/settings.json` reads this file after every `.ts`/`.tsx` Edit or Write, re-runs `bun run ts:check`, and fails loudly if the count increased. If you legitimately reduce the baseline, update the file: `bun run ts:check 2>&1 | grep -c "error TS" > .claude/.tscheck-baseline`. If the file is missing, the hook treats the current count as the baseline for that run only.
- **Hidden worktree directory is `~/.1code/worktrees/`, not `.21st/`** — the parent directory was renamed in the 2026-04-08 rebrand sweep (OpenSpec change `rebrand-residual-sweep`). Repo clones live under `~/.1code/repos/`. The per-worktree config file is `.1code/worktree.json` (unchanged). This is the canonical local storage location — do not create anything under `~/.21st/`. If an existing worktree detection path references `.21st/worktrees`, that is a regression and should fail the `brand-sweep-complete` regression guard.
- **`claude-mem` Read-tool interaction** — Files with prior observations return only line 1 + a semantic-priming timeline on first `Read()`. This is NOT a "file unchanged" signal. To get actual content: re-invoke `Read()` with explicit `offset`/`limit` *strictly within* the file length (the tool rejects offsets ≥ file length with "file is shorter than offset"), or fall back to `sed -n 'M,Np' <file>` via Bash (an exception to the "no Bash for reading files" rule). Applies to any file that has `### <date>` entries prepended to the tool result.
- **Tailwind must stay on 3.x** — `tailwind-merge` v3 requires Tailwind v4; upgrading requires full config migration (134 files use `cn()`)
- **shiki must stay on 3.x** — `@pierre/diffs` pins `shiki: ^3.0.0`; v4 blocked until upstream releases compatible version
- **`@xyd-js/cli` (in `docs/package.json`) pinned to `0.0.0-build-1202121-20260121231224`** — xyd-js publishes pre-release builds in lockstep across 28 sibling packages. Bumping requires `verify-pin` skill (sandbox install + `xyd build` + `bun audit`). The `0.1.0-xyd.<N>` channel is dead (last publish July 2025); only the `0.0.0-build-<sha>-<timestamp>` channel is active. `docs/bun.lock` is tracked for reproducible CI builds.
- `bun update` is semver-safe; `bun update --latest` pulls major version bumps (use cautiously). For `bun audit` / `bun outdated` see the Commands block above.
- **`openspec` CLI is installed globally** but mise shims may not be on the Bash tool's PATH in non-login shells. Use `bunx @fission-ai/openspec@1.2.0` (matches the globally pinned version) instead of bare `openspec` in automation. Supports `new change`, `instructions <artifact>`, `validate --strict --no-interactive`, `list`, `status --change <id>`, `show <id>`, `archive`. The `/opsx:verify` workflow is also enabled — use it before archiving to check implementation completeness.
- **`openspec/config.yaml` has active `context` + `rules` injection** — the `context` block is injected into every `/opsx:propose` and `/opsx:apply` artifact generation. Keep it concise and up-to-date when the tech stack or constraints change.
- **OpenSpec capability specs inventory**: `openspec/specs/` contains 5 promoted capabilities: `brand-identity` (Tier A/B/C brand taxonomy), `feature-flags` (feature flag infrastructure shape), `claude-code-auth-import` (local-only Claude Code auth paths), `documentation-site` (docs/ site contract, no-scratchpad-references rule, xyd build requirement), `credential-storage` (3-tier credential encryption policy, enterprise hard-refusal flag). Use `## MODIFIED Requirements` against these baselines when changing their behavior.
- **OpenSpec `## MODIFIED Requirements` requires an archived baseline.** You can only use MODIFIED against a capability spec that lives under `openspec/specs/<capability>/spec.md`. Capabilities still inside unarchived `openspec/changes/<id>/specs/` directories are NOT baselines — use `## ADDED Requirements` on a new capability instead, or archive the source change first with `bunx @fission-ai/openspec@1.2.0 archive <id>`.
- **TDD red-state verification rule:** A test that fails because of a missing import, undefined symbol, or TypeScript compile error is NOT a valid red. The red step must produce an assertion failure with a readable `expected X, got Y` message. If the red output mentions `ReferenceError`, `TypeError`, or `Cannot find module`, stop and fix the test harness before proceeding to green.
- Claude Agent SDK version: see `@anthropic-ai/claude-agent-sdk` in `package.json`
- Protocol handlers: Production uses `apollosai-agents://`, dev uses `apollosai-agents-dev://`
- **Serena MCP requires `mcp__serena__activate_project` first** before `list_memories` / `read_memory` will work — call with `project: "ai-coding-cli"` or the absolute repo path. Without activation it returns `Error: No active project`.
- **Decoding JWTs on macOS requires padding + URL-safe alphabet translation** — BSD `base64 -d` silently truncates JWT payloads because JWTs use base64url (no padding, `-`/`_` instead of `+`/`/`). Symptom: `jq: Unfinished JSON term at EOF at line 1, column <N>`. Working one-liner: `echo "$JWT" | cut -d. -f2 | tr '_-' '/+' | awk '{l=length($0); printf "%s%s\n", $0, substr("====", 1, (4-l%4)%4)}' | base64 -d | jq`. Alternatives: Python `base64.urlsafe_b64decode` with manual padding, or paste to https://jwt.ms (client-side only — throwaway test tokens only).

## Documentation Maintenance

The authoritative repo navigation map is `.claude/PROJECT_INDEX.md` — regenerate it after any structural change (new router, new table, new renderer feature). Doc sync targets: `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, this file, `.serena/memories/*`, `.claude/PROJECT_INDEX.md`. Working directories (`.scratchpad/`, `.full-review/`) and the key strategy docs in them are catalogued under "Working Directories & Conventions" above.

**Phase 0 gate text is exact scope, not a minimum.** Gate text in `docs/enterprise/auth-strategy.md` §6 (e.g., "Resolve sandbox dependency") names exactly what a gate closes. Do NOT expand scope within a single gate. If a gate's implementation reveals additional work (new auth mechanism, new credential store, three-segment model), that additional work needs its own OpenSpec change proposal, not a bigger Layer 1. This rule is load-bearing — violating it triggered the 4-reviewer Gate #8 audit rework in the prior session.

Common drift points:
- SDK package names and versions (`@anthropic-ai/claude-agent-sdk`)
- Electron / Vite / Tailwind / Shiki version pins (load-bearing — see Environment Notes)
- Electron EOL dates
- Claude / Codex CLI binary version pins (in `package.json` `claude:download` / `codex:download` scripts)
- Release script names and the `release` pipeline composition
- Database schema columns (the snippet in this file vs `src/main/lib/db/schema/index.ts`)
- tRPC router count and the list under the architecture diagram
- Renderer feature subdirectories (`src/renderer/features/agents/*`)
- Quality-gate naming (always: both `ts:check` and `build`)
- Hosted-vs-OSS feature claims in README/CONTRIBUTING (verify against actual code paths, not assumptions)
- Regression guard count under `tests/regression/` — currently **10** (36 tests); grows whenever a new Phase 0 gate or brand guard lands
- Brand taxonomy acceptance rules — authoritative source is `openspec/specs/brand-identity/spec.md` (the `brand-identity` capability, introduced by the `rebrand-residual-sweep` change). Do NOT duplicate the Tier A/B/C definitions in this file — point at the spec
- Baseline spec count in `openspec/specs/` — currently **5** (`brand-identity`, `feature-flags`, `claude-code-auth-import`, `documentation-site`, `credential-storage`); grows when changes archive
- Deleted-file references — when a script or module is deleted, grep `CLAUDE.md`, `.claude/PROJECT_INDEX.md`, `.serena/memories/*` for the filename before committing (the `docs-drift-check` skill covers this as drift point #10)
