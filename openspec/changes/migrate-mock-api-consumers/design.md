## Design

### Approach

Extract the genuine shared logic (message parsing + tool normalization) from `mock-api.ts` into a typed helper module, then port 6 consumer files from `api.agents.*` wrappers to direct `trpc.chats.*` calls. The F1/F2 boundary sites remain untouched.

### Architecture Impact

**Removes one unnecessary abstraction layer.** Currently:
```
Consumer → api.agents.* (mock-api.ts) → trpc.chats.* (tRPC client) → IPC → chats router → Drizzle
```

After Phase 2:
```
Consumer → trpc.chats.* (tRPC client) → IPC → chats router → Drizzle
                ↓ (for queries with messages)
         message-parser.ts helpers
```

### Message Parser Module Design

**Location:** `src/renderer/lib/message-parser.ts`

```typescript
import { normalizeCodexToolPart } from "@/shared/codex-tool-normalizer"

// Parse JSON-encoded messages from subChat.messages
export function parseSubChatMessages(messagesJson: string | null): Message[]

// Normalize tool parts: old tool-invocation → tool-{toolName} + MCP wrapper
export function normalizeMessageParts(messages: Message[]): Message[]

// Combined: parse + normalize (convenience)
export function parseAndNormalizeSubChatMessages(messagesJson: string | null): Message[]

// Transform a full chat response: apply parsing to all subChats
export function parseAndNormalizeChat(chat: ChatResponse): ChatWithParsedMessages
```

The transformation pipeline from `mock-api.ts` lines 50-120 moves here verbatim, then gets typed with proper interfaces.

### Consumer Migration Patterns

**Pattern A — Query-only (no message parsing):**
Used by: `agents-subchats-sidebar.tsx` (list), `archive-popover.tsx` (archived list)
```typescript
// Direct replacement — no transform needed
const { data } = trpc.chats.list.useQuery({})
```

**Pattern B — Query with message parsing:**
Used by: `active-chat.tsx`, `sub-chat-selector.tsx`, `mobile-chat-header.tsx`, `subchats-quick-switch-dialog.tsx`
```typescript
const { data: rawChat } = trpc.chats.get.useQuery({ id: chatId })
const chat = useMemo(
  () => rawChat ? parseAndNormalizeChat(rawChat) : null,
  [rawChat]
)
```

**Pattern C — Mutations (pass-through):**
Used by: `active-chat.tsx`, `agents-subchats-sidebar.tsx`
```typescript
// Input key change: chatId → id (if applicable)
const mutation = trpc.chats.archive.useMutation()
```

### F1 Boundary Preservation

The `active-chat.tsx` file has dual data sources:
1. **Local mode:** `trpc.chats.get` → Drizzle → camelCase
2. **Sandbox mode (F1):** `remoteTrpc.agents.getAgentChat` → upstream → snake_case

Phase 2 migrates ONLY the local mode path. The sandbox mode path (lines ~5765-5793) reads `remoteAgentChat.created_at` / `updated_at` — these are upstream DTOs and MUST remain snake_case per the upstream boundary rule.

### Electron-Specific Constraints

None — this is a renderer-only refactor. No main process, IPC, or preload changes.

### Verification Strategy

1. **Type checking:** `bun run ts:check` — expect error count to decrease
2. **Build:** `bun run build` — renderer bundle builds correctly
3. **Tests:** `bun test` — all regression guards pass
4. **New regression test:** Assert no consumer file imports from `mock-api.ts` for migrated procedures
5. **Functional testing:** Create chat → add sub-chat → sort by recency → rename → archive → restore
6. **Message rendering:** Verify code blocks with tool invocations render correctly (exercises message parser)
