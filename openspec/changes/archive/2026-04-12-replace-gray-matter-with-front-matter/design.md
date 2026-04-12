## Context

The Electron main-process build uses electron-vite 5 with a CJS output format (`main.build.rollupOptions.output.format = "cjs"`). A subset of main-process dependencies is listed under `main.build.externalizeDeps.exclude` — these are **bundled into** `out/main/index.js` rather than left as runtime `require()` targets. That list currently includes `superjson`, `trpc-electron`, `gray-matter`, and `async-mutex`. Because `gray-matter` is bundled, Rollup performs static analysis on its source, which triggers the warning:

```
node_modules/gray-matter/lib/engines.js (43:13): Use of `eval` in
"node_modules/gray-matter/lib/engines.js" is strongly discouraged as it
poses security risks and may cause issues with minification.
```

Inspecting `node_modules/gray-matter/lib/engines.js` line 43 shows the call sits inside `engines.javascript.parse`, a built-in engine that exists to let users parse JavaScript or CoffeeScript frontmatter. Our 4 main-process files only ever feed YAML frontmatter (`---\nkey: value\n---`) to `matter(content)` with zero options, so `engines.javascript.parse` is never invoked at runtime. But `gray-matter/index.js` unconditionally executes `const engines = require('./lib/engines')`, and `engines.js` has module-load side effects that mutate `exports`, so any bundler that sees it — including Rollup under our current config — must include the full engine-loading machinery. The dead code ships in every signed Electron main binary.

An empirical spike (full details: `.scratchpad/research-notes/gray-matter-eval-warning-research.md`; not cited from any tracked file per `.claude/rules/scratchpad.md`) ruled out the "call-site options" fix and validated the dependency-swap fix against all six quality gates. This design document captures the architectural decisions that made the spike succeed, so they survive into the implementation phase.

**Electron process-boundary constraints** (from `.claude/rules/vite-config.md`): the main process outputs CJS, the preload process outputs CJS, and the renderer emits ESM via Vite's dev server. The main-process bundle has a hard rule that ESM-only packages **must** be consumed via `await import(...)` — not top-level `import from` — and we already have a working example (`@anthropic-ai/claude-agent-sdk` is commented in `electron.vite.config.ts:22` as "ESM module - must use dynamic import"). This constraint kills `vfile-matter` (ESM-only) as a candidate for the current change scope and makes `front-matter` (CJS, published 2020) the right fit.

**Upstream boundary implications**: None. Frontmatter parsing is entirely local-first — it operates on files discovered in `~/.claude/{commands,agents,skills,plugins}` and `<cwd>/.claude/**`. No `remoteTrpc.*` call, no `fetch(${apiUrl}/)`, no F1-F10 surface is touched.

## Goals / Non-Goals

**Goals:**

1. **Eliminate the Rollup `eval` warning** from `bun run build` output. The warning source code must be absent from `out/main/index.js`. Empirically measurable via `grep -c "parseMatter\|engines\.js" out/main/index.js = 0`.
2. **Preserve the existing `{ data, content }` destructure ergonomics** at call sites. Zero changes to the 8 existing `matter(...)` usage sites should be required beyond the import statement swap.
3. **Isolate the external API contact surface in a single file** (`src/main/lib/frontmatter.ts`). Consumer files import from the shim, not from `front-matter` directly. This makes future parser swaps (e.g., to `vfile-matter` once an ESM-main refactor is available) a one-file change.
4. **Preserve the TypeScript baseline at 0 errors.** Any typing friction introduced by `front-matter`'s stricter generic defaults must be absorbed into the shim or fixed at the call site.
5. **Prevent regressions** via a dedicated `tests/regression/no-gray-matter.test.ts` guard that fails CI if `gray-matter` is reintroduced anywhere.
6. **Work in a git worktree** so the main working tree stays clean for other parallel tasks, and so the feature branch can be reviewed and merged without disturbing the developer's in-progress sessions.

**Non-Goals:**

