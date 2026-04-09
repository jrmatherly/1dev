## 1. Schema and Migration

- [x] 1.1 Add `featureFlagOverrides` sqliteTable declaration to `src/main/lib/db/schema/index.ts` with columns `key` (text primary key), `value` (text not null), `updatedAt` (integer timestamp mode, default now)
- [x] 1.2 Add `FeatureFlagOverride` and `NewFeatureFlagOverride` type exports from the same file using Drizzle's `$inferSelect` / `$inferInsert` pattern
- [x] 1.3 Run `bun run db:generate` to produce a new `drizzle/NNNN_add_feature_flag_overrides.sql` migration
- [x] 1.4 Inspect the generated SQL to confirm it creates the table correctly, matches the snake_case column naming Drizzle emits, and has no unexpected side effects on the existing 6 tables

## 2. Core Module

- [x] 2.1 Create `src/main/lib/feature-flags.ts` with the `FLAG_DEFAULTS` const map containing `enterpriseAuthEnabled: false`, `voiceViaLiteLLM: false`, `changelogSelfHosted: false`, `automationsSelfHosted: false` — all declared with `as const` for literal type inference
- [x] 2.2 Export a `FeatureFlagKey` type alias for `keyof typeof FLAG_DEFAULTS`
- [x] 2.3 Implement `getFlag<K extends FeatureFlagKey>(key: K): typeof FLAG_DEFAULTS[K]` that queries the overrides table, parses the JSON `value` on hit, and returns the default on miss
- [x] 2.4 Implement `setFlag<K extends FeatureFlagKey>(key: K, value: typeof FLAG_DEFAULTS[K]): void` that validates the value is JSON-stringifiable and upserts a row via Drizzle's `onConflictDoUpdate`
- [x] 2.5 Implement `clearFlag<K extends FeatureFlagKey>(key: K): void` that deletes the override row
- [x] 2.6 Implement `getAllFlagsWithSources()` returning an array of `{ key, value, source, updatedAt }` objects, one per key in `FLAG_DEFAULTS`, with `source` set to `"override"` when a row exists and `"default"` otherwise

## 3. tRPC Router

- [x] 3.1 Create `src/main/lib/trpc/routers/feature-flags.ts` exposing `list`, `get`, `set`, `clear` procedures using the existing `publicProcedure` and `router` helpers from the codebase's tRPC setup
- [x] 3.2 Validate `set` input with a Zod schema that accepts `{ key: string; value: z.unknown() }` — the runtime type check happens inside `setFlag` because Zod cannot express "value matches the type of this key"
- [x] 3.3 Mount the new router in `createAppRouter` at `src/main/lib/trpc/routers/index.ts` alongside the existing 20 routers — add the import and the router object entry
- [x] 3.4 Verify the tRPC type inference in the renderer picks up the new router by running `bun run ts:check` (any consumer of `AppRouter` should typecheck without changes to other files)

## 4. Regression Guards

- [x] 4.1 Create `tests/regression/feature-flags-shape.test.ts` asserting that the generated migration file exists under `drizzle/` and contains `CREATE TABLE` for `feature_flag_overrides`
- [x] 4.2 Assert that `src/main/lib/feature-flags.ts` exports `FLAG_DEFAULTS`, `getFlag`, `setFlag`, `clearFlag`, `getAllFlagsWithSources` (grep-based structural check, no runtime DB needed)
- [x] 4.3 Assert that `FLAG_DEFAULTS` contains the four required keys (`enterpriseAuthEnabled`, `voiceViaLiteLLM`, `changelogSelfHosted`, `automationsSelfHosted`) — these are load-bearing for downstream gates and must not be renamed silently
- [x] 4.4 Assert that `createAppRouter` in `src/main/lib/trpc/routers/index.ts` mounts the `featureFlags` router

## 5. Verification

- [x] 5.1 Run `bun test` and confirm all regression tests pass (existing 7 + new guard)
- [x] 5.2 Run `bun run ts:check` and confirm error count is unchanged (baseline 92)
- [x] 5.3 Run `bun run build` and confirm exit 0
- [x] 5.4 Run `bunx @fission-ai/openspec@1.2.0 validate add-feature-flag-infrastructure --strict --no-interactive` and confirm the change passes strict validation

## 6. Documentation

- [x] 6.1 Update CLAUDE.md to mark Phase 0 hard gate #12 as complete and add a brief note about `src/main/lib/feature-flags.ts` being the single source of truth for feature flags
- [x] 6.2 Update the `.scratchpad/upstream-features-inventory.md` tracking of Phase 0 gates if applicable (the inventory is gitignored so this is session-local only)
