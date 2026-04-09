---
title: TypeScript Baseline & Remediation
icon: file-check
---

> **Canonical home.** This page tracks the TypeScript error baseline and
> the 6-root-cause remediation plan. Promoted from
> `.scratchpad/tscheck-remediation-plan.md`. The raw error snapshot
> referenced in the appendix remains at
> `.scratchpad/tscheck-snapshot-2026-04-08.log` (raw output, not authored
> content).

# TypeScript Error Remediation Plan

**Created:** 2026-04-08
**Current state:** `bun run ts:check` reports **103 errors** across 24 files
**Baseline:** `.claude/.tscheck-baseline` = 104 (we are 1 error below baseline)
**Snapshot log:** `.scratchpad/tscheck-snapshot-2026-04-08.log` (186 lines, full error dump)

---

## TL;DR — Executive Summary

The 103 errors are **not** 103 independent bugs. They collapse into **6 root causes**, and 75% of them (77/103) live in just 5 files. Ordered by risk-adjusted leverage:

| # | Root cause | Errors | Files | Risk | Effort |
|---|---|---:|---|---|---|
| **R1** | Orphaned dead code: `credential-manager.ts` | **11** | 1 | **None** — zero importers | **Trivial** |
| **R2** | Upstream sandbox DTO drift (`repos: never[]`) | **16** | 1 | High — touches F1 upstream feature | Medium |
| **R3** | Upstream Teams router stub (`api.teams.*`) | **~8** | 1–2 | High — touches F3 upstream feature | Medium |
| **R4** | ~~Chat DTO field-name drift (`snake_case` ↔ `camelCase`)~~ | **~~7~~ 0** | ~~2~~ 0 | **Resolved** — OpenSpec `retire-mock-api-translator` Phase 1 | **Done** |
| **R5** | Claude SDK / ai-sdk type drift (`ANTHROPIC_*` env, `UIMessageChunk`) | **9** | 2 | Medium — SDK surface moving target | Medium |
| **R6** | Long-tail small fixes (implicit any, optional chaining, ref types) | **~52** | 18 | Low | Low (but slow) |

**Recommended execution order:** R1 → R4 → R6 → R5 → R3 → R2. This yields **fast early wins** (R1 alone = 11 errors deleted with zero risk), leaves the **risky upstream-coupled work** (R2/R3) for last where it can be coordinated with Phase 0 gate #8 (upstream sandbox extraction) and the F1/F3 restoration decisions in `../enterprise/upstream-features.md`.

**Important context:** We are currently **1 error below baseline (103 vs 104)**, so CI is NOT failing. This work is opportunistic quality improvement, not a blocking fire. That means we can sequence it deliberately and *lower the baseline* as we go rather than rush a big-bang cleanup.

---

## 1. Evidence and Investigation

### 1.1 Error code distribution

```
  31  TS2339  Property does not exist on type
  25  TS2322  Type X is not assignable to type Y
  11  TS7006  Parameter implicitly has an 'any' type
   9  TS2307  Cannot find module
   6  TS2554  Expected N arguments, but got M
   5  TS2551  Property X does not exist. Did you mean Y?  (snake→camel renames)
   4  TS2345  Argument of type not assignable to parameter
   3  TS2353  Object literal may only specify known properties
   2  TS2352  Conversion of type may be a mistake
   2  TS18048 Object is possibly 'undefined'
   1  each:  TS7053, TS2578, TS2571, TS2386, TS2344
```

### 1.2 File distribution — Top 5 = 77/103 errors (75%)

```
  30  src/renderer/features/agents/main/active-chat.tsx
  16  src/renderer/features/agents/main/new-chat-form.tsx
  11  src/renderer/features/agents/ui/agents-content.tsx
  11  src/main/lib/credential-manager.ts
   9  src/main/lib/trpc/routers/claude.ts
```

Main-process: **29** errors. Renderer: **74** errors.

### 1.3 Validation methodology

