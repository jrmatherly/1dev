## 1. Pre-flight investigation

- [ ] 1.1 Re-grep `src/renderer/` for every occurrence of `created_at`, `updated_at`, `\.created_at`, `\.updated_at`, and `created_at:` / `updated_at:` to confirm the 48-occurrence count from the proposal investigation is still accurate. Save the output to `.scratchpad/mock-api-phase1-snapshot.txt` for comparison after the change
- [ ] 1.2 Re-read `src/renderer/lib/mock-api.ts` lines 27-246 (the full `getAgentChat` adapter) and lines 442-512 (the `utils` block) to confirm there are no *other* return-shape sites that need the same treatment beyond the ones listed in the proposal
- [ ] 1.3 Verify that no consumer file uses optional chaining like `subChat?.created_at` that would silently survive the rename — these need conversion too
- [ ] 1.4 Confirm `src/renderer/lib/remote-types.ts` is NOT modified by this change (it represents the dead 21st.dev external contract, which retains its snake_case shape on purpose)
- [ ] 1.5 Identify the Zustand store's existing persist config — read `src/renderer/features/agents/stores/sub-chat-store.ts` in full to find the `persist(...)` middleware call and the existing `name` / `version` / `migrate` settings (or lack thereof)
- [ ] 1.6 Identify any downstream consumer of `archive-popover.tsx` that reads back the `updatedAt` field, to confirm the reverse-translation removal is safe

## 2. Translator removal in `mock-api.ts`

- [ ] 2.1 Delete the `created_at: sc.createdAt` line at `src/renderer/lib/mock-api.ts` line 232
- [ ] 2.2 Delete the `updated_at: sc.updatedAt` line at `src/renderer/lib/mock-api.ts` line 233
- [ ] 2.3 Inspect the surrounding return object to confirm no other timestamp-related fields are added at this site (`stream_id` and `meta` and `sandbox_id` stay — those are F1/upstream-feature fossils tracked separately)
- [ ] 2.4 Search for the same `created_at:` / `updated_at:` literal-key pattern elsewhere in `mock-api.ts` (the `utils` block at lines 442-512, the `getAgentChats` adapter at lines 17-26, the `getArchivedChats` adapter at line 247) and remove any matching lines
- [ ] 2.5 Run `bun run ts:check` after the `mock-api.ts` edits and capture the new error count — the count should *increase* temporarily because the consumers are now exposed to the typed shape but haven't been updated yet. This is expected and is the signal that the boundary is now visible

## 3. Consumer migration — `active-chat.tsx`

