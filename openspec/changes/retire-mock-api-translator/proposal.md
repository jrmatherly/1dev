## Why

The `src/renderer/lib/mock-api.ts` file is a 657-line untyped facade (`AnyObj`/`any` throughout) that exists to make the new typed Drizzle/tRPC backend *look like* the dead 21st.dev REST/tRPC API to renderer-side consumers. Its core mechanism is at lines 230-236:

```typescript
return {
  ...sc,
  created_at: sc.createdAt,   // camelCase Drizzle → snake_case 21st.dev shape
  updated_at: sc.updatedAt,
  stream_id: null,
  // ...
}
```

This shim was reasonable during the initial fork from upstream — it let the renderer keep working without rewriting every consumer the moment the upstream backend was retired. **It is no longer reasonable.** The 1Code codebase has now decoupled from `21st.dev` for all chat/sub-chat data (the producer routers in `src/main/lib/trpc/routers/chats.ts` are 100% camelCase, sourced from Drizzle), and the only thing forcing the snake_case naming is this translator. Every consumer reads off `any` types because the translator's output is untyped, which means:

- **TypeScript cannot catch field-name typos** at compile time. The five `Property 'updated_at' does not exist. Did you mean 'updatedAt'?` errors that surfaced in `bun run ts:check` exist *because* a few sites accidentally fell back to the Drizzle row shape and tsgo could see the mismatch — every other consumer still uses the snake_case shape on `any` and gets no compile-time check at all.
- **Schema changes silently break consumers.** When `chats.updatedAt` was tightened from `Date` to `Date | null` in the Drizzle schema, the consumer code at `agents-content.tsx:341` that read `b.updated_at` (which the `any` cast made return `Date | null` at runtime) silently produced `NaN.getTime()` for any never-updated chat, breaking sort order. The typed call sites would have flagged this as a nullability error at compile time.
- **CLAUDE.md already flags `mock-api.ts` as DEPRECATED** ("Known Security Gaps & Footguns" §) but the deprecation has stalled because nobody has scoped the migration. Six files in `src/renderer/features/agents/` import it and would all need to migrate together, which is a daunting all-or-nothing proposition.

Beyond the timestamps, the file also stubs out **upstream-only features** that no longer exist (`getUserTeams`, `getUserBalance`, `createBillingPortalSession`, `getRepositoriesWithStatus`, `getOrCreateInviteCode`, ~20 more) and mixes those in with **real local logic** that genuinely needs to live somewhere (the `normalizeCodexToolPart` import, the JSON message-parsing pipeline, the legacy `tool-invocation` → `tool-{toolName}` migration). Conflating these three concerns — fossil translation, dead-feature stubs, and real shared logic — is what makes the file feel impossible to retire.

This proposal **decomposes the retirement into three phases** so each phase has a bounded scope, a clear acceptance criterion, and an independent risk profile. Phase 1 (the only phase this proposal implements) is the surgical fix: eliminate the snake_case timestamp fossil in `getAgentChat`'s sub-chat translator and the parallel sites in 8 consumer files plus the sub-chat Zustand store. Phase 2 (a follow-up proposal) extracts the real shared logic into typed helpers and ports the 6 consumer files to use `trpc.*` directly for chat data. Phase 3 (a third follow-up proposal) deletes `mock-api.ts` entirely once consumers no longer reference it.

This is a Strangler Fig retirement, not a big-bang refactor. After Phase 1 ships, `mock-api.ts` still exists, still translates `created_at`/`updated_at`/`stream_id` for consumers that haven't been ported yet — but the *new* shape it returns is camelCase, which is what consumers will already be on. Phase 1 unblocks Phase 2 by removing the most tangled and consumer-rich source of fossil drift.

## What Changes

Phase 1 scope only. Phases 2 and 3 are explicitly out of scope and will be tracked as separate proposals.

