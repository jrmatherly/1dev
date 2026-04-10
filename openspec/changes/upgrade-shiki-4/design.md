## Context

The renderer process uses the `shiki` package for syntax highlighting in three user-facing surfaces:

1. **Chat code blocks** (`src/renderer/lib/themes/shiki-theme-loader.ts` + `chat-markdown-renderer.tsx`, `agent-mcp-tool-call.tsx`, `message-json-display.tsx`, `agent-edit-tool.tsx`) — fenced code blocks in agent output.
2. **Diff view** (`src/renderer/lib/themes/diff-view-highlighter.ts` → `codeToHast`) — our custom diff highlighter that integrates with `@pierre/diffs`.
3. **Patch/file diffs via `@pierre/diffs/react`** (`src/renderer/features/agents/ui/agent-diff-view.tsx`) — third-party React components bundled from the `@pierre/diffs` package that do their own highlighting internally using **their own** shiki resolution.

The project is currently pinned to `shiki@3.23.0`. Dependabot opened [PR #11](https://github.com/jrmatherly/1dev/pull/11) to bump it to `4.0.2`. The upgrade was originally grouped into `upgrade-vite-8-build-stack` Phase B (§10) under the assumption that `@pierre/diffs@1.1.13` pinning `shiki: ^3.0.0` and `@shikijs/transformers: ^3.0.0` would create an unresolvable peer-dep conflict. That assumption was incorrect — PR #11 has been green on all 5 CI quality gates (run `24252853838`, 2026-04-10).

Constraints:
- **Electron 41.2.0 renderer** — shiki runs in the Chromium environment, not Node main process. The Node v20+ floor that Shiki 4.0.0 introduced is still relevant because `bun install` and `bun run build` run on Node 24.
- **Bun package manager** — the dependency tree resolution model (hoisting + nested install fallback) is the mechanism by which `shiki@3` and `shiki@4` will coexist.
- **Bundle size sensitivity** — `release.yml` notes 463 renderer chunks under a 6 GB `NODE_OPTIONS` heap on macOS-15 runners; the dual-version install introduces bundle regression risk that must be measured, not assumed.
- **No production shiki traffic yet** — this is a desktop app, not a website. The only "users" of shiki-highlighted content are developers and early adopters. Rollback is cheap.

Stakeholders: Jason (sole maintainer). No external users gated by this change.

## Goals / Non-Goals

**Goals:**
- Ship `shiki@4.0.2` as the top-level version the renderer consumes.
- Preserve the runtime behavior of all three syntax highlighting surfaces (chat code blocks, custom diff view, @pierre/diffs-powered diff components).
- De-risk `upgrade-vite-8-build-stack` by removing Shiki from its Phase B scope.
- Establish the `shiki-highlighter` capability spec so future upgrades (shiki 5, @pierre/diffs major bump) have a fixed contract to validate against.
- Empirically measure bundle size impact of dual-version coexistence.

**Non-Goals:**
- **Not** upgrading `@pierre/diffs` to a hypothetical shiki-v4-compatible version. The transitive nested `shiki@3.23.0` is accepted as-is.
- **Not** upgrading `@shikijs/transformers`. The project does not import it directly — it stays at its current `3.22.0` (hoisted by Bun since only `@pierre/diffs` needs it).
- **Not** landing Vite 8 Phase B. That work remains blocked on `electron-vite@6.0.0` stable release and is documented separately in `upgrade-vite-8-build-stack`.
- **Not** refactoring the renderer's shiki consumer code. Zero source changes.
- **Not** adopting new Shiki 4 features (`@shikijs/primitive`, `@shikijs/markdown-exit`). Those can land in a later change if desired.

## Decisions

### Decision 1: Split Shiki from `upgrade-vite-8-build-stack` Phase B

**Choice:** Create a standalone `upgrade-shiki-4` change and remove Shiki from the Vite 8 proposal.

**Why:** The Vite 8 Phase B work is blocked on `electron-vite@6.0.0` stable (currently beta-only `6.0.0-beta.0`), while Shiki 4 is independently mergeable today (PR #11 green). Coupling an unblocked change to a blocked one delays the unblocked work for no technical reason. Separating them:
- Lets Shiki 4 ship this week
- Removes one risk axis from the Vite 8 Phase B validation matrix
- Makes rollback independently scoped (revert one PR, not all of Phase B)

**Alternatives considered:**
- *Keep Shiki bundled with Vite 8 Phase B*: rejected because it holds the unblocked upgrade hostage to the blocked one.
- *Close PR #11 and do both upgrades in a single atomic change when `electron-vite@6.0.0` releases*: rejected for the same reason plus the risk of merge conflicts growing on PR #11 as main advances.

### Decision 2: Accept dual-version coexistence instead of forcing a single shiki version

**Choice:** Allow `shiki@4.0.2` (top-level) and `shiki@3.23.0` (nested under `@pierre/diffs`) to coexist in `node_modules`. Do **not** use `pnpm.overrides` or `bun.resolutions` to force `@pierre/diffs` onto `shiki@4.x`.

**Why:** `@pierre/diffs@1.1.13` was published 2026-04-09 with explicit `shiki: ^3.0.0` / `@shikijs/transformers: ^3.0.0` dependencies. Forcing it onto v4 would (a) require an `overrides` entry that silently deceives `@pierre/diffs`'s internal version expectations, (b) risk subtle runtime breakage in components we do not own, (c) produce a fork-in-all-but-name situation with zero upstream support. Dual-version install is the honest representation: we use shiki 4 for our code, and `@pierre/diffs` keeps using what it was tested against.

**Alternatives considered:**
- *Override @pierre/diffs to use shiki 4*: rejected — risks runtime failure in third-party code, and violates the "honesty" principle (we'd be lying about what `@pierre/diffs` runs against).
- *Fork @pierre/diffs and publish @1code/diffs with shiki 4*: rejected — huge maintenance burden for a 7.2 MB package we barely customize.
- *File an issue on @pierre/diffs and wait*: this is worth doing regardless, as a Phase 3 follow-up task — but it is NOT a blocker.
- *Drop @pierre/diffs entirely and reimplement diff view with shiki 4*: rejected — out of scope; the diff view is a load-bearing feature with non-trivial custom behavior.

### Decision 3: Add a `shiki-highlighter` capability spec instead of archiving with `--skip-specs`

**Choice:** Define a new `shiki-highlighter` capability with measurable invariants (version pin, API surface, dual-version coexistence, bundle size threshold, Node floor, quality gate pass).

**Why:** The `upgrade-typescript-6` precedent (archived at `openspec/changes/archive/2026-04-10-upgrade-typescript-6/specs/typescript-toolchain/spec.md`) shows that toolchain changes still benefit from capturing their invariants as a capability. Without a spec, future changes could silently regress the invariants (e.g., a future refactor that uses a removed shiki 4 API, or an unrelated change that bloats the renderer bundle past the 10% threshold). With the spec, those regressions are caught by `openspec validate` and by the invariants becoming first-class test targets.

**Alternatives considered:**
- *Archive with `--skip-specs`*: rejected — leaves no durable contract for future maintenance. The `.claude/rules/openspec.md` rule permits `--skip-specs` for toolchain changes but does not require it.

### Decision 4: Enforce a <10% renderer bundle size regression threshold

**Choice:** Codify "renderer bundle size MUST NOT regress by more than 10%" as a Requirement in the `shiki-highlighter` spec, validated by a `du -sh out/renderer/assets/` before/after measurement in the tasks.md Phase 2.

**Why:** The dual-version install is the one place where this change can cause a non-obvious regression. Without a hard threshold, "it compiles" becomes the de facto pass bar and a silent bloat could land. 10% is chosen because (a) it's large enough to tolerate the nested shiki 3 copy if Vite bundles both trees, (b) small enough to catch a pathological case where both full language/theme bundles duplicate. If the measurement shows >10% regression, the tasks.md defines the escalation path (investigate `@pierre/diffs` dynamic imports, consider forking decision).

**Alternatives considered:**
- *No threshold — just measure and document*: rejected — soft thresholds get ignored when they're inconvenient.
- *<5% threshold*: rejected — too tight; the dual-version case may legitimately need headroom.

## Risks / Trade-offs

**[Risk] Vite bundles both shiki trees into the renderer output, causing >10% bloat** → **Mitigation:** Phase 2 of `tasks.md` measures `out/renderer/assets/` before and after. If the threshold is breached, the tasks define a three-option escalation: (a) investigate whether `@pierre/diffs` uses dynamic imports that Vite could code-split, (b) file an upstream issue on `@pierre/diffs` to fast-track a shiki 4 port, (c) temporarily accept the regression behind a roadmap entry while a larger refactor is planned.

**[Risk] `@pierre/diffs` internal shiki 3 resolution breaks at runtime when top-level shiki is 4** → **Mitigation:** Phase 3 of `tasks.md` runs `bun run dev` and exercises the `PatchDiff` component in `agent-diff-view.tsx`, which is the one code path that actually hits `@pierre/diffs`'s nested shiki. If it breaks, rollback is a simple `git revert`.

**[Risk] A future session edits `upgrade-vite-8-build-stack` without knowing this change removed its §10 Shiki work, causing conflict** → **Mitigation:** Phase 5 of `tasks.md` explicitly removes §10 from `upgrade-vite-8-build-stack` `proposal.md`, `design.md`, and `tasks.md` as part of this change's merge cleanup. The edits are scoped tasks, not drive-bys.

**[Risk] `bun audit` flags a new advisory introduced by shiki 4 that was absent in shiki 3** → **Mitigation:** Phase 4 runs `bun audit` as part of the 6-gate sweep. The audit baseline is 58 pre-existing dev-dep advisories; any new advisory will be obvious in the diff and can be triaged before merge.

**[Risk] The `shiki-highlighter` spec becomes a maintenance burden if shiki 5 changes the API surface** → **Mitigation:** The spec is intentionally scoped to APIs we actually consume, not the full shiki surface. When shiki 5 lands, the `upgrade-shiki-5` change will `MODIFY` the `shiki-highlighter` spec requirements, which is a routine OpenSpec workflow.

**[Trade-off] Dual-version install increases disk footprint by ~12-16 MB** — accepted. Disk is cheap; runtime correctness matters more. The footprint is bounded and shrinks if/when `@pierre/diffs` publishes a shiki-4-compatible release.

**[Trade-off] We now have two shiki versions to patch if a security advisory lands** — accepted. Security-wise this is mostly cosmetic: shiki is a syntax highlighter operating on trusted local content (agent output, local diffs), not untrusted web input. The attack surface is minimal.

## Migration Plan

**Forward path:**
1. Verify PR #11 is still green; re-run CI if needed.
2. Merge PR #11 to main via the normal branch-protection flow (required CI + admin review).
3. Run the 6 quality gates locally as the merge commit catches up.
4. Execute the post-merge cleanup in `tasks.md` Phase 5 (remove §10 from Vite 8 proposal, sync docs, move roadmap entry, update CLAUDE.md version pins).
5. Archive this change: `bunx @fission-ai/openspec@1.2.0 archive upgrade-shiki-4 --yes`.
6. Run `/session-sync` to catch any remaining drift.

**Rollback path:**
- Single-PR rollback: `git revert <merge commit>` on main, push, CI re-runs on the revert commit.
- `bun install` picks up the reverted `package.json` and `bun.lock`, restoring the pre-upgrade state.
- If the `shiki-highlighter` spec was already archived, a follow-up change can `REMOVED` the capability. Until archive, the change can be discarded by `rm -rf openspec/changes/upgrade-shiki-4/`.

## Open Questions

- **Q1:** Does `@pierre/diffs` use a static `import` or dynamic `import()` to reach its shiki dependency? If dynamic, Vite should code-split both shiki trees into separate chunks and the bundle regression should be minimal. If static, both trees are bundled into the main renderer chunks. → **Resolved by Phase 2 empirical measurement, not by assumption.**
- **Q2:** Should we open a GitHub issue on `@pierre/diffs` asking for shiki-4 support? → **Deferred to a post-archive task.** Not blocking; the dual-version install works regardless.
- **Q3:** Is the `@shikijs/primitive` package (new in shiki 4) worth adopting in a future refactor? → **Out of scope for this change; document in the roadmap if a concrete benefit is identified.**
