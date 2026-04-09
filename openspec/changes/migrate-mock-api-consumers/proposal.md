## Why

Phase 1 (`retire-mock-api-translator`, archived 2026-04-09) eliminated the `createdAt → created_at` timestamp fossil from `mock-api.ts`. But the mock-api bridge layer itself remains — 6 consumer files still import `api.agents.*` wrappers that do nothing but pass through to `trpc.chats.*`. This adds indirection without value, leaks `any` types into the renderer, and prevents Drizzle schema changes from being caught at compile time in consumers.

The one piece of genuine complexity in `mock-api.ts` is the **JSON message-parsing pipeline**: parsing sub-chat message strings, normalizing tool-invocation parts, and running `normalizeCodexToolPart()` for Codex MCP wrapper shapes. This logic needs to be **extracted into typed helpers**, not deleted.

This is Phase 2 of 3:
- **Phase 1** (done): Remove timestamp fossil
- **Phase 2** (this change): Port consumers to `trpc.chats.*`, extract message-parsing helpers
- **Phase 3** (future): Delete `mock-api.ts` entirely after F1/F2 stubs are replaced

## What Changes

**New file: `src/renderer/lib/message-parser.ts`** (~150-200 lines)
- Extract `parseSubChatMessages(messagesJson)` — parses JSON-encoded message arrays (mock-api.ts lines 50-53)
- Extract `normalizeMessageParts(messages)` — ALL 5 normalization stages from mock-api.ts lines 54-234:
  1. `tool-invocation` → `tool-{toolName}` + state normalization
  2. Codex MCP wrapper normalization via `normalizeCodexToolPart()`
  3. ACP title-based type extraction (the `acpVerbMap` logic mapping `"tool-Read README.md"` → `"tool-Read"`)
  4. Generic state normalization for remaining tool parts
  5. `stream_id: null` injection for sub-chat DTO shape compatibility
- Export combined `parseAndNormalizeSubChatMessages()` and `parseAndNormalizeChat()`
- Fully typed with proper `Message` / `MessagePart` interfaces
- **Decision needed:** `sandbox_id: null` and `meta: null` injection — keep in helper or remove? Consumers may check `=== null` vs `undefined`

**6 consumer files migrated (verified via `grep -rn 'from.*mock-api' src/`):**

| File | Current Usage | Migration Pattern | Complexity |
|------|--------------|-------------------|-----------|
| `active-chat.tsx` | 6 `api.agents.*` calls + **13 `utils.agents.*` cache manipulation sites** + mutations | Query + message parser + mutations + useUtils migration | **VERY HIGH** — F1 boundary, cache layer |
| `agents-subchats-sidebar.tsx` | `api.agents.getAgentChats.useQuery()` + `renameSubChat` mutation | Query + mutation (2 `api.*` sites; already uses direct `trpc.*` for some calls) | **MEDIUM** |
| `sub-chat-selector.tsx` | `api.agents.getAgentChat.useQuery()` + `renameSubChat.useMutation()` | Query + mutation | **MEDIUM** |
| `agents-content.tsx` | `api.agents.getAgentChats`, `api.agents.getAgentChat`, `api.teams.getUserTeams` (stub) | Query + **stub dependency decision** | **MEDIUM** — must decide how to handle `getUserTeams` stub |
| `agents-file-mention.tsx` | `api.github.searchFiles.useQuery()` | **Real tRPC bridge** to `trpc.files.search` with argument translation | **MEDIUM** — not a simple rename |
| `agent-diff-view.tsx` | Dead import (imports mock-api but has 0 `api.*` call sites) | Remove dead import | **TRIVIAL** |

**Files previously listed that do NOT need migration** (already use direct `trpc.chats.*`):
- `mobile-chat-header.tsx` — no mock-api import
- `subchats-quick-switch-dialog.tsx` — no mock-api import
- `archive-popover.tsx` — no mock-api import