For each root cause I traced back to source with `grep`/`sed` to confirm whether the errors are:
- **Symptom of dead code** → delete the code
- **Drift between producer and consumer** → fix one side to match the other
- **Genuine type bugs** → fix case-by-case

All findings below include file:line citations and reproduction instructions. No speculation — every recommendation has been grounded in a file read or grep result from this session.

---

## 2. Root Causes (Deep Dive)

### R1. Orphaned dead code: `src/main/lib/credential-manager.ts` (11 errors)

**Evidence:**

```
$ grep -rn "credential-manager" src/
(only self-references in credential-manager.ts itself; zero import sites)

$ ls src/main/lib/auth/ src/main/lib/credentials/ src/main/lib/utils/
ls: No such file or directory  (all 3 directories missing)
```

The file imports **9 modules that do not exist in this repo**:
- `./types.ts`, `./storage.ts`
- `../credentials/types.ts`, `../credentials/index.ts`
- `../auth/oauth.ts`, `../auth/google-oauth.ts`, `../auth/slack-oauth.ts`, `../auth/microsoft-oauth.ts`
- `../utils/debug.ts`

Plus two implicit-any parameters at `:357-358` in a debug callback.

**Historical context:** Memory S3626 (Apr 7) recorded an investigation into the origin of this file. Memory 19062 (Apr 7 8:59p) says "SourceService credential management architecture identified." The class is `SourceCredentialManager` — it looks like the skeleton of a **Google/Slack/Microsoft MCP OAuth credential layer** that was either pasted in from another project or started speculatively. The 9 missing modules were never created. Git history shows it was added in the `initial commit` (`a51c197`), not built incrementally here.

**Verdict:** **DEAD CODE.** Zero consumers, broken imports, never could have compiled. Safe to delete outright.

**Fix:** `git rm src/main/lib/credential-manager.ts`

**Impact:** −11 errors (103 → 92). Zero runtime risk (file is not loaded anywhere).

**Note on naming collision:** There is a legitimate `readFromWindowsCredentialManager()` function in `src/main/lib/claude-token.ts:31,69` — this is the Windows Credential Manager Win32 API, completely unrelated to the file being deleted.

---

### R2. Upstream sandbox DTO drift: `new-chat-form.tsx` (16 errors)

**Evidence:** All 16 errors are `TS2339: Property 'X' does not exist on type 'never'` — where `X` is one of:
- `sandbox_status`
- `id`, `name`, `full_name`
- `pushed_at`

These are **GitHub API field names** (snake_case) on a `repos` array. Inspecting `new-chat-form.tsx:750-820`, `repos` is being filtered for `r.sandbox_status === "ready"`, sorted by `pushed_at`, etc.

The type is inferred as `never[]` because the tRPC query that used to populate it (from the upstream `remoteTrpc.*` sandbox router) has been **stubbed out or returns `never`** — leaving the consumer code still reaching into the old shape.

