## Tasks

### Task 1: Extract message-parsing helpers
- Create `src/renderer/lib/message-parser.ts`
- Extract `parseSubChatMessages()` from `mock-api.ts` lines 50-80 (JSON.parse + error handling)
- Extract `normalizeMessageParts()` from `mock-api.ts` lines 80-120 (tool-invocation → tool-{toolName}, `normalizeCodexToolPart()` MCP wrapper, ACP title-based type extraction)
- Export combined `parseAndNormalizeSubChatMessages()` and `parseAndNormalizeChat()`
- Add proper TypeScript types for `Message`, `MessagePart` interfaces
- Import `normalizeCodexToolPart` from `@/shared/codex-tool-normalizer`
- **Verify:** Unit test the extraction against known message payloads (tool-invocation parts, MCP wrappers, ACP title-based types)
- **Files:** `src/renderer/lib/message-parser.ts` (new)

### Task 2: Migrate active-chat.tsx (HIGH complexity)
- Replace `import { api } from "./mock-api"` with `import { trpc } from "@/lib/trpc"` + `import { parseAndNormalizeChat } from "@/lib/message-parser"`
- Replace `api.agents.getAgentChat.useQuery({ chatId })` with `trpc.chats.get.useQuery({ id: chatId })` + `useMemo` wrapper for message parsing
- Replace all mutation calls: `api.agents.renameChat` → `trpc.chats.rename`, etc.
- **DO NOT TOUCH** F1 boundary code (lines ~5765-5793, `chatSourceMode === "sandbox"` blocks, `remoteAgentChat.*` reads)
- **Verify:** Local mode chat creates, renames, archives correctly. Sandbox mode code path preserved.
- **Files:** `src/renderer/features/agents/main/active-chat.tsx`

### Task 3: Migrate agents-subchats-sidebar.tsx (MEDIUM-HIGH)
- Replace `api.agents.getAgentChats.useQuery()` with `trpc.chats.list.useQuery({})`
- Replace all mutation calls (archive, rename, update mode, etc.)
- Update 8 usage sites: sort callbacks (lines 381-382, 821-822), construction (line 798), display (lines 136, 1356, 1719)
- **Files:** `src/renderer/features/sidebar/agents-subchats-sidebar.tsx`

### Task 4: Migrate remaining 4 consumer files (LOW-MEDIUM)
- **sub-chat-selector.tsx:** Replace `api.agents.getAgentChat.useQuery()` → `trpc.chats.get.useQuery()` + message parser. 5 timestamp sort sites.
- **mobile-chat-header.tsx:** Replace query. 3 sort/display sites.
- **subchats-quick-switch-dialog.tsx:** Replace query. 1 sort site.
- **archive-popover.tsx:** Replace `api.agents.getArchivedChats.useQuery()` → `trpc.chats.listArchived.useQuery({})`
- **Files:** 4 files in `src/renderer/features/`

### Task 5: Clean up mock-api.ts
- Remove the 10 migrated procedure wrappers (getAgentChats, getAgentChat, getArchivedChats, archiveChat, restoreChat, renameChat, renameSubChat, generateSubChatName, updateSubChatMode, archiveBatch)
- Keep all web-only stubs (getUserTeams, getUserBalance, getRepositoriesWithStatus, etc.) — these are F-entry-dependent
- Keep the `api` export object structure with stubs for backward compatibility during Phase 3
- Remove the message-parsing pipeline from mock-api.ts (now in message-parser.ts)
- **Files:** `src/renderer/lib/mock-api.ts`

### Task 6: Add regression guards
- Add test to `tests/regression/` verifying no consumer file imports mock-api procedures that were migrated
- Pattern: grep for `api.agents.getAgentChat` / `api.agents.getAgentChats` / `api.agents.archiveChat` etc. in the 6 migrated files — expect 0 matches
- **Files:** `tests/regression/mock-api-consumer-migration.test.ts` (new)

### Task 7: Run quality gates
- `bun run ts:check` — expect error count to decrease from baseline (fewer `any` leaks)
- `bun run build` — verify renderer bundle builds correctly
- `bun test` — all regression guards pass (including new one from Task 6)
- `bun audit` — check for new advisories
- `cd docs && bun run build` — verify docs site
- Update `.claude/.tscheck-baseline` if error count changed

### Task 8: Functional testing
- Create new chat → verify data appears correctly
- Add sub-chat → verify sub-chat creation
- Sort sub-chats by recency → verify timestamp ordering works
- Rename chat and sub-chat → verify rename flows
- Archive chat → verify archive
- Restore archived chat → verify restore
- Open chat with tool invocations (Claude, Codex) → verify message rendering with tool parts
- Open diff view → verify code highlighting with parsed messages

### Task 9: Update documentation
- Update `docs/operations/roadmap.md` — move "mock-api.ts Phase 2" from P2 to "Recently Completed"
- Update `openspec/specs/renderer-data-access/spec.md` — add MODIFIED requirements reflecting direct tRPC access
- Note Phase 3 scope in roadmap: delete mock-api.ts entirely after F1/F2 stubs replaced