**Input key mapping (NOT pass-through — this is critical):**
- `{ chatId }` → `{ id }` for `trpc.chats.get`, `trpc.chats.archive`, `trpc.chats.restore`, `trpc.chats.rename`
- `{ subChatId }` → `{ id }` for `trpc.chats.renameSubChat`, `trpc.chats.updateSubChatMode`
- `{ chatIds }` → pass-through for `trpc.chats.archiveBatch`
- `trpc.chats.list` takes `{ projectId?: string }` — current mock-api silently drops `teamId` argument

**`useUtils` cache manipulation (CRITICAL — 13 sites in active-chat.tsx):**
- `utils.agents.getAgentChat.invalidate({ chatId })` → `utils.chats.get.invalidate({ id: chatId })`
- `utils.agents.getAgentChat.setData({ chatId }, updater)` → `utils.chats.get.setData({ id: chatId }, updater)`
- `utils.agents.getAgentChats.setData({ teamId }, updater)` → `utils.chats.list.setData({ projectId }, updater)`
- Dependency array references also need updating

**Query migration pattern:**
```typescript
// BEFORE (mock-api wrapper)
const { data: chat } = api.agents.getAgentChat.useQuery({ chatId })
// AFTER (direct tRPC + helper)
const { data: rawChat } = trpc.chats.get.useQuery({ id: chatId })
const chat = useMemo(() => rawChat ? parseAndNormalizeChat(rawChat) : null, [rawChat])
```

**Mutation migration pattern:**
```typescript
// BEFORE
const mutation = api.agents.archiveChat.useMutation()
// AFTER
const mutation = trpc.chats.archive.useMutation()
```

**F1/F2 boundary sites — DO NOT TOUCH:**
- `active-chat.tsx:5765-5793` — reads `remoteAgentChat` (F1 upstream DTO, snake_case)
- `agents-sidebar.tsx:2077-2078` — reads `remoteChats` (F1 upstream list, snake_case)
- `automations-detail-view.tsx:847` — reads F2 execution DTO (snake_case)
- Any code inside `if (chatSourceMode === "sandbox")` blocks

**What stays in `mock-api.ts` (for Phase 3):**
- Web-only feature stubs (`getUserTeams`, `getUserBalance`, `getRepositoriesWithStatus`, etc.)
- GitHub/Claude Code connection stubs
- `agentInvites` stubs
- All of these are F-entry-dependent and will be replaced during F1-F10 restoration

## Capabilities

### New Capabilities
None — internal refactor only.

### Modified Capabilities
- **MODIFIED** `renderer-data-access` — consumers now call `trpc.chats.*` directly instead of `api.agents.*` wrappers

## Impact

**Affected code:**
- `src/renderer/lib/message-parser.ts` — NEW file (message parsing helpers)
- `src/renderer/lib/mock-api.ts` — remove migrated procedure wrappers (keep stubs)
- 6 consumer `.tsx` files — update imports and API calls
- `package.json` — no changes
- Database schema — no changes
- tRPC routers — no changes

**Affected tRPC routers:** None (consumers are migrated TO existing routers, not modifying them)

**Affected database tables:** None

**Risk surface:**
- **Medium risk:** `active-chat.tsx` is the largest and most complex consumer (~5800 lines) with F1 boundary code interleaved. Must preserve boundary sites.
- **Medium risk:** Message-parsing pipeline extraction — must maintain exact behavior including edge cases for tool-invocation normalization
- **Low risk:** Simple query/mutation renames in the other 5 files
- **Low risk:** `normalizeCodexToolPart` in `shared/codex-tool-normalizer.ts` is unchanged — just called from a new location

**Expected type safety improvement:**
- Current TS baseline: ~86 errors
- Expected post-migration: 82-85 errors (fewer `any` leaks from typed tRPC responses)

**No changes to:**
- F1/F2 boundary sites
- Upstream feature catalog (F1-F10)
- Drizzle schema or migrations
- tRPC router definitions
- Zustand sub-chat store (already uses camelCase from Phase 1)