- [ ] 3.1 Update the `agentSubChats` type cast at lines 5836-5844 to use camelCase keys (`createdAt?: Date | string | null` and `updatedAt?: Date | string | null`). Keep `Date | string | null` because some sites in the file construct sub-chat objects from JSON-parsed messages where the timestamp is still a string
- [ ] 3.2 Update the parent-chat sort callback at line 4325 to read `b.updatedAt ?? 0` and `a.updatedAt ?? 0` (mirror the pattern from commit `df421a8`)
- [ ] 3.3 Update the `addToAllSubChats` payload at line 3768 to use `createdAt: newSubChat.createdAt?.toISOString() ?? new Date().toISOString()` (with toISOString conversion because the store's persisted shape is `string`)
- [ ] 3.4 Update the parent-chat update at line 4321 to use `{ ...c, updatedAt: now }`
- [ ] 3.5 Update the legacy stream-status compare helpers at lines 6767-6810 — these contain a mix of `sc.created_at` reads and `created_at:` writes. Convert all 8 sites
- [ ] 3.6 Update the explicit type literal at line 5841 to declare `createdAt?: Date | string | null`
- [ ] 3.7 Update the `updatedAt: subChat.updated_at || subChat.created_at || ""` site at line 6177 to read camelCase on both sides
- [ ] 3.8 Update lines 5770 and 5787 (`createdAt: new Date(remoteAgentChat.created_at)` and the matching `created_at: new Date(sc.created_at)`) — these are the boundary between the F1 remote-agent-chat shape (which keeps snake_case because it represents the dead upstream API) and the local sub-chat shape (which becomes camelCase). Read the surrounding context to determine which side of the boundary each line lives on
- [ ] 3.9 Update line 4914's `created_at: new Date().toISOString()` literal to `createdAt: new Date().toISOString()` — this is a local sub-chat construction
- [ ] 3.10 Run `bun run ts:check` after all `active-chat.tsx` edits and confirm no new errors were introduced relative to the post-section-2 baseline

## 4. Consumer migration — remaining files

- [ ] 4.1 Update `src/renderer/features/agents/ui/agents-content.tsx` at line 1067 to declare the type literal as `updatedAt: Date | null` (was `updated_at: Date`)
- [ ] 4.2 Verify there are no other snake_case timestamp reads remaining in `agents-content.tsx` (commit `df421a8` already fixed lines 341 and 480)
- [ ] 4.3 Update `src/renderer/features/agents/ui/sub-chat-selector.tsx` at lines 96, 306, 307, 568, 569 — all 5 sites use the `subChat.updated_at || subChat.created_at` pattern and become `subChat.updatedAt ?? subChat.createdAt`
- [ ] 4.4 Update `src/renderer/features/agents/ui/mobile-chat-header.tsx` at lines 94-95, 160 — same pattern
- [ ] 4.5 Update `src/renderer/features/agents/ui/archive-popover.tsx` at line 351. The current code is `updatedAt: chat.updated_at` which becomes a no-op once both sides are camelCase. **Delete the line entirely** if it is the only reverse-translation in the object literal, or change it to `updatedAt: chat.updatedAt` if there are other fields being mapped
- [ ] 4.6 Update `src/renderer/features/agents/components/subchats-quick-switch-dialog.tsx` at line 42 — `subChat.updated_at || subChat.created_at` becomes `subChat.updatedAt ?? subChat.createdAt`
- [ ] 4.7 Update `src/renderer/features/agents/components/agents-quick-switch-dialog.tsx` at line 17 — type declaration `updated_at: Date` becomes `updatedAt: Date | null` to match the Drizzle row shape
- [ ] 4.8 Update `src/renderer/features/sidebar/agents-subchats-sidebar.tsx` — re-grep this file to find the exact line numbers and apply the same camelCase rename pattern
- [ ] 4.9 Run `bun run ts:check` after each file is updated and confirm the error count drops monotonically, never goes up

## 5. Zustand store migration

- [ ] 5.1 Update the `SubChat` type at `src/renderer/features/agents/stores/sub-chat-store.ts` lines 13-17: rename `created_at?: string` to `createdAt?: string | null` and `updated_at?: string` to `updatedAt?: string | null`
- [ ] 5.2 Update the state setter at line 364 from `{ ...sc, updated_at: newTimestamp }` to `{ ...sc, updatedAt: newTimestamp }`
- [ ] 5.3 Read the `persist(...)` middleware call at the bottom of the file and identify the existing `version` field (or add one if missing — start at `1` if absent, increment to `1+current` if present)
- [ ] 5.4 Add a `migrate` function to the persist config that accepts the old persisted state and returns the new shape:
  ```typescript
  migrate: (persistedState: unknown, version: number) => {
    if (!persistedState || typeof persistedState !== "object") return persistedState
    const state = persistedState as { allSubChats?: Array<Record<string, unknown>> }
    if (!Array.isArray(state.allSubChats)) return persistedState
    return {
      ...state,
      allSubChats: state.allSubChats.map((sc) => {
        const next: Record<string, unknown> = { ...sc }
        if ("created_at" in sc && !("createdAt" in sc)) {
          next.createdAt = sc.created_at
          delete next.created_at
        }
        if ("updated_at" in sc && !("updatedAt" in sc)) {
          next.updatedAt = sc.updated_at
          delete next.updated_at
        }
        return next
      }),
    }
  }
  ```
- [ ] 5.5 Bump the persist config `version` field by 1 so the migrate function actually runs on existing users
- [ ] 5.6 Manually verify the migration by:
  - 5.6a Starting `bun run dev` against a fresh dev profile (`rm -rf "~/Library/Application Support/Agents Dev/"`)
  - 5.6b Creating a few sub-chats so the persist middleware writes localStorage entries
  - 5.6c Quitting the app
  - 5.6d Manually editing the localStorage entry to use `created_at` / `updated_at` keys instead of camelCase (simulates an existing user's persisted state from before the migration)
  - 5.6e Bumping the persist `version` and re-launching
  - 5.6f Confirming the sub-chat list renders correctly and the timestamps are not lost

## 6. Regression guard

- [ ] 6.1 Create `tests/regression/mock-api-no-snake-timestamps.test.ts` with the following structural assertions:
  - The file `src/renderer/lib/mock-api.ts` does not contain the substring `created_at:` (with the colon — matches both object-key syntax and TS type declarations)
  - The file `src/renderer/lib/mock-api.ts` does not contain the substring `updated_at:` (same reason)
  - These two assertions specifically guard against the timestamp fossil reappearing. They do NOT guard against `sandbox_id:`, `stream_id:`, or `meta:` because those are intentional F1/upstream-feature fossils tracked elsewhere
- [ ] 6.2 Mirror the file header comment style of the existing `tests/regression/auth-get-token-deleted.test.ts` and `tests/regression/credential-manager-deleted.test.ts` — explain why the guard exists, link to this OpenSpec proposal, and clarify that this is a structural guard not a runtime check
- [ ] 6.3 Run `bun test` and confirm all 8 tests pass (existing 7 + the new guard)

## 7. Verification

- [ ] 7.1 Run `bun run ts:check` and capture the final error count. Update the value in `.claude/.tscheck-baseline` if the count drops
- [ ] 7.2 Run `bun run build` and confirm exit 0
- [ ] 7.3 Run `bun audit` and confirm no new advisories were introduced (none should be — this change touches no dependencies)
- [ ] 7.4 Manually smoke-test the following flows in `bun run dev`:
  - 7.4a Create a new chat in a project
  - 7.4b Inside the chat, create a sub-chat (Cmd+T or equivalent)
  - 7.4c Switch between sub-chat tabs and verify timestamps render
  - 7.4d Use Cmd+K (or equivalent) quick-switch and verify chats are sorted by recency
  - 7.4e Archive the chat and verify it disappears from the sidebar
  - 7.4f Restore from the archive popover and verify the timestamp displays
- [ ] 7.5 Run `bunx @fission-ai/openspec@1.2.0 validate retire-mock-api-translator --strict --no-interactive` and resolve any validation issues
- [ ] 7.6 Capture before/after screenshots of the chat sidebar showing timestamps render correctly (paste into the PR description)

## 8. Documentation

- [ ] 8.1 Update `.scratchpad/tscheck-remediation-plan.md` to mark R4 as fully resolved by this OpenSpec change, and revise the R6 estimate downward if the actual error drop exceeds the original Phase B prediction
- [ ] 8.2 Update CLAUDE.md "Known Security Gaps & Footguns" section: change the `mock-api.ts` deprecated warning to note that timestamp fossil retirement is complete (Phase 1) and Phases 2-3 are tracked as separate proposals
- [ ] 8.3 If the change passes the gates, append a note to `openspec/changes/retire-mock-api-translator/proposal.md` "Impact" section with the actual `bun run ts:check` count delta

## 9. Follow-up (out of scope for this proposal)

These are listed here so that the next proposal in the sequence has clear continuity, NOT as in-scope tasks for this change:

- **Phase 2 (separate proposal):** Extract `normalizeCodexToolPart`, JSON message parsing, and the `tool-invocation` → `tool-{toolName}` migration into typed helpers under `src/renderer/lib/codex-shapes.ts` (or similar). Port the 6 consumer files to use `trpc.chats.*` directly instead of `api.agents.*`. Eliminates the `any` typing on chat data reads
- **Phase 3 (separate proposal):** Delete `mock-api.ts` entirely once no consumer references it. Audit and migrate any remaining upstream-stub procedures (`getUserTeams`, `getUserBalance`, `getRepositoriesWithStatus`, etc.) into typed F-entry-aware stubs in `remote-app-router.ts`
