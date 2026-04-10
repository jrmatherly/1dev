---
title: Upstream Features Catalog (F1-F10)
icon: list-tree
---

> **Canonical home.** This page is the authoritative version of the F1-F10
> upstream SaaS dependency catalog. It was promoted from the now-deprecated
> `.scratchpad/upstream-features-inventory.md` on 2026-04-09.

# Upstream Hosted Features Inventory

**Document:** `.scratchpad/upstream-features-inventory.md`
**Created:** 2026-04-08
**Status:** **v2** — All 10 F-entries have restoration decisions as of 2026-04-08 (Phase 0 hard gate #15 complete). F1, F7, F9 investigations closed by the `upstream-dependency-auditor` agent on 2026-04-08.
**Purpose:** Catalog every feature that depends on the upstream `21st.dev` / `1code.dev` backend, what breaks when that backend is retired, and candidate restoration paths for the enterprise fork.

## Overarching Restoration Theme

**Locked in 2026-04-08:** Anything the upstream SaaS was providing will be **reverse-engineered, re-created, and self-hosted**. The fork controls every runtime endpoint the shipped app talks to. "Drop the feature" is off the table unless the feature is architecturally dead code. "Use someone else's hosted service" is off the table — the end-state is a self-contained enterprise deployment.

Exceptions (features that turned out NOT to be SaaS dependencies at all after investigation):
- **F7 (Plugin Marketplace)** — investigated 2026-04-08, confirmed local-only (Claude Code's native `~/.claude/plugins/` layout). No restoration work needed; the README's "marketplace" claim was aspirational.
- **F9 (Live Browser Previews)** — investigated 2026-04-08, confirmed dead UI on desktop (gated by contradictions that can never evaluate true). Not a migration chore; reimplement later as a Phase 2 greenfield feature using the existing `port-manager.ts` substrate.

All other F-entries (F1-F6, F8, F10) have self-hosted or local-subprocess restore decisions recorded below.

## Companion Documents
- `../enterprise/auth-strategy.md` — Envoy Gateway + Entra ID auth migration
- `../enterprise/auth-fallback.md` — MSAL-in-Electron alternative
- `../../.scratchpad/archive/typed-approuter-implementation-plan.md` — Background on the `remote-app-router.ts` typed stub used by every feature in this inventory

## How this inventory was built

Source-of-truth grep queries (rerun any time to refresh):

```bash
# All renderer-side calls to the upstream tRPC backend
grep -rn "remoteTrpc\." src/renderer/

# All raw HTTP calls to the configurable API base URL
grep -rn "fetch(\`\${apiUrl}\|fetch(\`\${API_BASE}\|fetch(\`\${baseUrl}\|21st.dev/api\|getApiBaseUrl" src/main/ src/renderer/

# Typed router stub (defines the contract with the upstream backend)
src/renderer/lib/remote-app-router.ts
```

The upstream backend is reached through two channels:
1. **`remoteTrpc.*`** — typed tRPC client (`src/renderer/lib/remote-trpc.ts`) — uses `signedFetch` IPC to attach the desktop auth token. Type contract is in `src/renderer/lib/remote-app-router.ts`.
2. **Raw `fetch(...)`** to `${apiUrl}/...` paths — typically through `getApiBaseUrl()` on either side of the IPC bridge. Used where tRPC is not on the upstream path (voice, sandbox import, changelog, OAuth bootstrap).

Default base URL: `https://21st.dev` (overridable via `desktopApi.getApiBaseUrl()`, which reads from main-process env).

---

## Feature Inventory

Each entry: **what it does today**, **what breaks** when upstream is retired, **code locations**, **dependency type**, **priority for restoration**, and **candidate restore approaches**.

Priority legend:
- 🟥 **P0** — Blocks core daily-driver use of the fork. Must restore before retiring upstream.
- 🟨 **P1** — Important workflow feature; degrades the product noticeably. Restore in phase 2.
- 🟩 **P2** — Nice-to-have / optional. Can ship the fork without it.
- ⬜ **P3** — Cosmetic or low-value. Acceptable to drop entirely.

---

### F1. Cloud Sandbox Background Agents 🟥 P0 (or ⬜ P3 — see decision below)

**What it does today:**
"Background agents" run in upstream-managed CodeSandbox instances. The desktop app starts a sandbox via the upstream backend, then the sandbox runs agent loops while the laptop is closed. Results are pulled back via the `sandboxImportRouter` ("open locally" flow), which fetches chat exports + git state from `${apiUrl}/api/agents/chat/{chatId}/export` and imports them into a local worktree.

**Code locations:**
- `src/main/lib/trpc/routers/sandbox-import.ts` — full router
  - `:135` — `getBaseUrl()` resolves upstream API base
  - `:160-161` — `${apiUrl}/api/agents/chat/${chatId}/export` (fetches chat history)
  - `:343` — `${apiUrl}/api/agents/chats?teamId=${teamId}` (lists user's remote sandbox chats)
  - Imports `../../git/sandbox-import` which contains the actual git restore logic
- `src/main/lib/trpc/routers/claude-code.ts:178-220` — OAuth flow creates a sandbox (`POST ${apiUrl}/api/auth/claude-code/start`) for the Claude Code authentication handshake, then polls the sandbox directly for the OAuth URL/token. **Note:** this OAuth flow uses sandboxes purely as an OAuth-redirect host, not for agent execution.
- `src/renderer/features/agents/lib/remote-chat-transport.ts:11` — renderer transport that streams from a remote sandbox
- README highlight references: "Background Agents", "Cloud Sandboxes", "Runs When You Sleep"

**Dependency type:** Raw HTTP to upstream `${apiUrl}/api/agents/*` endpoints + sandbox-side HTTP for OAuth callbacks.

**What breaks when upstream is retired:**
1. The "open locally" import flow — users can't pull a remote sandbox into a local worktree.
2. Listing remote sandbox chats in the sidebar.
3. The Claude Code OAuth flow (which uses sandboxes for the redirect endpoint) — this is the **harder break**, because OAuth depends on it even for users who never touch background agents.

**Priority debate:**
- If the fork keeps "background agents" as a value prop → **P0**, must restore.
- If the fork explicitly drops background agents (likely, given the enterprise direction is local-first MSAL) → **the OAuth-flow dependency becomes a P0 bug to extract from this code path.** Background-agent UI itself is ⬜ P3.

**Candidate restore approaches:**
- **Option A — Self-host CodeSandbox runner:** Run a small Bun/Node service that exposes `/api/agents/chat/{id}/export` and `/api/agents/chats` against the enterprise fork's own backing store. Reuses 100% of the existing client code paths.
- **Option B — Replace with local execution model:** Add a `local-background` mode that runs the agent in a detached child process inside an existing worktree. Loses the "laptop closed" benefit but eliminates all upstream HTTP. Requires UI rework.
- **Option C — Drop entirely:** Delete `sandbox-import.ts`, `remote-chat-transport.ts`, and the corresponding sidebar UI. Extract the Claude Code OAuth flow into a non-sandbox redirect (use a localhost loopback server like the rest of the OAuth code in `auth-manager.ts`).

**Recommended next research step:** Read `src/main/lib/git/sandbox-import.ts` to understand the git-state import contract (worktree shape, session-file format) — this defines what any replacement service needs to produce.

---

### F2. Automations & Inbox 🟨 P1

**What it does today:**
Server-managed automations (GitHub PR triggers, Linear ticket triggers, Slack `@1code` triggers) run agents on the upstream backend and surface results in an inbox view inside the desktop app. The inbox is a feed of "automation execution chats" that the user can review, mark as read, archive, or open locally.

**Code locations:**
- `src/renderer/features/automations/automations-view.tsx` — automations list + integration cards
  - `:53` — `remoteTrpc.automations.listAutomations`
  - `:60` — `remoteTrpc.github.getConnectionStatus`
  - `:67` — `remoteTrpc.linear.getIntegration`
- `src/renderer/features/automations/automations-detail-view.tsx` — create/edit/delete automation
  - `:158` — `remoteTrpc.automations.getAutomation`
  - `:169` — `remoteTrpc.automations.listExecutions`
  - `:265` — `createAutomation`
  - `:274` — `updateAutomation`
  - `:286` — `deleteAutomation`
- `src/renderer/features/automations/inbox-view.tsx` — inbox feed
  - `:302` — `getInboxChats`
  - `:308` — `markInboxItemRead`
  - `:317` — `archiveChat` (via remote agents router)
  - `:326` — `markAllInboxItemsRead`
  - `:335` — `archiveChatsBatch`
  - `:352` — `getAgentChat` (loads individual remote chat on demand)
- `src/renderer/features/sidebar/agents-sidebar.tsx:1163` — `getInboxUnreadCount` for the sidebar badge
- `src/renderer/features/agents/ui/agents-content.tsx:202` — `listAutomations` to gate UI affordances
- Type contract: `src/renderer/lib/remote-app-router.ts` — `AutomationsRecord`, `GithubRecord`, `LinearRecord`

**Dependency type:** Pure `remoteTrpc.*` (no raw HTTP).

**What breaks when upstream is retired:**
- Automations tab — empty/error state
- Inbox tab — empty/error state, sidebar unread badge stuck
- Any "open inbox item locally" flow that fans out into `sandbox-import` (chained dependency on F1)
- GitHub/Linear connection status indicators

**Decision (2026-04-08): Option A — Self-host the automations backend.** Per the overarching restoration theme, we reverse-engineer the upstream contract and re-implement it. Build a tRPC service exposing `automations.*`, `github.*`, `linear.*`, and the `agents.*` archive/inbox subset. Webhook receivers for GitHub/Linear/Slack feed an execution queue that runs agents (likely on the same self-hosted runner from F1's OAuth-flow extraction). Data store lives behind the Envoy Gateway alongside LiteLLM.

**Recommended next research step:** Diff the `AutomationsRecord` shape in `remote-app-router.ts` against what `automations-detail-view.tsx` actually calls to understand the minimum viable surface area. This becomes Phase 2 work and should be sequenced after the enterprise auth migration lands (Phase 1) so the new service can sit behind the same Envoy Gateway + Entra auth pattern.

---

### F3. Remote Agent Chats / Sync 🟨 P1

**What it does today:**
The upstream backend stores "agent chats" (likely a copy of every chat run via the upstream API) and the desktop app can browse them, archive/restore/rename them, and see them in the sidebar alongside local chats. This is also the data layer behind the "Sign in / Sync" feature.

**Code locations:**
- `src/renderer/lib/remote-api.ts` — primary entry point (every method goes through `remoteTrpc.agents.*`)
  - `:35` — `teams.getUserTeams`
  - `:43` — `agents.getAgentChats`
  - `:50` — `agents.getAgentChat`
  - `:57` — `agents.getArchivedChats`
  - `:64` — `archiveChat`
  - `:71` — `archiveChatsBatch`
  - `:78` — `restoreChat`
  - `:85` — `renameSubChat`
  - `:92` — `renameChat`
- `src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx:67` — `getAgentsSubscription` (gates beta features behind an upstream-tracked subscription tier)
- Type contract: `AgentsRecord` and `TeamsRecord` in `remote-app-router.ts`

**Dependency type:** Pure `remoteTrpc.*`.

**What breaks when upstream is retired:**
- Settings → "Agents (Beta)" tab — can't read subscription tier
- Team selection / multi-team workspace switching
- Any sidebar section that lists remote chats (tightly coupled to F2 inbox flow)
- Archive/restore/rename of remote chats

**Candidate restore approaches:**
- **Option A — Self-host the agents+teams tRPC service:** Subset of F2's restore approach. Could share the same backing store.
- **Option B — Single-tenant local mode:** Replace `remoteTrpc.agents.*` and `remoteTrpc.teams.*` with no-op stubs that return empty arrays / hardcoded "personal" team. Hide the corresponding UI sections behind a feature flag. Low restore cost; eliminates the multi-tenant story entirely.

---

### F4. Voice Transcription 🟨 P1

**What it does today:**
Hold-to-talk dictation. The voice router has TWO code paths:
1. **OpenAI direct path** — if a user-configured OpenAI API key is present (or `MAIN_VITE_OPENAI_API_KEY` / shell `OPENAI_API_KEY`), the renderer sends audio directly to OpenAI Whisper.
2. **Upstream backend path** — if no key is present, audio is POSTed to `${apiUrl}/api/voice/transcribe`, gated by a paid subscription (`onecode_pro`, `onecode_max_100`, `onecode_max`). Upstream proxies to Whisper using its own key.

**Code locations:**
- `src/main/lib/trpc/routers/voice.ts`
  - `:90-115` — `getUserPlan()` and `hasPaidSubscription()` query upstream
  - `:128` — `getOpenAIApiKey()` priority cascade (user-configured → Vite env → process.env → shell)
  - `:229` — `fetch(\`${apiUrl}/api/voice/transcribe\`, ...)` upstream fallback
  - `:245` — throws `"Voice transcription requires a paid subscription"` if no key + no subscription

**Dependency type:** Hybrid — raw HTTP to upstream **OR** direct OpenAI API.

**What breaks when upstream is retired:**
- Users without their own OpenAI key lose voice input entirely.
- Users **with** an OpenAI key are unaffected — the OpenAI direct path keeps working.

**Candidate restore approaches:**
- **Option A — Require BYOK and remove the upstream branch:** Delete the `${apiUrl}/api/voice/transcribe` fallback. Voice becomes BYOK-only (consistent with the fork's "no hosted backend" direction). Low restore cost.
- **Option B — Route through LiteLLM:** Add a LiteLLM Whisper deployment and point the voice router at the LiteLLM endpoint. Aligns with the existing enterprise auth strategy (one gateway, one token).
- **Option C — Self-host a Whisper server:** `whisper.cpp` or `faster-whisper` in a container. Maximum control, highest ops cost.

**Recommended:** Option B — fits the Envoy Gateway / LiteLLM architecture already documented in the auth strategy docs.

---

### F5. Auto-Update Channel ✅ RESOLVED 2026-04-09

**Status:** **Resolved** — migrated to `electron-updater`'s native `github` provider. Updates now flow from GitHub Releases on `jrmatherly/1dev`.

**What it does today:**
`electron-updater` reads update manifests (`latest-mac.yml`, `latest.yml`, `latest-linux.yml`) from the GitHub Releases API on startup and on window focus. Release artifacts are built by `.github/workflows/release.yml` on all 3 operating systems via matrix and published as binary assets on a tag-driven GitHub Release.

**Code locations:**
- `package.json` `build.publish` — `provider: "github"`, `owner: "jrmatherly"`, `repo: "1dev"`
- `src/main/lib/auto-updater.ts` — no runtime `setFeedURL` needed; `electron-updater` reads the feed from `app-update.yml` baked in at build time
- `.github/workflows/release.yml` — CI release pipeline (triggers on `push: tags: ['v*']` + `workflow_dispatch`)
- `docs/operations/release.md` — the release runbook

**Original analysis (kept for history):**
Previously we considered two restore approaches — (A) self-hosted R2/S3/MinIO with `CDN_BASE` flip, or (B) GitHub Releases via `electron-updater`'s `github` provider. We chose **Option B** on 2026-04-09 because it eliminates CDN ops entirely and works out-of-the-box with `electron-updater` without requiring a personal access token (public releases only).

**Open follow-ups (tracked in roadmap):**
- First-iteration releases are **unsigned** on all 3 OSes. Signing is a hardening task once Apple Developer ID + Windows EV cert secrets are provisioned.

---

### F6. Changelog Display ⬜ P3

**What it does today:**
The help popover fetches the upstream changelog and shows the 3 most recent entries.

**Code locations:**
- `src/renderer/features/agents/components/agents-help-popover.tsx:80` — `signedFetch("https://21st.dev/api/changelog/desktop?per_page=3")`

**Dependency type:** Hardcoded raw HTTP to `https://21st.dev` (does **not** use `getApiBaseUrl()` — the URL is a literal string).

**What breaks when upstream is retired:**
- Help popover changelog section is empty.

**Decision (2026-04-08): Option B — Move to `getApiBaseUrl()` + self-hosted changelog endpoint.** Per the overarching restoration theme, we stand up a self-hosted changelog API rather than bundling at build time. Concrete changes:
1. Replace the hardcoded `https://21st.dev/api/changelog/desktop?per_page=3` fetch in `agents-help-popover.tsx:80` with `${getApiBaseUrl()}/api/changelog/desktop?per_page=3`.
2. Self-host a minimal changelog endpoint (static JSON generated from `CHANGELOG.md` + a thin HTTP wrapper, or a small JSON file served behind Envoy Gateway at the enterprise domain). Endpoint shape and pagination must match the response format the popover expects (TBD — read the popover's parsing code during implementation to lock in the schema).
3. The endpoint is unauthenticated (changelog is public content) but sits behind the Envoy Gateway so the gateway's rate-limiting and CSP apply.

**Implementation priority:** Phase 2 (after auth migration). The popover is cosmetic — a broken changelog link is annoying but non-blocking.

---

### F7. Plugin Marketplace (Plugin Viewer) 🟩 P3 — LOCAL-ONLY, no SaaS dependency

**Investigation closed 2026-04-08** by the `upstream-dependency-auditor` agent. Previously marked "Dependency type: Unknown — needs investigation." Decisive code-reading result: **F7 is not a SaaS dependency at all.**

**What it does today:**
Read-only settings tab that lists plugins the user has installed via Claude Code's native `/plugin install` command. The code scans `~/.claude/plugins/marketplaces/*/.claude-plugin/marketplace.json` on disk and renders the components (commands, skills, agents, MCP servers) for each plugin. There is no in-app install, browse, or search-remote flow. The empty state literally tells the user *"Install plugins to ~/.claude/plugins/marketplaces/"*.

**Code locations:**
- `src/main/lib/trpc/routers/plugins.ts:182-228` — local `list` query, filesystem-only
- `src/main/lib/plugins/index.ts:58-152` — `discoverInstalledPlugins()` scans `~/.claude/plugins/marketplaces/`
- `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx:348-689` — settings UI, no install button
- `src/main/lib/trpc/routers/claude-settings.ts:57-73,171` — enable/disable state in `~/.claude/settings.json`

**Dependency type:** **None.** Purely local filesystem; inherits Claude Code's plugin layout. Verified 2026-04-08 by grep: zero matches for `fetch|remoteTrpc|21st.dev|1code.dev|apiUrl|getApiBaseUrl` in `src/main/lib/trpc/routers/plugins.ts` and `src/main/lib/plugins/index.ts`; zero matches for `plugin` in `src/renderer/lib/remote-app-router.ts`.

**What breaks when upstream is retired:** Nothing. Works identically before and after.

**Restoration required:** None. One-line doc correction only:
- `README.md:39` — replace the "Hosted plugin marketplace" bullet with "Plugin viewer for Claude Code plugins" (or delete).

**Future feature (Phase 2, optional, aligned with self-host-everything theme):** If a real in-app browse/install flow is desired, add a `plugins.browseMarketplace` query pointing at `${getApiBaseUrl()}/api/plugin-registry/index.json` (static file on any HTTPS origin the fork controls — e.g., served from the same Envoy Gateway as the rest of the enterprise stack; reuse the existing `MarketplaceJson` type at `src/main/lib/plugins/index.ts:30-33`) plus a `plugins.install` mutation that `git clone`s into `~/.claude/plugins/marketplaces/<name>/`. No database, no auth, no server-side state beyond a static file. This is a greenfield Phase 2 feature, not a migration chore.

---

### F8. Subscription Tier Gating 🟨 P1

**What it does today:**
Multiple features check the user's upstream subscription tier (`onecode_pro`, `onecode_max_100`, `onecode_max`) before enabling functionality. The check goes through `authManager.fetchUserPlan()`.

**Code locations:**
- `src/main/lib/trpc/routers/voice.ts:90-115` — caches `cachedUserPlan`
- `src/renderer/components/dialogs/settings-tabs/agents-beta-tab.tsx:67` — `getAgentsSubscription`
- `src/main/auth-manager.ts` — `fetchUserPlan` method (need to verify endpoint)

**Dependency type:** Raw HTTP to upstream user/billing endpoints.

**What breaks when upstream is retired:**
- Every paywalled feature enters its "no subscription" code path. For voice this means a thrown error. For other features it likely means hidden UI.

**Candidate restore approaches:**
- **Option A — Stub `hasPaidSubscription()` to always return `true`:** Single-line change. Removes the paywall, leaves the UI flow intact.
- **Option B — Tie tier to enterprise SSO group membership:** When the user authenticates via Entra ID (per the auth strategy doc), read group claims to determine tier. Aligns with enterprise auth direction.
- **Option C — Remove all subscription checks:** Delete the `hasPaidSubscription` calls entirely. Cleanest end-state but touches more files.

**Recommended:** Option A as an interim, Option C as the end-state.

---

### F9. Live Browser Previews 🟨 P2 — DEAD UI on desktop, Phase 2 greenfield

**Investigation closed 2026-04-08** by the `upstream-dependency-auditor` agent. Previously marked "Likely tied to F1 (cloud sandbox runs the dev server). Needs verification." Decisive code-reading result: **F9 is dead UI on desktop.** Every render gate requires `sandboxId` to be truthy, but `src/renderer/lib/mock-api.ts:46` hard-codes `sandbox_id: null` for all local chats. The "Open Preview" button, the preview sidebar, and the `PreviewSetupHoverCard` are all unreachable via any combination of state mutations available on Electron.

**What it does today:**
**Nothing on desktop.** In hosted upstream, this surface rendered an e2b/CodeSandbox iframe for the sandbox's dev server. On the Electron fork, every code path that could show the preview is gated on contradictions:
- `active-chat.tsx:8119-8120` — "Open Preview" button gated on `sandboxId && chatSourceMode === "local"` (desktop local mode has no sandbox_id, so never true)
- `active-chat.tsx:8607` — preview sidebar gated on `canOpenPreview` which requires `sandboxId && !isQuickSetup && meta.sandboxConfig.port`
- `agent-preview.tsx:27-28` — iframe URL builder is a stub annotated `// Desktop mock`, constructs a non-existent `https://${sandboxId}-${port}.csb.app` host (and even if it worked, the upstream used the `e2b.app` host family — the stub doesn't match)

**Code locations (dead on desktop):**
- `src/renderer/features/agents/ui/agent-preview.tsx:27-28` — URL stub
- `src/renderer/features/agents/main/active-chat.tsx:6110` — `sandboxId = agentChat?.sandbox_id` (always null via mock-api)
- `src/renderer/features/agents/main/active-chat.tsx:6119-6147` — `meta.sandboxConfig.port` / `canOpenPreview` computation
- `src/renderer/features/agents/main/active-chat.tsx:8119-8150` — Open Preview button + hover card fallback (unreachable gate)
- `src/renderer/features/agents/main/active-chat.tsx:8607-8679` — Preview sidebar render (unreachable gate)
- `src/renderer/features/agents/ui/agents-content.tsx:852-918` — mobile preview mode (same gate)
- `src/renderer/features/agents/components/preview-setup-hover-card.tsx:13-14` — dead local atom re-declarations (does not use shared settings-dialog atoms), points at nonexistent "github" settings tab
- `src/renderer/lib/mock-api.ts:46` — `sandbox_id: null` hard-code that neutralizes the entire feature
- **`src/main/lib/terminal/port-manager.ts:17-60`** — **EXISTING SUBSTRATE**: port detector for integrated terminal PTY sessions, polls every 2.5s, emits events when ports appear/disappear. **Not yet wired to a tRPC router.** This is the key asset for the self-hosted rebuild.

**Dependency type:** Was tied to F1 (cloud sandbox ran the dev server). **No dependency today on desktop.** F9 is effectively a subset of F1 at the UI level — a component the upstream-sandbox flow rendered when a chat had a running dev server.

**What breaks when upstream is retired:** Nothing user-visible. The sandbox-mode code paths (`active-chat.tsx:5765-5791, 6111, 7086, 7447`) break as part of F1's retirement, not F9's.

**Decision (2026-04-08): Option A — Local-subprocess previews via terminal port detection.** Per the overarching restoration theme, we rebuild this as a self-hosted-by-the-user's-machine feature. The substrate already exists. Design:
1. **Main-process side:** Add a new `preview` tRPC router (or extend `terminal.ts`) exposing `listPorts(chatId)` query and `onPortsChanged(chatId)` subscription, filtered by the same `terminalScopeKey` the terminal sidebar already uses (`active-chat.tsx:6102-6108`). Port manager already tracks (workspaceId, paneId) → (pid, port); no new process spawning required.
2. **Renderer side:** Replace `agent-preview.tsx:27-28` stub with a `http://localhost:${port}${loadedPath}` builder driven by the new subscription. Replace `canOpenPreview` at `active-chat.tsx:6143-6147` with `detectedPorts.length > 0`. Drop the `sandboxId &&` gate at line 8119.
3. **Iframe host:** `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals">` — localhost already works in Electron iframes.
4. **Lifecycle:** user starts/stops the dev server via the integrated terminal (which they already use for everything else). Vite HMR / Next.js fast refresh handle restart-on-file-change natively. Existing reload button at `agent-preview.tsx:209-215` is sufficient for manual refresh.
5. **Copy rewrite:** `PreviewSetupHoverCard` becomes "Start your dev server in the integrated terminal to enable preview" + points at the terminal button. Delete the dead local atoms at lines 13-14.

**Estimated implementation cost:** ~200 LOC, 2-3 focused engineering days.

**Sequencing constraint:** Do this AFTER F1 is finalized (Phase 2 or later) so the dead sandbox-mode paths can be removed in the same sweep. Otherwise the fork carries two incompatible preview code paths during the transition.

**Open questions (non-blocking):**
1. Should the replacement support a user-configured fallback port for dev servers run outside the integrated terminal (e.g., iTerm2)? Defer to post-MVP feedback.
2. Does the Electron renderer CSP allow localhost iframes? Quick implementation check; not a design concern.

---

### F10. PWA Companion App ⬜ P3

**What it does today:**
README claims "Start and monitor background agents from your phone." This is the upstream **separate** PWA at `1code.dev` that talks to the same upstream backend as the desktop app — **not part of this Electron repo at all**.

**Code locations:**
- None in this repo. References found (`use-haptic.ts`, CSS comments) are about iOS Safari behavior, not a PWA shell.

**What breaks when upstream is retired:**
- Nothing in this fork breaks because there's nothing to break. The PWA was never part of this codebase.

**Candidate restore approaches:**
- **Drop from README** (Option 3 rewrite). If the fork needs a mobile companion later, that's a separate project.

---

## Summary Table

**All 10 F-entries have decisions as of 2026-04-08.** The overarching theme is self-host-everything; "drop" only appears where investigation proved the feature was already local-only or dead.

| ID | Feature | Priority | Code touches upstream | Decision |
|---|---|---|---|---|
| F1 | Background Agents (cloud sandbox) | 🟥 P0 (OAuth) / ⬜ P3 (agents) | sandbox-import.ts, claude-code.ts | Extract OAuth to localhost loopback (P0); self-host agent runner or drop (P3 decision deferred) |
| F2 | Automations & Inbox | 🟨 P1 | features/automations/* | **Self-host** tRPC service behind Envoy Gateway (Phase 2) |
| F3 | Remote Agent Chats / Teams | 🟨 P1 | remote-api.ts, agents-beta-tab.tsx | Stub to single-tenant local (Phase 1/2) |
| F4 | Voice Transcription | 🟨 P1 | voice.ts | Route through LiteLLM Whisper (Phase 2, aligned with auth migration) |
| F5 | Auto-Update Channel | ✅ RESOLVED | auto-updater.ts, release.yml | Migrated to `electron-updater` github provider (2026-04-09); unsigned builds pending cert secrets |
| F6 | Changelog Display | ⬜ P3 | agents-help-popover.tsx | **Move to `getApiBaseUrl()`** + self-hosted changelog endpoint behind Envoy Gateway (Phase 2) |
| F7 | Plugin Viewer | 🟩 P3 | (none — local-only) | **No restoration needed** — investigated 2026-04-08, feature is local-only. One README line correction. |
| F8 | Subscription Tier Gating | 🟨 P1 | voice.ts, auth-manager.ts | Stub to `true` interim → remove end-state (Phase 1) |
| F9 | Live Browser Previews | 🟨 P2 | (none on desktop — dead UI) | **Rebuild via port-manager substrate** — investigated 2026-04-08, feature is dead UI today. ~200 LOC Phase 2 greenfield. |
| F10 | PWA Companion | ⬜ P3 | (not in repo) | Drop from README only |

## Open Investigations

**All three previously-open investigations are closed as of 2026-04-08:**

1. ✅ **F1 (sandbox-import git contract)** — this was listed as "needs research" for the restoration design, but the OAuth-loopback decision (the P0 half of F1) does not require understanding the git-import contract. Git-import contract investigation only matters if the team decides to **restore** the self-hosted agent runner (the P3 half). That decision is deferred to Phase 2 and carries its own research step when it becomes relevant.
2. ✅ **F7 (plugin marketplace source)** — Investigated by `upstream-dependency-auditor` agent on 2026-04-08. Decisive result: **zero SaaS dependency**. Feature is a read-only viewer over Claude Code's native `~/.claude/plugins/` layout. No restoration work needed.
3. ✅ **F9 (live preview architecture)** — Investigated by `upstream-dependency-auditor` agent on 2026-04-08. Decisive result: **dead UI on desktop** (all render gates require `sandboxId` which is always null via `mock-api.ts:46`). Rebuild design locked in: wire the existing `port-manager.ts` substrate to a new `preview` tRPC router, point iframe at `http://localhost:${port}`.

**Phase 0 hard gate #15 status: complete.** Every F-entry has a recorded decision. No investigations block the enterprise auth migration.

## What this inventory is NOT

- **Not a migration plan.** It's a feature catalog with restore options. The migration plan needs to sequence F1/F2/F3/F8 changes alongside the auth migration in `../enterprise/auth-strategy.md`.
- **Not exhaustive of every upstream HTTP call.** Trivial calls (analytics, error reporting) are out of scope — those are addressed by env-var gating in production builds.
- **Not a dependency injection plan.** The current code calls `remoteTrpc.*` directly from React components. A proper restore would introduce an interface boundary so the upstream client can be swapped without touching call sites.

## Next Actions

1. **Immediate (this session):** Use this inventory to drive the README Option 3 rewrite. Every feature marked 🟥/🟨 that touches upstream gets removed from the README Highlights/Features lists. Local features stay.
2. **Next session:** Resolve the three open investigations (F1, F7, F9).
3. **Phase 1 of fork roadmap:** Address F8 (subscription stub), F5 (CDN flip), F6 (bundled changelog), F10 (README cleanup) — all are 1-day fixes.
4. **Phase 2:** Address F4 (LiteLLM Whisper) alongside the auth migration.
5. **Phase 3:** Decide F1 / F2 / F3 strategically — these are the "big rocks" and require alignment with the broader fork direction.
