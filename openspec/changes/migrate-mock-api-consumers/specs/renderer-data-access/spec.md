## MODIFIED Requirements

### Requirement: Renderer consumers SHALL access chat data via tRPC directly

Chat data consumers in the renderer process SHALL call `trpc.chats.*` procedures directly instead of going through the `api.agents.*` mock-api facade. The mock-api wrapper layer adds no value for local data access.

#### Scenario: Consumer reads chat list via tRPC

- **GIVEN** a renderer component needs the list of chats
- **WHEN** it queries for chat data
- **THEN** it calls `trpc.chats.list.useQuery()` directly
- **AND** it does NOT import from `mock-api.ts`

#### Scenario: Consumer reads single chat with messages via tRPC

- **GIVEN** a renderer component needs a specific chat with parsed messages
- **WHEN** it queries for the chat
- **THEN** it calls `trpc.chats.get.useQuery({ id })` directly
- **AND** it uses `parseAndNormalizeChat()` helper for message parsing

#### Scenario: Consumer performs mutations via tRPC

- **GIVEN** a renderer component needs to archive, rename, or update a chat
- **WHEN** it performs the mutation
- **THEN** it calls the corresponding `trpc.chats.*` mutation directly

### Requirement: Message parsing SHALL be extracted into typed helpers

The JSON message-parsing pipeline (including tool-invocation normalization and `normalizeCodexToolPart()`) SHALL be available as typed helper functions rather than embedded in `mock-api.ts`.

#### Scenario: Message parsing produces typed output

- **GIVEN** a sub-chat has JSON-encoded messages
- **WHEN** `parseAndNormalizeSubChatMessages()` is called
- **THEN** it returns a typed `Message[]` array with normalized tool parts

### Requirement: F1/F2 boundary sites SHALL remain unchanged

Data access patterns for upstream (F1/F2) DTOs SHALL NOT be modified by this migration. Code inside `chatSourceMode === "sandbox"` blocks and `remoteTrpc.*` calls MUST preserve snake_case field access.

#### Scenario: F1 sandbox mode preserves upstream DTO shape

- **GIVEN** `active-chat.tsx` is in sandbox mode (F1 boundary)
- **WHEN** it reads `remoteAgentChat`
- **THEN** it accesses `created_at` and `updated_at` (snake_case, upstream DTO)
- **AND** the migration does NOT alter this code path
