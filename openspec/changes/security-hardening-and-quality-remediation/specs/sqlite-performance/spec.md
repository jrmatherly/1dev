## ADDED Requirements

### Requirement: Foreign key indexes
The Drizzle schema SHALL declare indexes on foreign key columns `chats.projectId` and `subChats.chatId` to optimize JOIN and WHERE queries.

#### Scenario: Index exists after migration
- **WHEN** `bun run db:generate` is run after adding index declarations
- **THEN** the generated migration includes CREATE INDEX statements for `chats.projectId` and `subChats.chatId`

#### Scenario: Queries use index
- **WHEN** a query filters chats by `projectId` or subChats by `chatId`
- **THEN** SQLite uses the index (verifiable via EXPLAIN QUERY PLAN)

### Requirement: SQLite pragmas for performance
The database initialization SHALL set SQLite pragmas for improved performance: `busy_timeout=5000`, `synchronous=NORMAL`, `cache_size=-8000` (8MB).

#### Scenario: Pragmas applied at startup
- **WHEN** the application opens the SQLite database
- **THEN** the pragmas are set before any other database operations

#### Scenario: Concurrent access handled
- **WHEN** two operations attempt to write simultaneously
- **THEN** the second operation waits up to 5000ms (busy_timeout) instead of failing immediately

### Requirement: Feature flag cache
The `getFlag()` function SHALL read from an in-memory cache loaded at startup, not from SQLite on every call. The cache SHALL be invalidated when `setFlag()` or `clearFlag()` is called.

#### Scenario: Cached read performance
- **WHEN** `getFlag("someFlag")` is called after startup
- **THEN** the result is returned from memory without a SQLite query

#### Scenario: Cache invalidation on write
- **WHEN** `setFlag("someFlag", "newValue")` is called
- **THEN** subsequent `getFlag("someFlag")` returns `"newValue"` from the updated cache