**Verdict:** This is F1 (Background Agents / cloud sandboxes) fallout. Per `../enterprise/upstream-features.md` and CLAUDE.md, **F1 is marked 🟥 P0 for the OAuth flow hidden inside (gate #8)** but the *sandbox repo listing* itself is part of F1's "agent-running" portion which is marked ⬜ P3 (local sandbox alternative later).

**Options (pick one — requires a design decision, do NOT auto-fix):**

- **Option A (recommended):** Gate the entire sandbox-browsing UI behind a feature flag and early-return. The code stays intact for reference during F1 restoration but is unreachable at runtime. Add a TODO comment pointing at `../enterprise/upstream-features.md` F1.
- **Option B:** Delete the sandbox-browsing UI entirely. Cleanest but discards work; may conflict with future F1 restoration if the restored path reuses this component shell.
- **Option C:** Add `@ts-expect-error` annotations and leave as-is. **Do not do this** — it just moves the error count without any progress.

**Coordination requirement:** R2 must be sequenced **after** Phase 0 gate #8 (Claude Code OAuth extraction from upstream sandbox) is complete, because gate #8 decides whether sandbox infrastructure stays in the codebase at all.

**Impact if deferred:** Keeps 16 errors in the baseline. Acceptable — baseline is 104, not a regression.

---

### R3. Upstream Teams router stub: `agents-content.tsx` TS2554 errors (~8 errors across 2 files)

**Evidence:** `agents-content.tsx:192`:

```tsx
const { data: teams } = api.teams.getUserTeams.useQuery(undefined, {
  enabled: !!selectedTeamId,
});
```

Error: `TS2554: Expected 0 arguments, but got 2.`

This means `api.teams.getUserTeams` has been stubbed to a 0-arg function (likely `() => []`) — the upstream Teams router was typed with input `undefined` and React Query options, and the stub drops both.

Other TS2554 errors on lines 269, 285, 295, 808 in the same file + TS2554 in `agent-model-selector.tsx:111` likely stem from the same stub-drift pattern on other upstream routers.

**Verdict:** F3 (Remote Agent Chats / Teams sync) fallout. Per `../enterprise/upstream-features.md` F3 is a high-priority restoration candidate.

**Recommended fix:** Update the stubs in `src/renderer/lib/remote-app-router.ts` (or wherever `api.teams.*` is stubbed) to accept the same argument signature as the real upstream router used to have: `(input: undefined, opts?: UseQueryOptions) => ...`. This is a **type-only fix** — the stub still returns empty data at runtime, but consumers stop tripping on the signature mismatch.

Then do the same for any other upstream router stub with the same pattern.

**Discovery step:** Run `grep -rn "useQuery(undefined" src/renderer/` to find all consumer sites so the stub signature fix covers everything at once.

**Impact:** −6 to −8 errors. Low risk (type-only change, no runtime behavior). Medium effort (requires locating the stub + updating all consumer call sites if the stub path changes).

---

### R4. Chat DTO field-name drift: `snake_case` ↔ `camelCase` — **RESOLVED**

**Resolved by:** OpenSpec change `retire-mock-api-translator` (Phase 1), implemented 2026-04-09. The change removed the `created_at`/`updated_at` timestamp translation from `mock-api.ts` and migrated all consumer files to read camelCase directly from Drizzle. The `agents-content.tsx` sites were already fixed in commit `df421a8`. The remaining sites across 8 consumer files + the Zustand sub-chat store were migrated in this change.

**Actual impact:** ts:check baseline dropped from 88 → 87 (−1 net). The original estimate of ~7 errors was from the 2026-04-08 snapshot when the baseline was 103; most of the R4 errors had already been resolved by commit `df421a8` and intervening Phase 0 work before this change landed.

---

### R5. Claude SDK / ai-sdk type drift (9 errors)

**Evidence:** Six errors in `src/main/lib/trpc/routers/claude.ts` are about missing env properties:

```
claude.ts(1472,26): Property 'ANTHROPIC_API_KEY' does not exist on type
  '{ CLAUDE_CODE_OAUTH_TOKEN?: string | undefined; CLAUDE_CONFIG_DIR: string; }'.
claude.ts(1476,24): Property 'ANTHROPIC_BASE_URL' ...
claude.ts(1480,26): Property 'ANTHROPIC_AUTH_TOKEN' ...
(and 3 more at :1616, :1619)
```

This means the env object is now typed narrowly (OAuth-only) but the code still conditionally sets `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` on it. Either:
1. The env type was tightened somewhere and forgot to update the setter code, OR
2. The setter code is legacy dead-code for the BYOK fallback path that's been superseded by `CLAUDE_CODE_OAUTH_TOKEN`.

Plus three errors about `UIMessageChunk` incompatibilities (`claude.ts:1981,2000`) and one `Options` type mismatch (`:2066`). These are **ai-sdk / `@anthropic-ai/claude-agent-sdk` version drift** — the SDK types evolved and our use sites are on the old shape.

Plus `claude/transform.ts:105,365` — `providerMetadata` key removed from the `tool-input-available` part type.

**Fix:** This requires actually **reading** the claude.ts router and the current `@anthropic-ai/claude-agent-sdk` type surface to decide:
- For the env: Either widen the type (if BYOK is still supported) or delete the legacy code (if OAuth is now the only path). **Critical decision — do not auto-fix.** Check `src/main/lib/claude/env.ts` first (it's the five-token-leak site that was sanitized in Phase 0 gate #5-6 — it may have been narrowed during that cleanup and the consumer in `claude.ts` was not updated).
- For `UIMessageChunk`: Check the current SDK version's type, update the cast sites. If the SDK intentionally removed `ask-user-question-result` from the chunk union, these may need a different event path entirely.
- For `providerMetadata`: Check the current ai-sdk `UIMessageChunk` type. This field may have moved to a metadata sub-object.

**Coordination:** Consult CLAUDE.md binary pinning — `@anthropic-ai/claude-agent-sdk` version is in `package.json`. Do not bump the SDK to fix types; fix the consumer to match the current pinned version.

**Impact:** −9 errors. Medium risk (touches streaming path — `claude.ts` is core hot path). Medium effort (requires SDK type spelunking).

---

### R6. Long-tail small fixes (~52 errors across 18 files)

These are standard TypeScript hygiene issues with no single root cause. Grouped by sub-type:

#### R6a. `active-chat.tsx` — AgentDiffViewRef / ParsedDiffFile type mismatches (~12 errors)

Lines 1470-2041. The `AgentDiffViewRef` interface doesn't match what's being passed:
- `RefObject<{ expandAll, collapseAll, getViewedCount, markAllViewed, markAllUnviewed } | null>` vs expected `Ref<AgentDiffViewRef>`
- Collapse-state shape: `Map<string, boolean>` vs `{ allCollapsed, allExpanded }`
- `ParsedDiffFile[]` vs `unknown`

**Fix:** Either extend `AgentDiffViewRef` to include the 5 methods the ref exposes, or narrow the ref type at the site. Check `src/renderer/features/agents/ui/agent-diff-view.tsx` (or similar) for the canonical interface. Low risk — pure type annotation work.

**Impact:** −12 errors. Low risk. Medium effort (~30 min).

#### R6b. Implicit any parameters (11 errors, TS7006)

Spread across many files. Each is a parameter that needs an explicit type annotation. Fix mechanically:

```
active-chat.tsx(6318,25), (6377,21), (7911,16), (7934,43), (7945,14), (7947,31)
assistant-message-item.tsx(502,33)
agent-tool-registry.tsx(356,10)
vscode-theme-scanner.ts(144,28)
credential-manager.ts(357,18), (358,17)  ← already covered by R1 delete
```

**Fix:** Add explicit parameter types. For callback-heavy sites (`prev: Foo`, `sc: SubChat`, `old: Bar`) the correct type is usually obvious from context.

**Impact:** −9 errors (2 are in credential-manager.ts which R1 deletes). Low risk. Low effort (~20 min).

#### R6c. `isLoaded` on `{ userId: null }` (agents-sidebar.tsx:1761)

`Property 'isLoaded' does not exist on type '{ userId: null }'`. This is a **Clerk-auth remnant**. The upstream app used Clerk (`useUser()` / `useAuth()`) and the stub for fork use has been narrowed to `{ userId: null }` but the consumer still reads `isLoaded`.

**Fix:** Update the Clerk stub at `src/renderer/lib/...` (grep for `useAuth` / `useUser` stubs) to include `isLoaded: true` constant. Or update the consumer to not destructure `isLoaded`. Fork-specific plumbing.

**Impact:** −1 error. Very low risk.

#### R6d. `agents-sidebar.tsx:3128` — Jotai atom setter vs callback signature mismatch

`Type 'SetAtom<[SetStateAction<SettingsTab>], void>' is not assignable to type '(tab: string) => void'.`

**Fix:** Wrap the atom setter in an arrow function: `(tab) => setSettingsTab(tab as SettingsTab)`.

**Impact:** −1 error. Low risk.

#### R6e. `agents-layout.tsx:352` — `name: string | null` vs `name?: string | undefined`

Nullability coercion. Pass `user.name ?? undefined` or update the consumer type to allow `null`.

#### R6f. Mention providers: `'plugin' | 'project' | 'user'` vs `'project' | 'user'`

`agents-provider.ts:71`, `skills-provider.ts:60`, `agents-file-mention.tsx:898,922`. The mention source type was narrowed but data providers still emit `"plugin"` source. Either widen the consumer type or filter out plugin-sourced items.

**Decision needed:** Should plugin-sourced agents/skills appear in @-mentions? If yes, widen the type. If no, filter in the providers.

**Impact:** −4 errors. Low risk once decision is made.

#### R6g. Electron `app.dock` undefined (2 errors)

`src/main/index.ts:903` and `src/main/windows/main.ts:102`. `app.dock` is macOS-only, so it's `undefined` on other platforms.

**Fix:** Add `if (app.dock) { ... }` guards, or use optional chaining: `app.dock?.setBadge(...)`.

**Impact:** −2 errors. Very low risk. Correct pattern regardless of whether it's raising an error today.

#### R6h. `git-watcher.ts` chokidar generic constraint (3 errors)

`Type 'typeof import("chokidar")' does not satisfy the constraint '(...args: any) => any'.`

Probably from a generic type helper that expects a function type but got a module import. **Fix:** Read the file, likely needs a `typeof chokidar.watch` instead of `typeof chokidar`.

**Impact:** −3 errors. Low risk.

#### R6i. `chat-input-area.tsx:1158` — unused `@ts-expect-error`

`TS2578`. The directive is no longer needed — the underlying error was fixed. **Fix:** Delete the directive. −1 error. Trivial.

#### R6j. Remaining stragglers (~8 errors)

- `active-chat.tsx:4589` — `mediaType` on `UploadedFile` — add field or rename consumer
- `active-chat.tsx:6991-6992` — `serverInfo`, `error` on `CodexMcpServerForSettings` — type extension
- `active-chat.tsx:7604` — `isRemote` on chat discriminated union — add to union
- `active-chat.tsx:8560-8595` — nullability fixes (same pattern as R6e)
- `agent-user-message-bubble.tsx:226` — `base64Data` on file shape
- `mcp-servers-indicator.tsx:52` — SessionInfo setter with reset
- `mcp-servers-indicator.tsx` — `MCPServerStatus` string literal
- `work-mode-selector.tsx:82` — `'local' | 'sandbox' | 'worktree'` vs `WorkMode` (probably F1 sandbox-removal fallout again; may resolve via R2 path)
- `text-selection-context.tsx:16` — `Overload signatures must all be optional or required` (TS2386)
- `custom-agents-tab.tsx:648,649` — Two `FileAgent` types (main vs renderer); consolidate into shared types file

**Impact:** −~8 errors. Mix of risks; fix case-by-case.

---

## 3. Execution Plan — Sequenced Phases

Each phase is independently shippable. Ship each as its own commit or small PR so the baseline drops visibly and bisection stays cheap.

### Phase A — Dead code purge (R1) → 103 → 92

**Action:** Delete `src/main/lib/credential-manager.ts`.

**Validation:**
```bash
bun run ts:check 2>&1 | grep -c "error TS"     # expect 92
bun run build                                    # expect success
bun test                                         # expect pass
grep -rn "credential-manager" src/               # expect 0 results
```

**Commit message:** `chore: delete orphaned credential-manager.ts (dead code, 9 missing imports)`

**Update:** Drop baseline to 92 in `.claude/.tscheck-baseline`.

**Risk:** None. File has zero importers and broken imports.

---

### Phase B — Mechanical renames (R4) — **COMPLETE**

**Resolved by:** OpenSpec change `retire-mock-api-translator` (Phase 1), 2026-04-09. The `agents-content.tsx` sites were already fixed in commit `df421a8`; the remaining consumer files and Zustand store were migrated in the Phase 1 implementation. Baseline drop: 88 → 87.

**Update:** Drop baseline to 85.

**Risk:** Very low. Accessor-only rename.

---

### Phase C — Long-tail hygiene (R6a, R6b, R6c, R6d, R6e, R6g, R6h, R6i) → 85 → ~42

Sub-phases, each ~20 min:

1. **C1.** `AgentDiffViewRef` extension (R6a, −12)
2. **C2.** Implicit any annotations (R6b, −9 after R1 reduction)
3. **C3.** Clerk stub `isLoaded` (R6c, −1)
4. **C4.** Jotai atom setter wrap (R6d, −1)
5. **C5.** `user.name ?? undefined` nullability (R6e, −1 + similar)
6. **C6.** Electron `app.dock?` guards (R6g, −2)
7. **C7.** chokidar generic constraint (R6h, −3)
8. **C8.** Unused `@ts-expect-error` (R6i, −1)
9. **C9.** Mention-provider source type decision + fix (R6f, −4)
10. **C10.** Remaining stragglers (R6j, −8)

**Validation after each sub-phase:**
```bash
bun run ts:check 2>&1 | grep -c "error TS"
# manually verify no NEW errors introduced (compare file-by-file counts vs previous run)
```

**Commits:** One per sub-phase; messages tagged `fix(types):` with scope (e.g. `fix(types): app.dock undefined guards for non-macOS`).

**Updates:** Drop `.claude/.tscheck-baseline` after each sub-phase.

**Risk:** Low. Pure type hygiene. No runtime behavior changes.

**Checkpoint at end of Phase C:** ~42 errors remaining, all in R2/R3/R5 (the upstream-coupled / SDK-coupled categories).

---

### Phase D — Claude SDK alignment (R5) → ~42 → ~33

**Preconditions:** Read current `@anthropic-ai/claude-agent-sdk` version in `package.json`. Check its shipped types for `UIMessageChunk`, `Options`, and the `tool-input-available` part shape.

**Actions (in order — each requires verification):**

1. **D1.** Read `src/main/lib/claude/env.ts` to understand the current env shape. Compare to `claude.ts:1472-1480, 1616-1619`. Decide:
   - **D1a.** If BYOK (API key path) is still supported: widen the env type to include `ANTHROPIC_API_KEY | ANTHROPIC_BASE_URL | ANTHROPIC_AUTH_TOKEN`. Update `claude/env.ts` to export the wider type.
   - **D1b.** If BYOK is fully deprecated (OAuth-only): delete the three setter blocks in `claude.ts:1472-1480, 1616-1619` as dead code. **Memory 19147 (Apr 8 3:02p) says: "Current implementation uses custom CLAUDE_CODE_OAUTH_TOKEN environment variable"** and 19149 says the fork supports custom `ANTHROPIC_BASE_URL` for proxy routing. So some of this env is live. Lean toward **D1a**.

2. **D2.** Fix `UIMessageChunk` cast sites at `claude.ts:1981,2000`. Read the current SDK type; either find the correct discriminator or route `ask-user-question-result` events through a different channel.

3. **D3.** Fix `Options` type mismatch at `claude.ts:2066`. Read the SDK's query function signature; match the input shape.

4. **D4.** Fix `providerMetadata` in `claude/transform.ts:105,365`. Read current `UIMessageChunk` type; move `providerMetadata` to a metadata sub-object or delete if no longer supported.

**Validation:**
```bash
bun run ts:check 2>&1 | grep -c "error TS"
bun run build
# Manual smoke test: bun run dev, start a Claude session, verify streaming works
```

**Commits:** `fix(claude): align env type with OAuth + BYOK support`, `fix(claude): update UIMessageChunk handling for SDK vX.Y`, etc.

**Updates:** Drop baseline after each commit.

**Risk:** **Medium.** `claude.ts` is the core hot path for Claude streaming. Must smoke-test after D1/D2/D3.

---

### Phase E — Upstream router stub signatures (R3) → ~33 → ~25

**Precondition:** Locate the upstream router stub file. Grep hint:
```bash
grep -rn "teams\s*:\s*" src/renderer/lib/remote-app-router.ts src/renderer/lib/remote-*.ts
grep -rn "getUserTeams" src/renderer/
```

**Action:** Update the typed stub at `src/renderer/lib/remote-app-router.ts` (or wherever it lives) so each query procedure declares:
- Input type (even if `undefined`)
- Return type
- Supports the React Query options arg

Then re-run `bun run ts:check`. The `TS2554 Expected 0 arguments` errors in `agents-content.tsx:192,269,285,295,808` and `agent-model-selector.tsx:111` should disappear.

**Validation:**
```bash
bun run ts:check
bun run build
# Smoke test: run app, verify team-related UI shows empty state (not crash)
```

**Commit message:** `fix(remote-trpc): restore upstream router stub signatures for consumer compatibility`

**Risk:** **Low-medium.** Type-only change, but the stub drives a user-visible feature surface (teams UI). Verify no crashes in empty state.

---

### Phase F — F1 sandbox UI decision (R2) → ~25 → ~9

**Preconditions — this is a decision, not a code change yet:**

1. **F1a.** Read `.scratchpad/../enterprise/upstream-features.md` v2 to confirm the current F1 restoration stance.
2. **F1b.** Read CLAUDE.md for Phase 0 gate #8 status. Gate #8 (Claude Code OAuth extraction) determines whether sandbox infrastructure stays in the codebase.
3. **F1c.** Open an `EnterPlanMode` brainstorming session or ask user: **"Do we gate-flag the sandbox UI, delete it, or wait for F1 restoration?"**

**Once decided, implementation options:**

- **Option A (gate-flag):** Add a feature flag check at `new-chat-form.tsx` top; early-return a "sandbox unavailable" panel. Leave code intact. Add `@ts-expect-error // F1-sandbox-disabled` on the 16 lines OR better: fix the underlying type by adding a proper stub `repos: SandboxRepo[]` with the full shape so consumers type-check even when the query returns `[]`. The second approach is cleaner.

- **Option B (delete):** Delete the sandbox repo-picker sub-component, keeping the rest of `new-chat-form.tsx`. Removes ~200 lines. May affect the new-chat flow; needs smoke testing.

- **Option C (defer):** Add entry to `.claude/.tscheck-baseline` comment explaining F1 owes 16 errors, leave for F1 restoration PR.

**Recommended:** Option A with a full type stub. Keeps the door open for F1 restoration while fixing type integrity.

**Validation:** `bun run ts:check`, `bun run build`, manual new-chat flow smoke test.

**Commit:** Depends on option chosen. At minimum: `fix(types): restore SandboxRepo stub type for new-chat-form compat`

**Risk:** **High (Option B), Medium (Option A), Low (Option C).**

---

### Phase G — Add CI gate + update baseline (final)

Once remediation is done, tighten the baseline:

1. Update `.claude/.tscheck-baseline` to the final count.
2. Update `.github/workflows/ci.yml` if there's a tscheck regression guard — verify it compares against the baseline file.
3. Add a comment in `CLAUDE.md` "Environment Notes" section updating the ts:check baseline fact: `Current ts:check baseline: NN pre-existing errors; only fail if count increases`.
4. Sync the Serena `environment_and_gotchas` memory with the new baseline.

---

## 4. Hard No-Go Actions

These are tempting but WRONG and should not be taken:

1. **Do NOT add `@ts-expect-error` comments to mask errors** without a tracked TODO and an explicit decision. It just moves the number without progress.
2. **Do NOT bump the `@anthropic-ai/claude-agent-sdk` version to "fix" R5.** The SDK is pinned for a reason; fix the consumer.
3. **Do NOT use `as any` / `as unknown` casts** to paper over R5/R6a. Extend the proper interface instead.
4. **Do NOT delete upstream router stubs to fix R3.** Consumers will crash at runtime. Fix the stub *signature*, not its existence.
5. **Do NOT auto-apply the R2 (sandbox) fix.** It's coupled to Phase 0 gate #8 and F1 restoration. Decision required.
6. **Do NOT fix R5 claude.ts env errors by deleting the setter code** without verifying whether BYOK / proxy routing is still supported (memory 19149 confirms proxy routing IS used).
7. **Do NOT skip the `bun run build` step after each phase.** tsgo and esbuild catch different errors; both must pass.
8. **Do NOT commit a baseline *increase*.** Baseline only moves down.

---

## 5. Success Criteria & Metrics

### Minimum acceptable outcome

Phases A–D complete → **~33 errors remaining**, baseline at 33, all remaining errors documented as "blocked on F1/F3 restoration" or "blocked on design decision" in `.scratchpad/tscheck-remediation-plan.md`.

### Target outcome

Phases A–E complete → **~25 errors remaining**, all in R2 (F1 sandbox UI).

### Aspirational outcome

All phases complete → **<10 errors remaining** (R6j stragglers only). Baseline dropped to match. CI gate tightened.

### Metrics to track at each phase

- Error count: `bun run ts:check 2>&1 | grep -c "error TS"`
- Baseline file: `.claude/.tscheck-baseline` (must drop monotonically)
- Build pass: `bun run build` (must stay passing)
- Test pass: `bun test` (must stay passing)
- Grep hygiene: No new `@ts-expect-error`, no new `as any`, no new `// @ts-ignore`

---

## 6. Coordination with Other Work

- **Phase 0 gate #8** (Claude Code OAuth extraction from upstream sandbox): Must complete before Phase F (R2 sandbox UI) work begins. Both touch F1.
- **Phase 0 gate #12** (feature flag infrastructure): If it lands first, use the feature-flag mechanism for Phase F Option A instead of ad-hoc early-return.
- **Phase 0 gate #11** (bun:test regression guards): Already in place. When adding regression guards for deleted code (R1), mirror the pattern from `tests/regression/auth-get-token-deleted.test.ts`.
- **F3 Teams restoration roadmap** (`../enterprise/upstream-features.md`): Phase E (R3 stub signature fix) is forward-compatible — when F3 is restored, the real router replaces the stub and the consumer sites keep working.

---

## 7. Appendix: Full error inventory

See `.scratchpad/tscheck-snapshot-2026-04-08.log` for the raw 186-line output.

Error code breakdown:
```
 31  TS2339  Property does not exist
 25  TS2322  Type not assignable
 11  TS7006  Implicit any
  9  TS2307  Cannot find module (ALL in credential-manager.ts — R1)
  6  TS2554  Expected 0 arguments (R3 upstream router stub drift)
  5  TS2551  Did you mean 'X'? (R4 camelCase rename)
  4  TS2345  Argument type mismatch
  3  TS2353  Object literal unknown property (R5 claude.ts + transform.ts)
  2  TS2352  Type conversion mistake
  2  TS18048 Object possibly undefined (R6g app.dock)
  1  TS7053  Element implicitly any
  1  TS2578  Unused @ts-expect-error (R6i)
  1  TS2571  Object is of type unknown
  1  TS2386  Overload signatures must all be optional or required
  1  TS2344  Type does not satisfy constraint (R6h chokidar)
```

File hotspots (top 10):
```
 30  active-chat.tsx           (R6a diff-view refs + R6b implicit any + R6j stragglers)
 16  new-chat-form.tsx         (R2 sandbox DTO drift — ALL 16)
 11  agents-content.tsx        (R3 teams stub + R4 renames)
 11  credential-manager.ts     (R1 dead code — ALL 11)
  9  trpc/routers/claude.ts    (R5 SDK drift — ALL 9)
  3  git/watcher/git-watcher.ts (R6h chokidar)
  3  claude/transform.ts       (R5 providerMetadata)
  2  agents-sidebar.tsx        (R6c + R6d)
  2  agents-file-mention.tsx   (R6f)
  2  custom-agents-tab.tsx     (R6j FileAgent type dup)
```

---

## 8. Change Log

- **2026-04-08 15:15 EDT** — Initial plan created after full error audit. Baseline 104, current 103, target ~25 after Phases A–E.
