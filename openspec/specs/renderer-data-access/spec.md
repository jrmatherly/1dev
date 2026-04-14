# renderer-data-access Specification

## Purpose

CamelCase timestamp fields end-to-end for chat and sub-chat data across all TypeScript layers.
## Requirements
### Requirement: Camelcase timestamp fields end-to-end for chat and sub-chat data

The system SHALL use camelCase TypeScript field names (`createdAt`, `updatedAt`) for chat and sub-chat timestamp values in every layer that runs in TypeScript: the Drizzle row type, the tRPC router responses, the renderer-side translation shim (`mock-api.ts`), the Zustand sub-chat store, and every renderer consumer file. The underlying SQLite column names (`created_at`, `updated_at`) MAY remain snake_case because they are constrained by Drizzle's `integer("created_at", ...)` declaration syntax and represent the SQL convention rather than the TypeScript surface.

The system SHALL NOT introduce any TypeScript-side translation between the snake_case SQL columns and the camelCase TypeScript field names except where Drizzle's `integer("created_at", ...)` syntax handles it implicitly. Specifically, no `created_at: row.createdAt` or `updated_at: row.updatedAt` reverse-translation MAY exist anywhere in `src/renderer/`.

#### Scenario: Reading a chat row in the renderer

- **WHEN** a renderer component reads a chat object from `trpc.chats.get.useQuery(...)` or from the `mock-api.ts` adapter that wraps it
- **THEN** the chat's last-updated timestamp is accessible as `chat.updatedAt` (camelCase)
- **AND** TypeScript infers the type as `Date | null` (matching the Drizzle schema's `integer("updated_at", { mode: "timestamp" }).$defaultFn(...)` declaration without `.notNull()`)
- **AND** any attempt to read `chat.updated_at` causes a TypeScript compile error (`Property 'updated_at' does not exist. Did you mean 'updatedAt'?`)

#### Scenario: Sorting chats by recency in a renderer component

- **WHEN** a renderer component sorts an array of chat rows by recency
- **THEN** the sort callback reads `b.updatedAt ?? 0` and `a.updatedAt ?? 0` (with explicit null fallback because `updatedAt` is `Date | null`)
- **AND** the sort produces a deterministic order even for chats that have not yet been updated (their `updatedAt` is `null`, which `?? 0` coerces to epoch zero)
- **AND** the sort does NOT silently produce `NaN.getTime()` (which would happen if the null fallback were missing — `new Date(null)` is epoch zero, but `new Date(undefined)` is invalid)

#### Scenario: Constructing a sub-chat payload for the Zustand store

- **WHEN** a renderer component constructs a new sub-chat object to add to the Zustand sub-chat store
- **THEN** the payload uses `createdAt: someDate.toISOString()` (camelCase, ISO string for the persisted shape)
- **AND** the store's `SubChat` type accepts `createdAt?: string | null`
- **AND** any attempt to write `created_at: ...` causes a TypeScript compile error against the `SubChat` type

### Requirement: Persisted Zustand state migrates forward across the snake-to-camel rename

The system SHALL provide a Zustand `persist` middleware migration that converts any localStorage entries written before this change (which used `created_at` / `updated_at` keys on `allSubChats[*]` objects) to the new shape (using `createdAt` / `updatedAt` keys) on first launch after the upgrade. The migration MUST be triggered by bumping the persist config's `version` field by 1.

#### Scenario: Existing user upgrades to a build that includes this change

- **WHEN** an existing user upgrades to a 1Code build that includes this change
- **AND** the user's localStorage contains a `sub-chat-store` entry written by a prior build with `allSubChats: [{ id: "abc", created_at: "...", updated_at: "..." }]`
- **THEN** on first app launch, the Zustand persist middleware detects the version mismatch
- **AND** runs the `migrate` function which converts each entry to `{ id: "abc", createdAt: "...", updatedAt: "..." }`
- **AND** the user's sub-chat list renders correctly with no loss of timestamp data
- **AND** the user's sub-chat sort order is preserved

#### Scenario: Fresh install creates camelCase state from the start

- **WHEN** a new user installs a 1Code build that includes this change for the first time
- **AND** there is no prior localStorage entry for `sub-chat-store`
- **THEN** the Zustand persist middleware initializes with an empty store
- **AND** all subsequent writes use camelCase keys without invoking the migration function

### Requirement: Structural regression guard prevents fossil reintroduction

The system SHALL include an automated structural regression test at `tests/regression/mock-api-no-snake-timestamps.test.ts` that fails the build if the substrings `created_at:` or `updated_at:` reappear in `src/renderer/lib/mock-api.ts`. The guard uses simple string-presence assertions because:

1. The fossil is grep-detectable — it cannot hide behind dynamic property access in the patterns this codebase uses
2. The runtime path has no observable invariant the test could check — these keys would only manifest as type errors, which `bun run ts:check` already covers
3. The most likely vector for re-introduction is an upstream merge that brings back snake_case translation lines, which a structural string check catches reliably

The guard MUST NOT extend its scope beyond the timestamp fields. Other snake_case keys in `mock-api.ts` (`stream_id:`, `sandbox_id:`, `meta:`) are intentional fossils tracked under separate F-entry restoration work and MUST be allowed to remain.

#### Scenario: A future merge re-introduces the timestamp translation

- **WHEN** a developer merges an upstream branch that re-adds `created_at: sc.createdAt` to `mock-api.ts`
- **THEN** `bun test` fails on `tests/regression/mock-api-no-snake-timestamps.test.ts`
- **AND** the failure message points the developer at this OpenSpec proposal so they understand why the rename is load-bearing
- **AND** the merge cannot proceed until either the snake_case line is removed or the proposal is explicitly retired

#### Scenario: A new F-entry stub is added with a different snake_case field

- **WHEN** a developer adds a new upstream-feature stub to `mock-api.ts` that uses `inbox_count: 0` (a snake_case field unrelated to timestamps)
- **THEN** the regression guard does NOT fire
- **AND** the developer's change proceeds normally
- **AND** the new fossil is tracked in `docs/enterprise/upstream-features.md` under whichever F-entry it belongs to

### Requirement: Phase 1 explicitly does not retire `mock-api.ts`

The `mock-api.ts` file SHALL continue to exist after this change is implemented, but its responsibilities are reduced to F-entry-dependent stubs only. Phase 2 has removed the `api.agents.*` wrapper layer, the `api.useUtils` cache helper, the `api.usage` stub, and the message-parsing pipeline. Consumers now call `trpc.chats.*` directly and use `src/renderer/lib/message-parser.ts` for message parsing.

The file's responsibilities after Phase 2 are reduced to:

- Stubbing upstream-only procedures for F-entry-dependent features (`teams`, `stripe`, `user`, `github`, `claudeCode`, `agentInvites`, `repositorySandboxes`) that have no self-hosted equivalent yet
- Nothing else — all other responsibilities have been migrated out

The file's responsibilities that are REMOVED by this change (Phase 2):

- The entire `api.agents.*` namespace (getAgentChats, getAgentChat, getArchivedChats, archiveChat, restoreChat, renameChat, renameSubChat, generateSubChatName, updateSubChatMode, archiveBatch)
- The `api.useUtils` method with its `agents`, `github`, `user`, `stripe` cache adapters
- The `api.usage.getUserUsage` stub (was unused)
- The `api.github.searchFiles` tRPC bridge (now called via `trpc.files.search` directly)
- The JSON message-parsing pipeline (moved to `src/renderer/lib/message-parser.ts`)
- The `normalizeCodexToolPart` import (now imported by `message-parser.ts`)

#### Scenario: A consumer reads chat data via tRPC directly

- **GIVEN** a renderer component needs chat or sub-chat data
- **WHEN** it queries for the data
- **THEN** it calls `trpc.chats.*` procedures directly
- **AND** it does NOT import `api` from `mock-api.ts`

#### Scenario: A consumer performs cache manipulation via tRPC directly

- **GIVEN** a renderer component needs to invalidate or setData on chat queries
- **WHEN** it manipulates the cache
- **THEN** it calls `trpc.useUtils().chats.*` directly
- **AND** it uses `{ id }` as the key (not the legacy `{ chatId }` or `{ subChatId }`)

#### Scenario: Message parsing uses the typed helper

- **GIVEN** a consumer reads sub-chat messages from `trpc.chats.get`
- **WHEN** it needs to normalize tool parts
- **THEN** it calls `parseAndNormalizeChat()` from `src/renderer/lib/message-parser.ts`
- **AND** the helper handles all 5 normalization stages (JSON parse, tool-invocation migration, MCP wrapper, ACP title-based extraction, generic state normalization)

#### Scenario: mock-api.ts retains only F-entry stubs

- **GIVEN** Phase 2 is complete
- **WHEN** a developer reads `mock-api.ts`
- **THEN** the file contains ONLY stubs for F-entry-dependent features (teams, stripe, user, github, claudeCode, agentInvites, repositorySandboxes)
- **AND** the file is ~144 lines (down from 655 lines pre-Phase-2)
- **AND** no production consumer imports from `mock-api.ts`

#### Scenario: F1 / F2 boundary sites remain unchanged

- **GIVEN** Phase 2 is complete
- **WHEN** reviewing F1 boundary code (`active-chat.tsx` sandbox mode, `agents-sidebar.tsx` remoteChats)
- **THEN** those sites still read upstream DTO snake_case fields
- **AND** Phase 2 has not altered the F1/F2 boundary contract

### Requirement: F1 / F2 boundary translation sites are preserved unchanged

The system SHALL preserve the snake_case timestamp reads at specific boundary translation sites that consume data from the dead upstream `21st.dev` API contract (now `apollosai.dev` for the local fork; the upstream brand is historical). These boundary sites convert F1 (Background Agents / cloud sandboxes) and F2 (Automations & Inbox) external DTO shapes into the local camelCase shape used elsewhere. They MUST NOT be migrated as part of Phase 1 because they belong to the F1 / F2 restoration roadmap tracked separately at `docs/enterprise/upstream-features.md`.

The protected boundary sites at the time of writing this spec are (line numbers may shift slightly post-rebrand and are advisory, not authoritative):

- `src/renderer/features/agents/main/active-chat.tsx` lines 5765-5793 — the `if (chatSourceMode === "sandbox")` block. Specifically the `remoteAgentChat.created_at` / `remoteAgentChat.updated_at` reads at 5770-5771 and the `created_at: new Date(sc.created_at)` / `updated_at: new Date(sc.updated_at)` writes at 5787-5788 inside the sub-chat shape construction
- `src/renderer/features/sidebar/agents-sidebar.tsx` lines 2077-2078 — the `createdAt: new Date(chat.created_at)` and `updatedAt: new Date(chat.updated_at)` reads inside the `for (const chat of remoteChats)` loop
- `src/renderer/features/automations/automations-detail-view.tsx` line 847 — `new Date(execution.created_at)` from F2 inbox/automation execution data

The protection is by-name (file paths and surrounding identifier patterns) rather than by-line because line numbers may shift when other Phase 1 edits insert or remove lines above the boundary sites.

#### Scenario: A future implementer accidentally migrates an F1 boundary site

- **WHEN** a developer running the Phase 1 implementation does a careless `sed`-style rename of `created_at` → `createdAt` across `src/renderer/features/agents/main/active-chat.tsx`
- **THEN** the F1 boundary translation block at lines ~5765-5793 (which reads `remoteAgentChat.created_at`) is incorrectly converted
- **AND** at runtime, the `chatSourceMode === "sandbox"` code path produces `new Date(undefined)` (because `remoteAgentChat.createdAt` does not exist on the F1 DTO shape) which is `Invalid Date`
- **AND** the F1 sandbox flow breaks visibly during smoke testing of task 7.4
- **AND** the fix is to revert the offending edit at the F1 boundary lines and re-run the smoke test

#### Scenario: Phase 9 verification grep finds unchanged boundary sites

- **WHEN** a developer runs `grep -n "remoteAgentChat\.\(created_at\|updated_at\)" src/renderer/features/agents/main/active-chat.tsx` after completing the Phase 1 implementation
- **THEN** the grep returns matches at the F1 boundary line numbers (or wherever they have shifted to within the same `chatSourceMode === "sandbox"` block)
- **AND** the count of matches equals the count from before Phase 1 began (i.e., zero net change at the F1 boundary)

#### Scenario: F2 fossil-by-design preservation

- **WHEN** a developer reviews the migrated codebase post-Phase-1 and sees `new Date(execution.created_at)` at `automations-detail-view.tsx:847`
- **THEN** they understand this is intentional (F2 fossil per the upstream features inventory) and not an oversight
- **AND** the regression guard test at `tests/regression/mock-api-no-snake-timestamps.test.ts` includes `automations-detail-view.tsx` in its allowlist of files exempted from the consumer-side snake_case scan
- **AND** any future F2 restoration proposal will include its own consumer migration tasks for this site

### Requirement: SignedFetch origin-conditional allowlist

The `api:signed-fetch` IPC handler in `src/main/windows/main.ts` SHALL extend its existing origin-allowlist check (`MAIN_VITE_API_URL` match) with a dead-upstream-detection path. When `MAIN_VITE_API_URL` is unset OR its hostname is `apollosai.dev` (the dead upstream), the handler MUST reject ALL fetches with `{ error: "upstream_unreachable", reason: "disabled_by_env" }` without attempting the network call.

When `MAIN_VITE_API_URL` is set to a live origin (e.g., a future self-hosted `1code-api` endpoint), the handler SHALL permit fetches to that origin per the existing allowlist behavior.

No new env var is introduced. Operators revive upstream testing by setting `MAIN_VITE_API_URL` to a working endpoint (the variable is pre-existing).

#### Scenario: Default startup rejects upstream fetches

- **WHEN** the app starts with `MAIN_VITE_API_URL` unset (default)
- **AND** the renderer calls `api:signed-fetch` with `https://apollosai.dev/api/changelog/desktop?per_page=3`
- **THEN** the handler returns `{ error: "upstream_unreachable", reason: "disabled_by_env" }` without attempting fetch
- **AND** exactly ONE `[SignedFetch] upstream disabled for origin <origin>` log line is emitted per origin per process lifetime

#### Scenario: Explicit opt-in for revived upstream

- **WHEN** `MAIN_VITE_API_URL=https://apollosai.dev` is set (operator testing a revived upstream)
- **AND** the renderer calls `api:signed-fetch` with an `apollosai.dev` URL
- **THEN** the handler still rejects the fetch (hostname matches the dead-upstream rule)
- **AND** operators set `MAIN_VITE_API_URL` to a different live endpoint to enable fetches

#### Scenario: Self-hosted endpoint is permitted

- **WHEN** `MAIN_VITE_API_URL=https://api.1code.internal` is set
- **AND** the renderer calls `api:signed-fetch` with an `api.1code.internal` URL
- **THEN** the handler proceeds with the fetch (allowlist match, not dead-upstream hostname)

### Requirement: SignedFetch 60-second per-origin unreachability cache

When a fetch permitted by the allowlist fails with `ECONNREFUSED` or `ENOTFOUND`, the handler SHALL cache the origin + timestamp for 60 seconds. Subsequent calls to the same origin within the cache window MUST return `{ error: "upstream_unreachable", reason: "cached" }` without attempting a new fetch.

The cache SHALL log ONE warning line per origin per cache-refresh event (not per call).

#### Scenario: 10 parallel calls produce one fetch attempt

- **WHEN** 10 calls to `api:signed-fetch` for `https://api.1code.internal/...` fire within 100ms
- **AND** the first fetch rejects with `ENOTFOUND`
- **THEN** exactly ONE actual `fetch` call is made
- **AND** the remaining 9 receive the cached error response
- **AND** exactly ONE `[SignedFetch] Error` log line is emitted

#### Scenario: Cache expires after 60 seconds

- **WHEN** the unreachable cache entry for an origin is older than 60 seconds
- **AND** a new call to `api:signed-fetch` for that origin arrives
- **THEN** a fresh `fetch` is attempted (cache entry treated as stale)

### Requirement: Provider-aware auxiliary-AI dispatch

A new main-process module `src/main/lib/aux-ai.ts` SHALL provide auxiliary-AI features (chat title generation, commit message generation) using a dispatch matrix driven by the active `ProviderMode` resolved by `getActiveProviderMode()`:

- `subscription-litellm` and `byok-litellm` → call `@anthropic-ai/sdk` configured with `baseURL` = `MAIN_VITE_LITELLM_BASE_URL`, `authToken` = `mode.virtualKey`, and `defaultHeaders` = `{ "x-litellm-customer-id": mode.customerId }` when customerId is present.
- `byok-direct` → call `@anthropic-ai/sdk` against `api.anthropic.com` with `apiKey` = `mode.apiKey`.
- `subscription-direct` OR no resolvable mode → fall through to Ollama (if available) → truncated fallback via `getFallbackName()`.

The module SHALL NOT, under any mode, make an outbound fetch to `apollosai.dev`.

**Model resolution precedence:** (1) `getFlag("auxAiModel")` when non-empty → (2) `mode.modelMap.haiku` when mode kind is `subscription-litellm` or `byok-litellm` AND the modelMap is populated → (3) built-in default `claude-3-5-haiku-latest`.

Failures of any backend call (network, timeout, SDK error, non-200 response) SHALL degrade silently to the next backend in the chain, terminating at `getFallbackName()`. Log ONE warning line per failure; do NOT log full stack traces per call.

The module SHALL expose both a DI-friendly factory (`makeGenerateChatTitle(deps: AuxAiDeps)`) and an already-bound convenience export (`generateChatTitle`) for production call sites. The factory accepts `createAnthropic`, `generateOllamaName`, `getProviderMode`, and `getFlag` as injected dependencies, enabling unit-level testing without `mock.module()`.

The `generate-commit-message` call site at `chats.ts:1340` SHALL delegate to `generateCommitMessage(context)` using the same dispatch pattern, with different hardcoded `max_tokens` (200 vs 50) and `temperature` (0.5 vs 0.3) constants.

#### Scenario: byok-direct mode produces an AI-generated title

- **WHEN** the active account is `byok-direct` with a valid Anthropic API key
- **AND** a chat is created with user message "add pagination to the users table"
- **THEN** `generateChatTitle` calls `api.anthropic.com/v1/messages` via `@anthropic-ai/sdk`
- **AND** uses the model from the resolution precedence chain (flag override → modelMap.haiku → default)
- **AND** returns the generated title
- **AND** no fetch to `apollosai.dev` occurs

#### Scenario: subscription-litellm mode forwards customer-id audit header

- **WHEN** the active account is `subscription-litellm` with a LiteLLM virtual key and `mode.customerId` is `oid-123`
- **AND** a chat is created
- **THEN** `generateChatTitle` calls `${MAIN_VITE_LITELLM_BASE_URL}/v1/messages` via `@anthropic-ai/sdk`
- **AND** the request includes header `x-litellm-customer-id: oid-123`
- **AND** uses `Authorization: Bearer <virtualKey>` via the SDK's `authToken` config

#### Scenario: byok-litellm resolves model from account's modelMap.haiku

- **WHEN** the active account is `byok-litellm` with `modelMap.haiku = "claude-haiku-custom-id"`
- **AND** the `auxAiModel` feature flag is at its default empty-string value
- **THEN** `generateChatTitle` uses `claude-haiku-custom-id` as the SDK model id
- **AND** does NOT use the built-in default `claude-3-5-haiku-latest`

#### Scenario: Explicit auxAiModel flag overrides everything

- **WHEN** `setFlag("auxAiModel", "claude-sonnet-4-5")` has been called
- **AND** the active account is `byok-litellm` with a populated modelMap
- **THEN** `generateChatTitle` uses `claude-sonnet-4-5` (flag wins over modelMap)

#### Scenario: subscription-direct falls through to Ollama

- **WHEN** the active account is `subscription-direct`
- **AND** Ollama is running on `localhost:11434`
- **THEN** `generateChatTitle` uses the existing Ollama fallback
- **AND** no call to `@anthropic-ai/sdk` is made
- **AND** no fetch to `apollosai.dev` occurs

#### Scenario: Every mode falls back silently on provider error

- **WHEN** the chosen provider backend fails (timeout, network error, 5xx, SDK exception)
- **THEN** `generateChatTitle` returns `getFallbackName(userMessage)`
- **AND** exactly ONE warning log line is emitted per failure (no stack trace)

#### Scenario: auxAiEnabled=false forces unconditional fallback

- **WHEN** `getFlag("auxAiEnabled")` returns false
- **AND** a chat is created
- **THEN** `generateChatTitle` returns `getFallbackName(userMessage)` without any provider call

#### Scenario: Zero upstream fetches remain in the chats router

- **WHEN** `src/main/lib/trpc/routers/chats.ts` is scanned for `apollosai\.dev/api/agents`
- **THEN** zero matches are found
- **AND** the `no-apollosai-aux-ai-fetch.test.ts` regression guard passes

### Requirement: F-entries F11 and F12 catalogued with qualified-resolved status

The `docs/enterprise/upstream-features.md` file SHALL contain entries for both upstream call sites surfaced by the 2026-04-13 smoke, marked with the qualified status `✅ RESOLVED (3/4 provider modes) — subscription-direct degrades to Ollama-or-truncated-fallback (acceptable UX)`:

- **F11. Sub-Chat Name Generation** — historical `apollosai.dev/api/agents/sub-chat/generate-name` dependency. Current implementation: provider-aware dispatch in `src/main/lib/aux-ai.ts`. Qualifier: `subscription-direct` users get Ollama-or-truncated-fallback (not the AI-generated title that LiteLLM/BYOK-direct users get).
- **F12. Commit Message Generation** — historical `apollosai.dev/api/agents/generate-commit-message`. Current implementation: same module. Same qualifier.

The "3/4 provider modes" language differentiates these from fully-resolved entries like F5 (auto-update) where ALL users benefit.

#### Scenario: Catalog entries exist with correct status taxonomy

- **WHEN** `docs/enterprise/upstream-features.md` is read
- **THEN** F11 and F12 sections both exist
- **AND** each section's status line contains both `✅ RESOLVED` AND the qualifier `(3/4 provider modes)`
- **AND** each section's "current implementation" paragraph references `src/main/lib/aux-ai.ts`

### Requirement: Preferred-editor dropdown reflects only detectable editors

The Preferred Editor dropdown in Settings → Preferences (`src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx`) SHALL show an editor as selectable if and only if the main process reports that editor as detectable on the current machine via the `trpc.external.getInstalledEditors` query. When the query is still loading or has errored, the dropdown SHALL NOT fall through to showing all known editors; instead it SHALL render a loading/empty state.

Detectability is determined by `isAppInstalled()` in `src/main/lib/trpc/routers/external.ts`, which uses PATH-based detection via the `which` npm package against the editor's optional `AppMeta.cliBinary` field. GUI-only editors without a CLI launcher fall back to the existing macOS `.app` path check. The function is platform-agnostic via `which` and MUST NOT contain `process.platform` branches for the PATH lookup.

#### Scenario: Cursor is not installed and the dropdown list excludes it

- **GIVEN** the user has not installed Cursor (no `cursor` binary on PATH and no `Cursor.app` bundle)
- **AND** the user opens Settings → Preferences → Preferred Editor
- **WHEN** the dropdown list is rendered
- **THEN** the list MUST NOT contain a "Cursor" entry
- **AND** the list MUST contain entries for editors that ARE detected (e.g., VS Code when `code` is on PATH)

#### Scenario: Detection query is in flight — dropdown renders a loading state, not "all editors"

- **GIVEN** the `trpc.external.getInstalledEditors` query has not yet resolved on first render
- **WHEN** the Preferences tab is mounted
- **THEN** the dropdown list MUST NOT render the full unfiltered `EDITORS` / `TERMINALS` / `VSCODE` / `JETBRAINS` arrays
- **AND** the dropdown list MUST render an empty state or a brief "Detecting editors…" placeholder until the query resolves

#### Scenario: Windows user with VS Code installed sees VS Code in the dropdown

- **GIVEN** a Windows user has VS Code installed (the `code.cmd` launcher resolves via `where.exe code` with PATHEXT)
- **AND** the user opens Settings → Preferences → Preferred Editor
- **WHEN** the dropdown list is rendered
- **THEN** "VS Code" MUST appear as a selectable entry
- **AND** the list MUST NOT be empty (the pre-fix macOS-only detection would have produced an empty list on Windows)

### Requirement: Preferred-editor default cannot resolve to a non-installed editor on first paint

The `preferredEditorAtom` in `src/renderer/lib/atoms/index.ts` SHALL default to `null` with type `ExternalApp | null`. On first paint of the Preferences tab, a hook SHALL resolve the atom to a concrete editor using the precedence chain: (1) the OS default returned by `trpc.external.getOsDefaults` if it is present in the installed set; (2) the first entry of the installed set in declaration order; (3) leave the atom as `null`. The atom SHALL NOT default to a hard-coded literal editor identifier (e.g., `"cursor"`), because that produces the observable "button label shows an editor that isn't installed" bug on first install or after cleared app data.

When the atom's current value is not present in the live installed set (e.g., the user previously selected an editor that has since been uninstalled), the trigger button SHALL render a "No editor selected" placeholder instead of `APP_META[preferredEditor].label`.

#### Scenario: Fresh install does not pre-select an uninstalled editor

- **GIVEN** a first-ever launch of the app (no persisted `preferences:preferred-editor` localStorage entry)
- **AND** the installed-editor set is `["vscode"]` (Cursor is NOT installed)
- **WHEN** the Preferences tab is mounted
- **THEN** the trigger button label MUST NOT read "Cursor"
- **AND** the trigger button label reads either "VS Code" (first-installed resolution) or "No editor selected" (fallback) — never an editor not in the installed set

#### Scenario: Stored default references an uninstalled editor — button shows placeholder

- **GIVEN** the user previously selected "Zed" and Zed has since been uninstalled
- **AND** the installed-editor set no longer includes "zed"
- **WHEN** the Preferences tab is mounted
- **THEN** the trigger button renders "No editor selected" placeholder
- **AND** the user can pick a new editor from the now-filtered dropdown

#### Scenario: `$EDITOR` env var is respected when the editor is installed

- **GIVEN** `$EDITOR=code` is set in the user's shell environment
- **AND** VS Code is installed and `code` resolves via `which`
- **AND** no prior `preferences:preferred-editor` localStorage entry exists
- **WHEN** the Preferences tab is first mounted
- **THEN** the first-paint hook resolves `preferredEditorAtom` to `"vscode"` (OS default wins over first-installed fallback)
- **AND** the trigger button reads "VS Code"

#### Scenario: `$EDITOR` env var names an editor not in the installed set — fall through to first-installed

- **GIVEN** `$EDITOR=cursor` is set but Cursor is NOT installed
- **AND** VS Code IS installed
- **WHEN** the Preferences tab is first mounted
- **THEN** the first-paint hook MUST NOT resolve to `"cursor"`
- **AND** resolves to `"vscode"` (the first installed editor in declaration order)

