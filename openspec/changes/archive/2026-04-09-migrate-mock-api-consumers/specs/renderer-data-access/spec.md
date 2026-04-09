## MODIFIED Requirements

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
