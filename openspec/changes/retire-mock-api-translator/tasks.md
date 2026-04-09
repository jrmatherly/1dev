## 1. Pre-flight investigation

- [ ] 1.1 Re-grep `src/renderer/` for every occurrence of `created_at`, `updated_at`, `\.created_at`, `\.updated_at`, and `created_at:` / `updated_at:` to establish the current baseline. **Audit baseline as of commit `f8166b1`: ~53 occurrences across 13 files** (51 in `src/renderer/features/`, 2 in `src/renderer/lib/mock-api.ts`). Save the output to a local file for comparison after the change for comparison after the change. **Expected post-Phase-1 count: ~9 sites** (the F1/F2 boundary preservation sites)
- [ ] 1.2 Re-read `src/renderer/lib/mock-api.ts` lines 230-240 to confirm only lines 232-233 contain the timestamp translation. The original proposal estimated lines 230-236 — the actual mapping is exactly 2 lines (232-233). Other snake_case fields at the same return site (`stream_id: null`, `meta: null`, `sandbox_id: null` if present) are F1 fossils that stay
- [ ] 1.3 Verify that no consumer file uses optional chaining like `subChat?.created_at` that would silently survive the rename — these need conversion too. Run: `grep -rn "\?\.created_at\|\?\.updated_at" src/renderer/`
- [ ] 1.4 Confirm `src/renderer/lib/remote-types.ts` is NOT modified by this change (it represents the dead upstream `21st.dev` external contract, which retains its snake_case shape on purpose; the upstream brand is historical — the local fork is now apollosai.dev)
- [ ] 1.5 Identify the Zustand store's existing persist config — read `src/renderer/features/agents/stores/sub-chat-store.ts` in full to find the `persist(...)` middleware call and the existing `name` / `version` / `migrate` settings (or lack thereof)
- [ ] 1.6 Identify any downstream consumer of `archive-popover.tsx` that reads back the `updatedAt` field, to confirm the reverse-translation removal is safe
- [ ] 1.7 **Boundary classification audit.** Read `src/renderer/features/agents/main/active-chat.tsx` lines 5760-5800 (the `chatSourceMode === "sandbox"` block) and `src/renderer/features/sidebar/agents-sidebar.tsx` lines 2068-2090 (the `remoteChats` loop). Confirm both are F1 boundary translations that read snake_case from the dead upstream API and write camelCase to the local shape — these MUST NOT be touched in Phase 1. Verified once during the proposal audit; re-verify before implementation in case the parallel agent's work has shifted the line numbers
- [ ] 1.8 Confirm `src/renderer/features/automations/automations-detail-view.tsx:847` (`execution.created_at`) is not in scope. The `automations/` directory is F2 territory, fully upstream-dependent. The fossil here is intentional and is tracked under the F2 restoration roadmap, not Phase 1
- [ ] 1.9 Verify `src/renderer/features/agents/ui/agents-content.tsx` is already clean (zero remaining sites). Commit `df421a8` removed the 4 sites at lines 341 (×2), 480, 481. Run: `grep -n "created_at\|updated_at" src/renderer/features/agents/ui/agents-content.tsx` — expect zero matches

## 2. Translator removal in `mock-api.ts`

- [ ] 2.1 Delete the `created_at: sc.createdAt` line at `src/renderer/lib/mock-api.ts` line 232
- [ ] 2.2 Delete the `updated_at: sc.updatedAt` line at `src/renderer/lib/mock-api.ts` line 233
- [ ] 2.3 Inspect the surrounding return object to confirm no other timestamp-related fields are added at this site (`stream_id` and `meta` and `sandbox_id` stay — those are F1/upstream-feature fossils tracked separately)
- [ ] 2.4 Search for the same `created_at:` / `updated_at:` literal-key pattern elsewhere in `mock-api.ts` (the `utils` block at lines 442-512, the `getAgentChats` adapter at lines 17-26, the `getArchivedChats` adapter at line 247) and remove any matching lines
- [ ] 2.5 Run `bun run ts:check` after the `mock-api.ts` edits and capture the new error count — the count should *increase* temporarily because the consumers are now exposed to the typed shape but haven't been updated yet. This is expected and is the signal that the boundary is now visible

