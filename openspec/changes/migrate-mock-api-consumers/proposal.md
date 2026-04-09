## Why

Phase 1 (`retire-mock-api-translator`, archived 2026-04-09) eliminated the `createdAt → created_at` timestamp fossil from `mock-api.ts`. But the mock-api bridge layer itself remains — 6 consumer files still import `api.agents.*` wrappers that do nothing but pass through to `trpc.chats.*`. This adds indirection without value, leaks `any` types into the renderer, and prevents Drizzle schema changes from being caught at compile time in consumers.

The one piece of genuine complexity in `mock-api.ts` is the **JSON message-parsing pipeline**: parsing sub-chat message strings, normalizing tool-invocation parts, and running `normalizeCodexToolPart()` for Codex MCP wrapper shapes. This logic needs to be **extracted into typed helpers**, not deleted.

This is Phase 2 of 3:
- **Phase 1** (done): Remove timestamp fossil
- **Phase 2** (this change): Port consumers to `trpc.chats.*`, extract message-parsing helpers
- **Phase 3** (future): Delete `mock-api.ts` entirely after F1/F2 stubs are replaced

## What Changes

**New file: `src/renderer/lib/message-parser.ts`** (~100-150 lines)
- Extract `parseSubChatMessages(messagesJson)` — parses JSON-encoded message arrays
- Extract `normalizeSubChatMessageParts(messages)` — tool-invocation → `tool-{toolName}` migration, MCP wrapper normalization via `normalizeCodexToolPart()`
- Export combined `parseAndNormalizeSubChatMessages()` for convenience
- Fully typed with proper `Message` / `MessagePart` interfaces

**6 consumer files migrated from `api.agents.*` to `trpc.chats.*`:**

| File | Current Import | Migration Pattern | Complexity |
|------|---------------|-------------------|-----------|
| `active-chat.tsx` | `api.agents.getAgentChat.useQuery()` + mutations | Query + message parsing helper + mutations | **HIGH** — largest consumer, F1 boundary must be preserved |
| `agents-subchats-sidebar.tsx` | `api.agents.getAgentChats.useQuery()` + mutations | Query + mutations | **MEDIUM-HIGH** — 8 usage sites |
| `sub-chat-selector.tsx` | `api.agents.getAgentChat.useQuery()` | Query only | **MEDIUM** — 5 timestamp sort sites |
| `mobile-chat-header.tsx` | `api.agents.getAgentChat.useQuery()` | Query only | **MEDIUM** — 3 sort/display sites |
| `subchats-quick-switch-dialog.tsx` | `api.agents.getAgentChat.useQuery()` | Query only | **LOW** — 1 sort site |
| `archive-popover.tsx` | `api.agents.getArchivedChats.useQuery()` | Query only (archived) | **LOW** — archived list |

**Input key mapping:**
- `{ chatId }` → `{ id }` for `trpc.chats.get`
- All mutations: pass-through (keys already match)

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
