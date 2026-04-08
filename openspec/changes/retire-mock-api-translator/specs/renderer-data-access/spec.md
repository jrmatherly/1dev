## ADDED Requirements

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
- **AND** the new fossil is tracked in `.scratchpad/upstream-features-inventory.md` under whichever F-entry it belongs to

### Requirement: Phase 1 explicitly does not retire `mock-api.ts`

The `mock-api.ts` file SHALL continue to exist after this change is implemented. This requirement exists to make the Phase 1 vs Phase 2 boundary explicit and prevent overreach during implementation.

The file's responsibilities after Phase 1 are reduced to:

- Wrapping `trpc.chats.*` calls with `useMemo`-based transformation for the `normalizeCodexToolPart`, JSON message parsing, and `tool-invocation` migration logic that lives inside `getAgentChat`
- Stubbing upstream-only procedures (`getUserTeams`, `getUserBalance`, `createBillingPortalSession`, `getRepositoriesWithStatus`, `getOrCreateInviteCode`, etc.) for renderer consumers that have not yet been ported
- Preserving the `sandbox_id: null`, `stream_id: null`, `meta: null` fossil fields on the chat-shape objects (these are F1 / upstream-feature fossils tracked separately and not part of this change)

The file's responsibilities that are REMOVED by this change:

- Translating `createdAt` → `created_at` and `updatedAt` → `updated_at` for chat and sub-chat objects

#### Scenario: A consumer file is ported to use `trpc.chats.*` directly

- **WHEN** a future Phase 2 proposal ports a consumer file from `import { api } from ".../mock-api"` to `import { trpc } from ".../trpc"` directly
- **THEN** the consumer's existing `chat.createdAt` / `chat.updatedAt` reads continue to work without modification
- **AND** no further fossil-removal is needed in `mock-api.ts` for that consumer

#### Scenario: Phase 2 has not yet been implemented

- **WHEN** a developer reviews `mock-api.ts` after Phase 1 ships but before Phase 2 begins
- **THEN** the file is still 657 LOC (minus the 6 deleted timestamp-mapping lines)
- **AND** the file still contains the upstream-feature stubs and the `normalizeCodexToolPart` adapter logic
- **AND** the CLAUDE.md "Known Security Gaps & Footguns" deprecation warning still applies, with a note pointing at the Phase 2 proposal as the next step