1. **Reducing the full transitive dependency tree** (the original roadmap item claimed 7 packages would drop; the real number under this option is 3). Achieving the full reduction requires Option 3 (`vfile-matter`), which is ESM-only and forces an async refactor of every parse helper. That's explicitly deferred to a future change.
2. **Adding a capability spec for frontmatter parsing or for main-process bundle hygiene.** No existing capability spec mentions frontmatter, and adding one would overreach this change's scope.
3. **Touching renderer code.** The renderer does not parse frontmatter. The renderer's `remoteTrpc.*` surface is untouched.
4. **Bumping the underlying YAML parser.** `front-matter@4.0.2` uses `js-yaml@^3.13.1` internally, the same version gray-matter uses. No YAML semantic changes.
5. **Addressing the staleness of the replacement package.** `front-matter@4.0.2` was last published 2020-05-29. We're aware and accept this trade-off — gray-matter@4.0.3 is also stale (2019) and the shim pattern makes future replacement easy. A follow-on roadmap item covers eventual vfile-matter migration.
6. **Exercising the change via a full `bun run dev` runtime smoke test.** Static verification (build + grep + tests) is in scope; a full GUI smoke test of the Commands/Agents/Skills/Plugins panels is a nice-to-have pre-merge step, not a blocking gate.

## Decisions

### Decision 1: Use `front-matter@4.0.2` (Option 2), not `vfile-matter` (Option 3)

**Choice**: Replace `gray-matter` with `front-matter@4.0.2`.

**Alternatives considered:**

- **Option 1 — Pass `{ engines: { yaml: ... } }` at every call site.** Would be the lowest-churn fix if it worked. **Rejected**: empirically proven not to silence the warning. Rollup's warning is static-analysis based and cannot be avoided by runtime options; see `proposal.md` under "Why" for the mechanism.
- **Option 3 — Replace with `vfile-matter@5.0.1`.** Actively maintained (2025-03), uses modern `yaml@2` (no esprima tree), excellent TypeScript coverage. **Rejected for current scope**: ESM-only. Our main process outputs CJS. Adoption would force `parseAgentMd`, `parseSkillMd`, `parseCommandMd` (currently synchronous) to become async, which ripples up through 7+ scan helpers. The full dep-tree win is real (7 packages dropped vs 3 under Option 2), but the refactoring cost far exceeds the scope of "eliminate eval warning". A follow-on roadmap entry will pick this up when ESM-in-main becomes natural (likely with a future `electron-vite 6` upgrade).
- **Option 4 — Fork/patch gray-matter.** Creates an ongoing maintenance burden, not a clean fix. **Rejected**.

**Rationale for front-matter**: It silences the warning (empirically confirmed), is CJS-compatible with the current main-process bundle, exposes a minimally-different API that a 20-line shim can hide, bundles TypeScript types in-package, and has ~98% test-pass fidelity for our usage (vanilla YAML frontmatter, no exotic YAML 1.1 features — confirmed via a scan of 1,368 real Claude Code frontmatter files showing 0 anchors, 0 explicit tags, 0 multi-doc markers).

**Known trade-off**: `front-matter` itself is stale (2020-05-29). We accept this because we're trading 2019-stale for 2020-stale, the shim isolates the risk, and the full modernization path (vfile-matter with ESM-main) is tracked as follow-on work.

### Decision 2: Shim via `src/main/lib/frontmatter.ts`, not direct imports

**Choice**: Create a single file `src/main/lib/frontmatter.ts` that wraps `front-matter` and re-exports a `matter()` function returning `{ data, content }`. All consumers import from this module; no consumer imports `front-matter` directly.

**Alternatives considered:**

- **Per-file inline shim**: Each of the 4 router/utility files gets its own 5-line helper. **Rejected**: DRY violation for a 20-line wrapper; future parser swaps would require touching 4 files instead of 1; regression guard enforcement becomes harder (4 files to allowlist vs 1).
- **Direct rewrite of all 8 call sites to use `.attributes`/`.body`**: eliminates the shim entirely. **Rejected**: loses the `{ data, content }` destructure convention (established by gray-matter and the broader unified.js ecosystem), expands diff noise across PRs, and doesn't reduce complexity meaningfully — a shared wrapper file is cheap.

**Rationale**: The credential storage module `src/main/lib/credential-store.ts` is a direct precedent for this pattern — it's the single file allowed to call `safeStorage.*`, and it's enforced by `tests/regression/credential-storage-tier.test.ts`. The frontmatter shim follows the same pattern: one canonical wrapper file, a regression guard blocks direct imports outside it, future parser swaps touch a single file. Consistent architecture = easier reviews.

### Decision 3: Shim returns `Record<string, unknown>` data, not `any`

