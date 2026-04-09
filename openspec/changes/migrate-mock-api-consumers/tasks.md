## Tasks

### Task 1: Extract message-parsing helpers
- Create `src/renderer/lib/message-parser.ts` (~150-200 lines)
- Extract ALL 5 normalization stages from `mock-api.ts` lines 50-234:
  1. `parseSubChatMessages()` — JSON.parse with error handling (lines 50-53)
  2. `tool-invocation` → `tool-{toolName}` + state normalization (lines 59-67)
  3. Codex MCP wrapper via `normalizeCodexToolPart()` + state normalization (lines 70-97)
  4. ACP title-based type extraction with `acpVerbMap` (lines 98-200) — maps `"tool-Read README.md"` → `"tool-Read"` with parsed input
  5. Generic state normalization for remaining tool parts (lines 201-218)
- Export `parseAndNormalizeSubChatMessages()` and `parseAndNormalizeChat()`
- **Decision:** handle `sandbox_id: null`, `meta: null`, `stream_id: null` injection — keep in helper or remove? Check consumers for `=== null` vs `undefined`
- Add proper TypeScript types for `Message`, `MessagePart` interfaces
- Import `normalizeCodexToolPart` from `@/shared/codex-tool-normalizer`
- **Verify:** Unit test the extraction against known message payloads
- **Files:** `src/renderer/lib/message-parser.ts` (new)

### Task 2: Migrate active-chat.tsx (VERY HIGH complexity)
- Replace `import { api } from "./mock-api"` with `import { trpc } from "@/lib/trpc"` + `import { parseAndNormalizeChat } from "@/lib/message-parser"`
- Replace 6 `api.agents.*` query/mutation calls with direct `trpc.chats.*`:
  - `api.agents.getAgentChat.useQuery({ chatId })` → `trpc.chats.get.useQuery({ id: chatId })` + `useMemo` message parser
  - Mutations: apply `{ chatId }` → `{ id }` key mapping for each
- **CRITICAL — Migrate 13 `utils.agents.*` cache manipulation sites:**
  - `utils.agents.getAgentChat.invalidate({ chatId })` → `utils.chats.get.invalidate({ id: chatId })`
  - `utils.agents.getAgentChat.setData({ chatId }, updater)` → `utils.chats.get.setData({ id: chatId }, updater)`
  - `utils.agents.getAgentChats.setData({ teamId }, updater)` → `utils.chats.list.setData({ projectId }, updater)`
  - Update dependency array references (2 sites)
  - Change `const utils = api.useUtils()` → `const utils = trpc.useUtils()`
- **DO NOT TOUCH** F1 boundary code (lines ~5765-5793, `chatSourceMode === "sandbox"` blocks, `remoteAgentChat.*` reads)
- **Verify:** Local mode chat creates, renames, archives, and optimistic updates work correctly. Sandbox mode code path preserved.
- **Files:** `src/renderer/features/agents/main/active-chat.tsx`

### Task 3: Migrate agents-subchats-sidebar.tsx (MEDIUM)
- Replace `api.agents.getAgentChats.useQuery()` with `trpc.chats.list.useQuery({})` — note: `list` takes `{ projectId?: string }`, current mock-api silently drops `teamId`
- Replace `api.agents.renameSubChat.useMutation()` with `trpc.chats.renameSubChat.useMutation()` — key mapping: `{ subChatId }` → `{ id }`
- Only 2 actual `api.agents.*` call sites (file already uses direct `trpc.*` for some operations)
- **Files:** `src/renderer/features/sidebar/agents-subchats-sidebar.tsx`

### Task 4: Migrate sub-chat-selector.tsx (MEDIUM)
- Replace `api.agents.getAgentChat.useQuery({ chatId })` → `trpc.chats.get.useQuery({ id: chatId })` + message parser
- Replace `api.agents.renameSubChat.useMutation()` → `trpc.chats.renameSubChat.useMutation()` — key mapping: `{ subChatId }` → `{ id }`
- Note: this file has BOTH a query AND a mutation (proposal initially said "query only")
- **Files:** `src/renderer/features/agents/ui/sub-chat-selector.tsx`

### Task 5: Migrate agents-content.tsx (MEDIUM — stub dependency decision)
- Replace `api.agents.getAgentChats.useQuery()` and `api.agents.getAgentChat.useQuery()` → direct `trpc.chats.*`
- **Decision required:** `api.teams.getUserTeams.useQuery()` is a mock-api stub returning `{ data: [], isLoading: false }`. Options:
  - (a) Inline the stub return value in the component
  - (b) Keep importing the stub from mock-api (delays full retirement)
  - (c) Remove the usage if `teams` is dead functionality
- **Files:** `src/renderer/features/agents/ui/agents-content.tsx`

### Task 6: Migrate agents-file-mention.tsx (MEDIUM — tRPC bridge)
- Replace `api.github.searchFiles.useQuery()` → `trpc.files.search.useQuery()` with argument translation
- This is a REAL tRPC bridge (not a stub) — mock-api translates `{ projectPath, query, limit }` to the tRPC procedure input. Must replicate argument mapping.
- **Files:** `src/renderer/features/agents/mentions/agents-file-mention.tsx`

### Task 7: Clean up agent-diff-view.tsx dead import (TRIVIAL)
- Remove dead `import { api } from "..."` — file imports mock-api but has 0 `api.*` call sites
- **Files:** `src/renderer/features/agents/ui/agent-diff-view.tsx`

### Task 8: Clean up mock-api.ts
- Remove the 10 migrated procedure wrappers (getAgentChats, getAgentChat, getArchivedChats, archiveChat, restoreChat, renameChat, renameSubChat, generateSubChatName, updateSubChatMode, archiveBatch)
- Keep all web-only stubs (getUserTeams, getUserBalance, getRepositoriesWithStatus, etc.) — these are F-entry-dependent
- Keep the `api` export object structure with stubs for backward compatibility during Phase 3
- Remove the message-parsing pipeline from mock-api.ts (now in message-parser.ts)
- **Files:** `src/renderer/lib/mock-api.ts`

### Task 9: Add regression guards
- Add test to `tests/regression/` verifying no consumer file imports mock-api procedures that were migrated
- Pattern: grep for `api.agents.getAgentChat` / `api.agents.getAgentChats` / `api.agents.archiveChat` etc. in the 6 migrated files — expect 0 matches
- **Files:** `tests/regression/mock-api-consumer-migration.test.ts` (new)

### Task 10: Run quality gates
- `bun run ts:check` — expect error count to decrease from baseline (fewer `any` leaks)
- `bun run build` — verify renderer bundle builds correctly
- `bun test` — all regression guards pass (including new one from Task 6)
- `bun audit` — check for new advisories
- `cd docs && bun run build` — verify docs site
- Update `.claude/.tscheck-baseline` if error count changed

### Task 11: Functional testing
- Create new chat → verify data appears correctly
- Add sub-chat → verify sub-chat creation
- Sort sub-chats by recency → verify timestamp ordering works
- Rename chat and sub-chat → verify rename flows
- Archive chat → verify archive
- Restore archived chat → verify restore
- Open chat with tool invocations (Claude, Codex) → verify message rendering with tool parts
- Open diff view → verify code highlighting with parsed messages

### Task 12: Update documentation
- Update `docs/operations/roadmap.md` — move "mock-api.ts Phase 2" from P2 to "Recently Completed"
- Update `openspec/specs/renderer-data-access/spec.md` — add MODIFIED requirements reflecting direct tRPC access
- Note Phase 3 scope in roadmap: delete mock-api.ts entirely after F1/F2 stubs replaced
