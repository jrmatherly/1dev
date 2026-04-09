## 1. Extract message-parsing helpers

- [ ] 1.1 Create `src/renderer/lib/message-parser.ts` (~150-200 lines)
- [ ] 1.2 Extract `parseSubChatMessages()` — JSON.parse with error handling (mock-api.ts lines 50-53)
- [ ] 1.3 Extract `tool-invocation` → `tool-{toolName}` + state normalization (lines 59-67)
- [ ] 1.4 Extract Codex MCP wrapper via `normalizeCodexToolPart()` + state normalization (lines 70-97)
- [ ] 1.5 Extract ACP title-based type extraction with `acpVerbMap` (lines 98-200)
- [ ] 1.6 Extract generic state normalization for remaining tool parts (lines 201-218)
- [ ] 1.7 Export `parseAndNormalizeSubChatMessages()` and `parseAndNormalizeChat()`
- [ ] 1.8 Decide how to handle `sandbox_id: null`, `meta: null`, `stream_id: null` injection — keep in helper or remove based on consumers
- [ ] 1.9 Add proper TypeScript types for `Message`, `MessagePart` interfaces
- [ ] 1.10 Import `normalizeCodexToolPart` from `@/shared/codex-tool-normalizer`
- [ ] 1.11 Unit test the extraction against known message payloads

## 2. Migrate active-chat.tsx (VERY HIGH complexity)

- [ ] 2.1 Replace `import { api } from "./mock-api"` with `import { trpc } from "@/lib/trpc"` + `parseAndNormalizeChat` import
- [ ] 2.2 Replace `api.agents.getAgentChat.useQuery({ chatId })` → `trpc.chats.get.useQuery({ id: chatId })` + `useMemo` message parser
- [ ] 2.3 Replace 5 remaining `api.agents.*` mutations with `trpc.chats.*` equivalents (apply `{ chatId }` → `{ id }` key mapping)
- [ ] 2.4 Migrate 13 `utils.agents.*` cache manipulation sites to `utils.chats.*` — `invalidate`, `setData`, etc.
- [ ] 2.5 Change `const utils = api.useUtils()` → `const utils = trpc.useUtils()`
- [ ] 2.6 Update dependency array references (2 sites)
- [ ] 2.7 PRESERVE F1 boundary code (lines ~5765-5793, `chatSourceMode === "sandbox"` blocks, `remoteAgentChat.*` reads)
- [ ] 2.8 Verify local mode chat creates, renames, archives, optimistic updates all work
- [ ] 2.9 Verify sandbox mode code path still preserved

## 3. Migrate agents-subchats-sidebar.tsx (MEDIUM)

- [ ] 3.1 Replace `api.agents.getAgentChats.useQuery()` with `trpc.chats.list.useQuery({})` (note: `list` takes `{ projectId?: string }`)
- [ ] 3.2 Replace `api.agents.renameSubChat.useMutation()` with `trpc.chats.renameSubChat.useMutation()` + `{ subChatId }` → `{ id }` mapping

## 4. Migrate sub-chat-selector.tsx (MEDIUM)

- [ ] 4.1 Replace `api.agents.getAgentChat.useQuery({ chatId })` → `trpc.chats.get.useQuery({ id: chatId })` + message parser
- [ ] 4.2 Replace `api.agents.renameSubChat.useMutation()` → `trpc.chats.renameSubChat.useMutation()` + key mapping

## 5. Migrate agents-content.tsx (MEDIUM — stub dependency decision)

- [ ] 5.1 Replace `api.agents.getAgentChats.useQuery()` and `api.agents.getAgentChat.useQuery()` → direct `trpc.chats.*`
- [ ] 5.2 Decide how to handle `api.teams.getUserTeams.useQuery()` stub: (a) inline, (b) keep import, or (c) remove if dead

## 6. Migrate agents-file-mention.tsx (MEDIUM — tRPC bridge)

- [ ] 6.1 Replace `api.github.searchFiles.useQuery()` → `trpc.files.search.useQuery()` with argument translation
- [ ] 6.2 Replicate argument mapping from `{ projectPath, query, limit }` to the tRPC procedure input

## 7. Clean up agent-diff-view.tsx dead import

- [ ] 7.1 Remove dead `import { api } from "..."` (file imports mock-api but has 0 `api.*` call sites)

## 8. Clean up mock-api.ts

- [ ] 8.1 Remove the 10 migrated procedure wrappers (getAgentChats, getAgentChat, getArchivedChats, archiveChat, restoreChat, renameChat, renameSubChat, generateSubChatName, updateSubChatMode, archiveBatch)
- [ ] 8.2 Keep web-only stubs (getUserTeams, getUserBalance, getRepositoriesWithStatus, etc.) — F-entry-dependent
- [ ] 8.3 Keep the `api` export object structure with stubs for backward compatibility during Phase 3
- [ ] 8.4 Remove the message-parsing pipeline from mock-api.ts (now in message-parser.ts)

## 9. Add regression guards

- [ ] 9.1 Create `tests/regression/mock-api-consumer-migration.test.ts`
- [ ] 9.2 Grep for migrated `api.agents.*` procedures in the 6 migrated files — expect 0 matches

## 10. Run quality gates

- [ ] 10.1 Run `bun run ts:check` — expect error count to decrease
- [ ] 10.2 Run `bun run build` — verify renderer bundle builds correctly
- [ ] 10.3 Run `bun test` — all regression guards pass (including new one)
- [ ] 10.4 Run `bun audit` — check for new advisories
- [ ] 10.5 Run `cd docs && bun run build` — verify docs site
- [ ] 10.6 Update `.claude/.tscheck-baseline` if error count changed

## 11. Functional testing

- [ ] 11.1 Create new chat → verify data appears correctly
- [ ] 11.2 Add sub-chat → verify sub-chat creation
- [ ] 11.3 Sort sub-chats by recency → verify timestamp ordering
- [ ] 11.4 Rename chat and sub-chat → verify rename flows
- [ ] 11.5 Archive chat → verify archive
- [ ] 11.6 Restore archived chat → verify restore
- [ ] 11.7 Open chat with tool invocations (Claude, Codex) → verify message rendering with tool parts
- [ ] 11.8 Open diff view → verify code highlighting with parsed messages

## 12. Update documentation

- [ ] 12.1 Update `docs/operations/roadmap.md` — move "mock-api.ts Phase 2" to "Recently Completed"
- [ ] 12.2 Update `openspec/specs/renderer-data-access/spec.md` — add MODIFIED requirements for direct tRPC access
- [ ] 12.3 Note Phase 3 scope in roadmap: delete mock-api.ts entirely after F1/F2 stubs replaced