**Choice**: The shim's generic default is `Record<string, unknown>`:

```ts
export function matter<T extends Record<string, unknown> = Record<string, unknown>>(
  content: string,
): { data: T; content: string } {
  const { attributes, body } = fm<T>(content);
  return { data: attributes, content: body };
}
```

**Alternatives considered:**

- **`any` for data** (gray-matter's de-facto behavior): strictly looser, hides type bugs. **Rejected.**
- **Caller-specified generic with no default**: forces every call site to specify a type. **Rejected**: too much boilerplate for the 7 call sites that just need ad-hoc property access.

**Rationale**: `Record<string, unknown>` is the standard "parsed JSON from untrusted input" type in TypeScript. It forces call sites to narrow before using (e.g., `typeof data.name === "string"`), which matches what most of our call sites already do — see `parseCommandMd`, `parseSkillMd`, `scanPluginCommands`. The one exception is `parseAgentMd`'s `VALID_AGENT_MODELS.includes(data.model)` check at `agent-utils.ts:85`, which silently bypassed validation for non-string `model` values under gray-matter's `any` typing. Fixing that is a small latent bug fix, not a migration tax.

### Decision 4: Swap `externalizeDeps.exclude` gray-matter → front-matter, not exclude both

**Choice**: In `electron.vite.config.ts`, replace `"gray-matter"` with `"front-matter"` in the `main.build.externalizeDeps.exclude` list.

**Alternatives considered:**

- **Externalize front-matter** (omit from the exclude list). Leaves `require("front-matter")` in the bundle as a runtime require, pointing at the packaged `node_modules/`. **Rejected**: inconsistent with the existing pattern for other small helpers (superjson, async-mutex, trpc-electron — all in the exclude list, all bundled), and means the packaged Electron app ships a separate `node_modules/front-matter/` folder, wasting disk and adding an extra require lookup per call site.
- **Keep both in the exclude list** (bundle both). **Rejected**: once gray-matter is removed from `package.json`, Rollup can't bundle it — the exclude list entry becomes dead configuration.

**Rationale**: The exclude list is the canonical signal for "this dep is small enough to bundle in-line"; front-matter at ~28 KB of bundle delta clearly qualifies.

### Decision 5: Add a regression guard blocking gray-matter reintroduction

**Choice**: New `tests/regression/no-gray-matter.test.ts` — enforces no `gray-matter` in `package.json` deps/devDeps and no `import/require` of it anywhere under `src/main/**/*.ts`.

**Alternatives considered:**

- **Rely on code review alone**. **Rejected**: Dependabot, AI suggestions, and copy-paste from external codebases all bypass review. A 100-line regression guard costs ~5 minutes of implementation time and is the lowest-friction defense.
- **Enforce via `eslint` rule only** (e.g., `no-restricted-imports`). **Rejected**: eslint doesn't catch `package.json` reintroduction, and we already have a file-level allowlist pattern for regression guards that's easier to review. ESLint is a good second layer but not a replacement.
- **Skip the guard entirely**. **Rejected**: the whole point is to prevent this warning from coming back, and we have clear precedent for this style of guard (`no-scratchpad-references.test.ts`, `credential-storage-tier.test.ts`).

**Rationale**: Follows `.claude/rules/testing.md` and the regression-guard convention in `docs/conventions/regression-guards.md`. The guard must be file-level (not line-level), have a structured error message with file:line:snippet + remediation hint, run in <200ms, and be side-effect-free.

### Decision 6: Work in a git worktree

**Choice**: All implementation work for this change MUST happen in a dedicated git worktree at `../ai-coding-cli-worktrees/replace-gray-matter-with-front-matter/` (or similar path — see `tasks.md` for the exact command). The feature branch is `feat/replace-gray-matter-with-front-matter`.

**Alternatives considered:**

- **Work directly in the main checkout on a feature branch.** **Rejected**: interrupts any other in-progress work (including the active `upgrade-vite-8-build-stack` OpenSpec change, which may need occasional attention), requires stashing/unstashing if the user switches tasks, and creates risk that the OpenSpec verification steps (which run `bun run build` + `git status`) pollute or are polluted by unrelated local state.
- **Work in a temporary branch and cherry-pick at the end.** **Rejected**: more friction than a worktree, same downsides.
- **Use an agent's `isolation: "worktree"` parameter** to delegate implementation to a subagent in an isolated worktree. **Considered as an option** — the implementation phase can use this if the user prefers a fully-delegated workflow; see `tasks.md` task 1 for both manual and delegated patterns.

**Rationale**: Worktrees are the project's standard pattern for non-trivial implementation work. The `superpowers:using-git-worktrees` skill exists specifically for this. Worktrees preserve the main checkout's state, allow the developer to switch contexts without stashing, and are cheap to create/destroy. For a change that modifies bundler config + 4 router files + adds 2 test files + touches package.json, the worktree overhead (one `git worktree add` at the start, one `git worktree remove` at the end) is trivially small compared to the benefit.

**Worktree lifecycle rules** (codified in `tasks.md` task 1 + final task):

- Create: `git worktree add ../ai-coding-cli-worktrees/replace-gray-matter-with-front-matter -b feat/replace-gray-matter-with-front-matter`
- All subsequent `bun`, `git`, and edit commands run from inside the worktree path.
- Quality-gate runs (`bun run ts:check`, `bun run build`, `bun test`, `bun run lint`) happen inside the worktree.
- Push and PR open from inside the worktree.
- Remove only after PR is merged: `git worktree remove ../ai-coding-cli-worktrees/replace-gray-matter-with-front-matter`
- Do NOT delete the worktree if PR review requests changes — keep it alive until the branch is merged and the feature branch is deleted from remote.

## Risks / Trade-offs

- **[Risk] `front-matter` is itself stale** (last publish 2020-05-29, 6 years ago). A breaking change in `js-yaml@3.x` could orphan us.
  → **Mitigation**: The shim isolates the API surface. If `front-matter` breaks, we can swap to any other parser — including a hand-rolled 15-line wrapper around `js-yaml@4` directly — without touching any call site. Monitor `front-matter`'s GitHub issues during the first 30 days post-merge; if any surface, re-prioritize Option 3 migration.

- **[Risk] The 28 KB bundle size increase from the switch is small, but grows the signed main binary.**
  → **Mitigation**: Within measurement noise. Total main-process bundle is already >800 KB; +3% delta is not user-visible. Confirmed by the research spike, not a blocker.

- **[Risk] `agent-utils.ts:85`'s narrow-fix subtly changes runtime behavior** — gray-matter would accept a non-string `model` value and call `.includes()` with it (returning `false`, but not erroring); the new code refuses to even call `.includes()` for non-strings.
  → **Mitigation**: This is a latent-bug fix. Both implementations return `undefined` for non-string inputs (gray-matter because `.includes()` returns `false`; new code because the `typeof` guard short-circuits). No observable behavior change for well-formed agent files. Users with malformed `model: {...}` frontmatter will continue to get `undefined` model, same as before.

- **[Risk] The regression guard rejects the OpenSpec change's own spike/verification steps** if run against gray-matter-returning branches (e.g., if the guard runs during a CI job that's still on `main`).
  → **Mitigation**: The guard is purely filesystem-scanning (no git history inspection), so it only fires on the current worktree. Running the guard against the `main` branch (where gray-matter is still present) would correctly fail — this is the intended behavior pre-merge. Run the guard only from within the feature branch / merged state, not as part of a pre-merge shared test.