## 3. Consumer migration — `active-chat.tsx` (~24 sites total; ~18 to migrate, ~6 to leave alone as F1 boundary)

**F1 boundary preservation — DO NOT TOUCH these sites:**

- [ ] 3.0a Verify lines 5770-5771 (`createdAt: new Date(remoteAgentChat.created_at)`, `updatedAt: new Date(remoteAgentChat.updated_at)`) remain unchanged — they read from `remoteAgentChat` inside the `if (chatSourceMode === "sandbox")` block at line 5765
- [ ] 3.0b Verify lines 5787-5788 (`created_at: new Date(sc.created_at)`, `updated_at: new Date(sc.updated_at)`) remain unchanged — they construct the F1 sub-chat shape inside the same `chatSourceMode === "sandbox"` block, intentionally using snake_case to match the dead upstream API contract that downstream `mock-api.ts` consumers expect

**Local Drizzle / store migration sites — convert to camelCase:**

- [ ] 3.1 Update the `agentSubChats` type cast at lines 5836-5844 to use camelCase keys (`createdAt?: Date | string | null` and `updatedAt?: Date | string | null`). Keep `Date | string | null` because some sites in the file construct sub-chat objects from JSON-parsed messages where the timestamp is still a string
- [ ] 3.2 Update the parent-chat sort callbacks at lines 373-374 and 4325. Both currently read `a.created_at` / `a.updated_at` / `b.created_at` / `b.updated_at`. Use the `?? 0` null-fallback pattern from commit `df421a8`
- [ ] 3.3 Update the `addToAllSubChats` payload at line 3768 (`created_at: newSubChat.created_at || new Date().toISOString()`) to use `createdAt: newSubChat.createdAt?.toISOString() ?? new Date().toISOString()` (with toISOString conversion because the store's persisted shape is `string`)
- [ ] 3.4 Update the parent-chat update at line 4321 from `{ ...c, updated_at: now }` to `{ ...c, updatedAt: now }`
- [ ] 3.5 Update the legacy stream-status compare helpers at lines 6775-6788 — these contain a mix of `sc.created_at` reads and `created_at:` writes. Specifically: lines 6775-6781 (`typeof sc.created_at === "string"` ternary chain — both `created_at` and `updated_at` patterns), lines 6786-6788 (object construction with snake_case keys). Convert all to camelCase
- [ ] 3.6 Update line 6177 (`updatedAt: subChat.updated_at || subChat.created_at || ""`) to read camelCase on both sides: `updatedAt: subChat.updatedAt || subChat.createdAt || ""`
- [ ] 3.7 Update line 4914's `created_at: new Date().toISOString()` literal to `createdAt: new Date().toISOString()` — local sub-chat construction
- [ ] 3.8 Update line 6808's `created_at: new Date().toISOString()` literal — same pattern as 3.7
- [ ] 3.9 Update lines 7397-7398 (`created_at: new Date().toISOString()`, `updated_at: new Date().toISOString()`) — local sub-chat construction site
- [ ] 3.10 Update line 7418's `created_at: new Date().toISOString()` literal
- [ ] 3.11 Update lines 7922-7923 (`created_at: new Date()`, `updated_at: new Date()`) — local sub-chat construction site, note these use `Date` directly rather than `toISOString()` so the store type must accept `Date | string | null`
- [ ] 3.12 Run `bun run ts:check` after all `active-chat.tsx` edits and confirm the error count is at or below the post-section-2 baseline. Expect a measurable drop because each fixed site removes a potential `Property 'updated_at' does not exist` error if the type cast at line 5836 was hiding it

## 4. Consumer migration — remaining files

- [x] 4.1 ~~Update `src/renderer/features/agents/ui/agents-content.tsx` at line 1067~~ — **Already complete via commit `df421a8`.** The 4 sites at lines 341 (×2), 480, 481 are gone; the speculated "type literal at line 1067" no longer exists in the current file. Verified by `grep -n "created_at\|updated_at" src/renderer/features/agents/ui/agents-content.tsx` returning zero matches as of audit on commit `f8166b1`. Re-verify before checking off
- [x] 4.2 ~~Verify no snake_case remaining in `agents-content.tsx`~~ — **Already verified.** Same as 4.1
- [ ] 4.3 Update `src/renderer/features/agents/ui/sub-chat-selector.tsx` at lines 96, 306, 307, 568, 569 — all 5 sites use the `subChat.updated_at || subChat.created_at` pattern and become `subChat.updatedAt ?? subChat.createdAt`
- [ ] 4.4 Update `src/renderer/features/agents/ui/mobile-chat-header.tsx` at lines 94-95, 160 — same pattern
- [ ] 4.5 Update `src/renderer/features/agents/ui/archive-popover.tsx` at line 351. The current code is `updatedAt: chat.updated_at` which becomes a no-op once both sides are camelCase. **Delete the line entirely** if it is the only reverse-translation in the object literal, or change it to `updatedAt: chat.updatedAt` if there are other fields being mapped
- [ ] 4.6 Update `src/renderer/features/agents/components/subchats-quick-switch-dialog.tsx` at line 42 — `subChat.updated_at || subChat.created_at` becomes `subChat.updatedAt ?? subChat.createdAt`
- [ ] 4.7 Update `src/renderer/features/agents/components/agents-quick-switch-dialog.tsx` at line 17 — type declaration `updated_at: Date` becomes `updatedAt: Date | null` to match the Drizzle row shape
- [ ] 4.8 Update `src/renderer/features/sidebar/agents-subchats-sidebar.tsx` — **8 sites** at the following exact lines (audit baseline): line 136 (`formatTimeAgo(subChat.updated_at || subChat.created_at)`), lines 381-382 (sort callback), line 798 (`created_at: new Date().toISOString()` construction), lines 821-822 (sort callback), line 1356 (`subChat.updated_at || subChat.created_at`), line 1719 (same pattern). Apply the same `?? 0` null-fallback for sort sites and the camelCase rename for the rest
- [ ] 4.9 **F1 boundary preservation — DO NOT TOUCH.** `src/renderer/features/sidebar/agents-sidebar.tsx` lines 2077-2078 (`createdAt: new Date(chat.created_at)`, `updatedAt: new Date(chat.updated_at)`) read from the F1 `remoteChats` array — they belong to the F1 restoration roadmap, not Phase 1. Verified during audit; verify again before implementation in case line numbers shifted
- [ ] 4.10 **F2 fossil-by-design — DO NOT TOUCH.** `src/renderer/features/automations/automations-detail-view.tsx:847` (`new Date(execution.created_at)`) is in F2 (Automations & Inbox) territory, fully upstream-dependent. Tracked under the F2 restoration roadmap in `docs/enterprise/upstream-features.md`
- [ ] 4.11 Run `bun run ts:check` after each file is updated and confirm the error count drops monotonically, never goes up

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
- [ ] 6.2 **Extended consumer-side scan.** Add a second test case that scans the migrated consumer files (`src/renderer/features/agents/main/active-chat.tsx`, `src/renderer/features/agents/ui/sub-chat-selector.tsx`, `mobile-chat-header.tsx`, `archive-popover.tsx`, `subchats-quick-switch-dialog.tsx`, `agents-quick-switch-dialog.tsx`, `src/renderer/features/sidebar/agents-subchats-sidebar.tsx`, `src/renderer/features/agents/stores/sub-chat-store.ts`) for the substrings `\.created_at`, `\.updated_at`, `created_at:`, `updated_at:`. Allow only the F1/F2 boundary preservation files to contain these substrings. The list of allowed files (allowlist, not blocklist) is: `src/renderer/features/sidebar/agents-sidebar.tsx`, `src/renderer/features/agents/main/active-chat.tsx` (which still contains the F1 boundary code at lines ~5765-5793 and other allowed sites), `src/renderer/features/automations/automations-detail-view.tsx`. The active-chat.tsx allowance is unfortunately permissive — accept this trade-off because narrowing it would require line-range matching which is fragile against future edits
- [ ] 6.3 Mirror the file header comment style of the existing `tests/regression/auth-get-token-deleted.test.ts` and `tests/regression/credential-manager-deleted.test.ts` — explain why the guard exists, link to this OpenSpec proposal, and clarify that this is a structural guard not a runtime check. Document the F1/F2 allowlist explicitly so future maintainers understand why those files are exempted
- [ ] 6.4 Run `bun test` and confirm all 14+ tests pass (existing 13 + at least 1 new for `mock-api.ts` clean + at least 1 new for consumer-side allowlist scan)

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

- [ ] 8.1 Update `docs/conventions/tscheck-baseline.md` to mark R4 as fully resolved by this OpenSpec change, and revise the R6 estimate downward if the actual error drop exceeds the original Phase B prediction
- [ ] 8.2 Update CLAUDE.md "Known Security Gaps & Footguns" section: change the `mock-api.ts` deprecated warning to note that timestamp fossil retirement is complete (Phase 1) and Phases 2-3 are tracked as separate proposals
- [ ] 8.3 If the change passes the gates, append a note to `openspec/changes/retire-mock-api-translator/proposal.md` "Impact" section with the actual `bun run ts:check` count delta

## 9. F1 / F2 boundary preservation verification

This section is the final acceptance gate for Phase 1. The point is to confirm that **the boundary translation sites we explicitly chose to keep are still snake_case** after all the migration work above, so future F-entry restoration work has the contract surface it expects.

- [ ] 9.1 Run `grep -n "remoteAgentChat\.\(created_at\|updated_at\)" src/renderer/features/agents/main/active-chat.tsx` and confirm the lines 5770-5771 sites are unchanged from before Phase 1 began. Capture the line numbers (they may have shifted slightly if other Phase 1 edits inserted/removed lines above them)
- [ ] 9.2 Run `grep -n "new Date(sc\.\(created_at\|updated_at\))" src/renderer/features/agents/main/active-chat.tsx` and confirm the lines 5787-5788 sites are unchanged. These construct the F1 sub-chat shape inside the `chatSourceMode === "sandbox"` block
- [ ] 9.3 Run `grep -n "new Date(chat\.\(created_at\|updated_at\))" src/renderer/features/sidebar/agents-sidebar.tsx` and confirm the lines 2077-2078 sites are unchanged. These read from `remoteChats` (the F1 remote chat list)
- [ ] 9.4 Run `grep -n "execution\.created_at" src/renderer/features/automations/automations-detail-view.tsx` and confirm line 847 is unchanged. F2 fossil-by-design
- [ ] 9.5 If any of 9.1-9.4 fails (the line was accidentally migrated), revert the offending edit and add a comment at the boundary site explaining why it stays snake_case. Re-run the failing grep to confirm
- [ ] 9.6 Cross-check the Phase 1 implementation against the F-entry inventory at `docs/enterprise/upstream-features.md` to confirm the boundary preservation matches the F1 (Background Agents) and F2 (Automations & Inbox) restoration roadmap. If any of the boundary sites have been unilaterally migrated by this change, the F-entry inventory may need updating to reflect the new contract surface

## 10. Follow-up (out of scope for this proposal)

These are listed here so that the next proposal in the sequence has clear continuity, NOT as in-scope tasks for this change:

- **Phase 2 (separate proposal):** Extract `normalizeCodexToolPart`, JSON message parsing, and the `tool-invocation` → `tool-{toolName}` migration into typed helpers under `src/renderer/lib/codex-shapes.ts` (or similar). Port the 6 consumer files to use `trpc.chats.*` directly instead of `api.agents.*`. Eliminates the `any` typing on chat data reads
- **Phase 3 (separate proposal):** Delete `mock-api.ts` entirely once no consumer references it. Audit and migrate any remaining upstream-stub procedures (`getUserTeams`, `getUserBalance`, `getRepositoriesWithStatus`, etc.) into typed F-entry-aware stubs in `remote-app-router.ts`
- **F1 boundary work (separate roadmap, see `docs/enterprise/upstream-features.md` F1):** When the F1 (Background Agents) restoration begins in earnest, the boundary translation sites preserved by Phase 1 (`active-chat.tsx:5770-5771,5787-5788` and `agents-sidebar.tsx:2077-2078`) will need to be replaced with whatever the new F1 contract demands — likely a typed `RemoteAgentChat` interface that lives next to `remote-types.ts` and consumes the F1 backend's actual API shape rather than the dead `21st.dev` shape. Phase 1 leaves the boundary sites visible and well-marked so that work can find them
- **F2 boundary work (separate roadmap, F2):** Same pattern for `automations-detail-view.tsx`. The `execution.created_at` site is one example; the whole `features/automations/` subtree is fossil-by-design until F2 is restored or formally retired