- **REMOVE** the camelCase → snake_case timestamp translation in `src/renderer/lib/mock-api.ts` at lines 230-236 of the `getAgentChat.useQuery` adapter. Specifically, delete the `created_at: sc.createdAt` and `updated_at: sc.updatedAt` mapping lines so the sub-chat objects emerge with their original camelCase keys (`createdAt: Date | null`, `updatedAt: Date | null`).
- **REMOVE** the matching `created_at`/`updated_at` fields from any other return-shape sites inside `mock-api.ts` that mirror the same fossil (`getAgentChats`, `getArchivedChats`, and the `utils` block at lines 442-512). Each site's existing return shape stays — only the snake_case timestamp keys are removed.
- **UPDATE** all 8 consumer files to read camelCase timestamp fields:
  - `src/renderer/features/agents/main/active-chat.tsx` — at least 12 sites including the agentSubChats type cast at lines 5836-5844, the parent-chat sort callbacks at lines 4321-4325, the addToAllSubChats payload at lines 3760-3771, and the stream-status comparison helpers at lines 6767-6810
  - `src/renderer/features/agents/ui/agents-content.tsx` — type literal at line 1067 currently declaring `updated_at: Date` (must become `updatedAt: Date | null` to match the Drizzle row) and any remaining sort sites
  - `src/renderer/features/agents/ui/sub-chat-selector.tsx` — 5 sites at lines 96, 306-307, 568-569
  - `src/renderer/features/agents/ui/mobile-chat-header.tsx` — 3 sites at lines 94-95, 160
  - `src/renderer/features/agents/ui/archive-popover.tsx` — 1 site at line 351 currently doing `updatedAt: chat.updated_at` reverse-translation (becomes a no-op, can be removed entirely)
  - `src/renderer/features/agents/components/subchats-quick-switch-dialog.tsx` — 1 site at line 42
  - `src/renderer/features/agents/components/agents-quick-switch-dialog.tsx` — type declaration at line 17
  - `src/renderer/features/sidebar/agents-subchats-sidebar.tsx` — call sites that read sub-chat timestamps
- **UPDATE** `src/renderer/features/agents/stores/sub-chat-store.ts`:
  - Type definition at lines 13-17 changes `created_at?: string` and `updated_at?: string` to `createdAt?: string | null` and `updatedAt?: string | null`
  - State update at line 364 changes `{ ...sc, updated_at: newTimestamp }` to `{ ...sc, updatedAt: newTimestamp }`
  - **ADD** a Zustand `persist` migration at the store's persist config that maps any persisted localStorage entries with `created_at`/`updated_at` keys to the new `createdAt`/`updatedAt` shape on first load. This is load-bearing — without it, every existing user loses their sub-chat list ordering on the first launch after this change deploys
- **ADD** regression guard test at `tests/regression/mock-api-no-snake-timestamps.test.ts` asserting that `src/renderer/lib/mock-api.ts` does not contain the substrings `created_at:` or `updated_at:` (grep-based structural check). This guard prevents accidental re-introduction of the fossil during merges or future edits
- **ADD** the `renderer-data-access` capability to the OpenSpec specs directory, with the requirements documented in `specs/renderer-data-access/spec.md` of this change

**Out of scope (tracked for follow-up proposals):**

- Migrating consumer files to use `trpc.chats.*` directly instead of `api.agents.*` (Phase 2)
- Extracting `normalizeCodexToolPart` and the JSON message-parsing pipeline into typed helpers (Phase 2)
- Deleting `mock-api.ts` entirely (Phase 3)
- Removing `mock-api.ts`'s translation of `sandbox_id: null` and `stream_id: null` and `meta: null` for sub-chat objects — these are F1/upstream feature fossils tracked separately in `.scratchpad/upstream-features-inventory.md`
- Adjusting any of the upstream-only feature stubs (`getUserTeams`, `getUserBalance`, F1/F3 GitHub installations, etc.) — these are coupled to the F-entries in the upstream features inventory and have their own restoration roadmap
- Touching `src/renderer/lib/remote-types.ts` — that file describes the *external* upstream API contract and its snake_case shape is a faithful representation of the dead 21st.dev shape, not a translator artifact

## Capabilities

### New Capabilities

- `renderer-data-access`: The renderer's contract for reading chat and sub-chat data from the local Drizzle backend via tRPC. This capability formalizes the convention that timestamp fields in chat/sub-chat objects are camelCase (`createdAt`, `updatedAt`) end-to-end from the SQLite column through Drizzle, tRPC, and the renderer consumers, with no translation layer in between. The capability does not (yet) cover the broader question of whether `mock-api.ts` should exist at all — that is the subject of the Phase 2 and Phase 3 follow-up proposals.