- **[Risk] Worktree divergence from main during a long review cycle** — if review takes days and other changes land on `main` that touch `electron.vite.config.ts` or `package.json`, the worktree will need a rebase.
  → **Mitigation**: The change touches only 2 lines of `electron.vite.config.ts` and 1 line of `package.json`; rebase conflicts are easy to resolve manually. Standard `git rebase main` from inside the worktree is sufficient. If a larger upgrade change (e.g., `upgrade-vite-8-build-stack` Phase B) lands mid-review, coordinate with its author to determine ordering — likely this change lands first because it's smaller and unrelated.

- **[Risk] The spike's in-tree runtime validation was not exhaustive** — the spike rebuilt the bundle and passed quality gates but did not click through the live Electron app. There could be an edge case in real Claude Code skill/agent/command files that fails only at runtime.
  → **Mitigation**: `tasks.md` includes a manual `bun run dev` smoke test step that exercises the Commands, Agents, Skills, and Plugins panels. The regression test `frontmatter-shim-shape.test.ts` exercises BOM handling and empty-frontmatter cases. If the smoke test surfaces issues, the shim is a 20-line file that can be adjusted in a follow-up commit before merge.

## Migration Plan

### Deploy steps (inside the worktree)

1. `git worktree add ../ai-coding-cli-worktrees/replace-gray-matter-with-front-matter -b feat/replace-gray-matter-with-front-matter`
2. `cd ../ai-coding-cli-worktrees/replace-gray-matter-with-front-matter`
3. `bun remove gray-matter && bun add front-matter@^4.0.2`
4. Create `src/main/lib/frontmatter.ts` with the shim (see `tasks.md` for contents).
5. Update 4 router/utility files: swap `import matter from "gray-matter"` → `import { matter } from "../../frontmatter"`.
6. Apply the narrow fix at `agent-utils.ts:85`.
7. Update `electron.vite.config.ts`: `"gray-matter"` → `"front-matter"` in `externalizeDeps.exclude`.
8. Create `tests/regression/no-gray-matter.test.ts`.
9. Create `tests/regression/frontmatter-shim-shape.test.ts`.
10. Run the validation plan (below).
11. Update `docs/operations/roadmap.md` — move item to "Recently Completed" table.
12. Commit, push, open PR.
13. After merge: `git worktree remove ../ai-coding-cli-worktrees/replace-gray-matter-with-front-matter`.