### Modified Capabilities

None. There are no existing OpenSpec specs touching renderer data access (the project is still establishing its OpenSpec footprint — only `feature-flags` exists from the parallel `add-feature-flag-infrastructure` change).

## Impact

**Affected code:**

- Modified: `src/renderer/lib/mock-api.ts` (~−6 LOC: removal of the timestamp mapping lines)
- Modified: `src/renderer/features/agents/main/active-chat.tsx` (~12 sites — see `tasks.md` for the full list)
- Modified: `src/renderer/features/agents/ui/agents-content.tsx` (~3 remaining sites; 4 already fixed in commit `df421a8`)
- Modified: `src/renderer/features/agents/ui/sub-chat-selector.tsx` (5 sites)
- Modified: `src/renderer/features/agents/ui/mobile-chat-header.tsx` (3 sites)
- Modified: `src/renderer/features/agents/ui/archive-popover.tsx` (1 site, deletes a reverse-translation)
- Modified: `src/renderer/features/agents/components/subchats-quick-switch-dialog.tsx` (1 site)
- Modified: `src/renderer/features/agents/components/agents-quick-switch-dialog.tsx` (1 type declaration)
- Modified: `src/renderer/features/sidebar/agents-subchats-sidebar.tsx` (estimated 2-3 sites)
- Modified: `src/renderer/features/agents/stores/sub-chat-store.ts` (~10 LOC: type rename + persist migration)
- New file: `tests/regression/mock-api-no-snake-timestamps.test.ts` (~30 LOC)
- New file: `openspec/changes/retire-mock-api-translator/specs/renderer-data-access/spec.md` (the delta spec — already created as part of this proposal)

**Affected APIs:** None at the tRPC layer. All tRPC procedures are unchanged. The only API change is the `mock-api.ts` shim's return shape, which becomes camelCase-only — and the only callers of that shim are the 8 files this change updates.

**Dependencies:** None. Uses existing `drizzle-orm`, `zustand`, `react-query` — all already in `package.json`.

**Breaking changes:** None at the runtime contract level for end users — the SQLite database column names do not change (Drizzle preserves the snake_case SQL columns), the persisted Zustand state migrates forward via the new persist migration, and the on-disk SQLite database is untouched. The change *is* breaking at the source-code level for any future merge from upstream that would re-introduce snake_case consumer code — that's the point of the regression guard.

**Type-safety improvements (the primary win):**

- All 8 consumer files start reading off the proper Drizzle row type (`createdAt: Date | null`) instead of `mock-api`'s untyped `any` output. Future schema changes that affect these fields will surface as compile errors at the consumer site rather than silent runtime bugs.
- The 5 currently-active TypeScript errors in the `R4` category of the ts:check remediation plan resolve as a side effect of this change. Other errors in `R6` that are also `any`-leaks from `mock-api` may resolve too — exact count is not known until the change is implemented.

**Downstream blockers unblocked:**

- Phase 2 of `mock-api` retirement (consumer migration to `trpc.*` direct) — needs the timestamp shape settled before consumers can be safely ported
- The remaining work in `.scratchpad/tscheck-remediation-plan.md` §R4 (currently partially complete via commit `df421a8`)
- Future schema tightening on `chats.updatedAt` / `subChats.createdAt` — currently dangerous because the silent fall-through to `any` would mask nullability errors

**User-visible risk surface:**

- The Zustand `persist` migration is the highest-risk piece of this change. If it is wrong, every existing user loses their sub-chat tab state on first launch after the upgrade. The regression guard test cannot catch this because it does not exercise the persist layer at runtime. Mitigation: write the migration as an explicit `migrate` function in the Zustand `persist` config, test it manually with a fresh dev profile that has snake_case localStorage data seeded, and document the rollback path (re-deploy the previous version, which still reads snake_case).
- The `archive-popover.tsx:351` reverse-translation removal needs verification that no archived chat list consumer downstream still expects snake_case — the reverse-translation only existed because something downstream wanted the snake_case shape back. If that downstream still exists, it needs to be updated in this same change.