### Validation plan (must pass before PR open)

Executed inside the worktree:

```bash
# 1. Six quality gates
bun run ts:check      # expect: 0 errors (baseline preserved)
bun run lint          # expect: clean
bun run build         # expect: clean, NO Rollup eval warning
bun test              # expect: 173 tests (was 172, +1 for no-gray-matter guard), 0 fail
bun audit             # expect: unchanged (pre-existing advisories only)
cd docs && bun run build && cd ..   # expect: unchanged

# 2. Warning absence (the stated goal)
bun run build 2>&1 | grep -iE "(gray-matter|engines\.js|eval)" | wc -l
# expect: 0

# 3. Bundle introspection (per .claude/rules/vite-config.md)
grep -cE 'require\("gray-matter"\)' out/main/index.js                # expect: 0
grep -c "parseMatter\|engines\.js" out/main/index.js                 # expect: 0
grep -c "FrontMatterResult\|bodyBegin" out/main/index.js             # expect: >0
grep -cE 'require\("front-matter"\)' out/main/index.js               # expect: 0 (bundled, not required)

# 4. Dep tree verification
bun pm ls 2>&1 | grep -E "(gray-matter|front-matter|js-yaml)"
# expect: front-matter@4.0.2, no gray-matter, js-yaml@3.14.2 (via front-matter), js-yaml@4.1.1 (via electron-builder)

# 5. Runtime smoke test (manual)
bun run dev
# In the UI: click Commands → verify list populates; click Agents → verify list populates with descriptions;
#            click Skills → verify list populates; click Plugins → verify commands/skills/agents expand per-plugin.
# In the stdout: no "[agents] Failed to parse markdown" or "[skills] Failed to parse frontmatter" errors for valid files.
```

### Rollback plan

Single atomic commit. Rollback = `git revert <commit-sha>`, push, merge revert PR. The worktree can be destroyed after the revert PR merges.

If rollback is needed mid-review but before merge, `git reset --hard origin/main` inside the worktree and delete the worktree — no production impact because nothing has shipped yet.

## Open Questions

None blocking. Decisions above cover all architectural questions. Minor open items that can be resolved during implementation:

1. **Exact generic name in the shim** — `<T extends Record<string, unknown> = Record<string, unknown>>` vs. a simpler `<T = Record<string, unknown>>`. Prefer the former for type safety; can be relaxed during review if it causes friction at any call site.
2. **Whether to pre-warm `front-matter`'s internal cache** — gray-matter has a global `matter.cache` that memoizes parse results for identical input. `front-matter` does not cache. For current call sites the difference is negligible (agents/skills/commands are parsed lazily on directory scan, not in a hot loop), but if profiling surfaces a regression the shim can add its own memo. **Decision deferred**: measure first, optimize only if needed.
3. **Should `no-gray-matter.test.ts` scan `tests/` and `scripts/` in addition to `src/main/`?** Currently `gray-matter` isn't in those dirs, but future test fixtures or build scripts could reintroduce it. Lean toward "yes, scan tests/ and scripts/ too" for consistency with other regression guards' defensive posture.
