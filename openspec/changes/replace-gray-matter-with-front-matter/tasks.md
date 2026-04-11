## 1. Worktree setup (MUST run first — all subsequent tasks happen inside the worktree)

> **Why a worktree?** Per `design.md` Decision 6, all implementation work for this change runs in a dedicated git worktree so the main checkout stays clean for parallel work and so the feature branch can be reviewed/merged without touching developer state. The `superpowers:using-git-worktrees` skill is the project convention; read it before starting if you haven't used worktrees here before. **Do not work on this change in the main `/Users/jason/dev/ai-stack/ai-coding-cli` checkout.**

- [ ] 1.1 From the main checkout (`/Users/jason/dev/ai-stack/ai-coding-cli`), confirm the tree is clean: `git status -s` returns empty. If there is local work in progress, stash or commit it first — a worktree cannot be created from a dirty index.
- [ ] 1.2 Confirm you are on the `main` branch and up to date: `git fetch origin && git checkout main && git pull --ff-only origin main`.
- [ ] 1.3 Create the feature worktree: `git worktree add ../ai-coding-cli-worktrees/replace-gray-matter-with-front-matter -b feat/replace-gray-matter-with-front-matter`. This creates a new checkout at that path, checked out to a fresh branch tracking `main`.
- [ ] 1.4 Change directory into the worktree: `cd ../ai-coding-cli-worktrees/replace-gray-matter-with-front-matter`. **All subsequent tasks assume this is your working directory.**
- [ ] 1.5 Install dependencies in the worktree: `bun install --frozen-lockfile`. Verify it completes without modifying `bun.lock`.
- [ ] 1.6 Run a baseline build to confirm the worktree reproduces the gray-matter eval warning you are about to fix: `bun run build 2>&1 | grep -iE "(gray-matter|engines\.js|eval)" | head -5`. Expect 1 warning line from `node_modules/gray-matter/lib/engines.js (43:13)`. This is the "red state" you are eliminating.
- [ ] 1.7 Run baseline quality gates to establish a clean pre-change snapshot: `bun run ts:check` (expect 0 errors, baseline preserved), `bun test` (expect 172 tests across 34 files, 162 pass + 10 skipped integration, 0 fail). Record the counts — you will compare against them post-change.

## 2. Dependency swap

- [ ] 2.1 Remove the old dependency: `bun remove gray-matter`. Verify `package.json`'s `dependencies` no longer contains `gray-matter`.
- [ ] 2.2 Add the new dependency: `bun add front-matter@^4.0.2`. Verify it appears in `package.json`'s `dependencies` and that `bun.lock` resolved it to exactly `4.0.2`.
- [ ] 2.3 Verify the transitive tree: `bun pm ls 2>&1 | grep -E "(gray-matter|front-matter|js-yaml)"`. Expect `front-matter@4.0.2` and `js-yaml@3.14.2` (held by front-matter). Expect NO `gray-matter` entry. Expect `js-yaml@4.1.1` still present (used by electron-builder).
- [ ] 2.4 Verify the packages that drop: `[ -d node_modules/gray-matter ] && echo "FAIL: still present" || echo "OK: gray-matter dropped"`, same check for `section-matter` and `strip-bom-string`. Expect all three to be absent from `node_modules/`.

## 3. Create the canonical shim

- [ ] 3.1 Create `src/main/lib/frontmatter.ts` with the following contents (see `design.md` Decision 2 + Decision 3 for rationale):

  ```ts
  import fm from "front-matter";

  /**
   * Canonical frontmatter parser for main-process code.
   *
   * Thin wrapper around `front-matter` that exposes a `{ data, content }` shape
   * matching the former `gray-matter` API. Replaced `gray-matter@4.0.3` on
   * 2026-04-XX to eliminate the Rollup dynamic-code-evaluation warning from
   * `gray-matter/lib/engines.js`.
   *
   * **Rule**: no main-process code outside this file may import `front-matter`,
   * `gray-matter`, `vfile-matter`, or `js-yaml` directly for frontmatter parsing.
   * Enforced by `tests/regression/no-gray-matter.test.ts`.
   *
   * **Generic default**: `Record<string, unknown>`, not `any`. Consumers must
   * narrow property types before use (e.g., `typeof data.name === "string"`).
   */
  export function matter<T extends Record<string, unknown> = Record<string, unknown>>(
    content: string,
  ): { data: T; content: string } {
    const { attributes, body } = fm<T>(content);
    return { data: attributes, content: body };
  }
  ```

- [ ] 3.2 Confirm the file compiles: `bun run ts:check 2>&1 | grep -c "frontmatter.ts"`. Expect `0`.

## 4. Swap consumer imports (8 call sites across 4 files)

> **IMPORTANT**: Keep the `matter` identifier name — the shim re-exports under that name exactly so call-site destructures (`{ data }`, `{ content }`, `{ data, content }`, `{ content: body }`) require zero changes.

- [ ] 4.1 `src/main/lib/trpc/routers/commands.ts`: replace `import matter from "gray-matter";` on line 6 with `import { matter } from "../../frontmatter";`. Verify the 3 call sites (lines 33, 103, 256) still destructure correctly.
- [ ] 4.2 `src/main/lib/trpc/routers/plugins.ts`: replace `import matter from "gray-matter";` on line 4 with `import { matter } from "../../frontmatter";`. Verify the 3 call sites (lines 73, 118, 160) still destructure correctly.
- [ ] 4.3 `src/main/lib/trpc/routers/skills.ts`: replace `import matter from "gray-matter";` on line 6 with `import { matter } from "../../frontmatter";`. Verify the 1 call site (line 32) still destructures correctly.
- [ ] 4.4 `src/main/lib/trpc/routers/agent-utils.ts`: replace `import matter from "gray-matter";` on line 4 with `import { matter } from "../../frontmatter";`. Verify the 1 call site (line 55) still destructures correctly.

## 5. Apply the narrow-fix for `agent-utils.ts:85`

> Front-matter's stricter generic default surfaces a latent bug: `VALID_AGENT_MODELS.includes(data.model)` where `data.model` is now `unknown` instead of `any`. The fix is a type narrow + explicit cast.

- [ ] 5.1 In `src/main/lib/trpc/routers/agent-utils.ts`, locate the `// Validate model` block (line ~83–87) and replace:

  ```ts
  const model =
    data.model && VALID_AGENT_MODELS.includes(data.model)
      ? (data.model as AgentModel)
      : undefined;
  ```

  with:

  ```ts
  const model =
    typeof data.model === "string" &&
    VALID_AGENT_MODELS.includes(data.model as AgentModel)
      ? (data.model as AgentModel)
      : undefined;
  ```

- [ ] 5.2 Verify `bun run ts:check 2>&1 | grep -c "error TS"` returns `0`.
- [ ] 5.3 Note in the commit message that this is a **small latent bug fix**: pre-migration code silently bypassed validation for non-string `model` values (would return `false` from `.includes()`, then the `&&` short-circuit set `model = undefined`). Post-migration code achieves the same observable result but via an explicit guard that refuses to call `.includes()` on non-strings.

## 6. Update `electron.vite.config.ts`

- [ ] 6.1 In `electron.vite.config.ts`, locate `main.build.externalizeDeps.exclude` (line ~12) and replace `"gray-matter"` with `"front-matter"`. The full exclude array should read: `["superjson", "trpc-electron", "front-matter", "async-mutex"]`.
- [ ] 6.2 Verify the file still parses: `bun run ts:check 2>&1 | grep -c "electron.vite.config"`. Expect `0`.

## 7. Add the no-gray-matter regression guard

- [ ] 7.1 Create `tests/regression/no-gray-matter.test.ts` that:
  - Reads `package.json` and asserts `dependencies` and `devDependencies` do not contain a key named `gray-matter`.
  - Uses `fs.readdirSync` recursively over `src/main/` (excluding `node_modules/`) to find `.ts` and `.tsx` files.
  - For each file, asserts that it does not contain `import ... from "gray-matter"`, `require("gray-matter")`, `import ... from "front-matter"` (unless the file is `src/main/lib/frontmatter.ts`), or `require("front-matter")` (same exemption).
  - On failure, emits a structured error message with file path, line number, matching snippet, and a remediation hint pointing at `src/main/lib/frontmatter.ts` as the canonical entry point.
  - Runs in <200ms, side-effect-free, no network access.
- [ ] 7.2 Follow the regression guard conventions in `docs/conventions/regression-guards.md` and the existing guard patterns in `tests/regression/credential-storage-tier.test.ts` and `tests/regression/no-scratchpad-references.test.ts` as references.
- [ ] 7.3 Verify the guard passes: `bun test tests/regression/no-gray-matter.test.ts`. Expect 1 test pass.
- [ ] 7.4 Sanity-check the guard actually fires: temporarily add `import matter from "gray-matter";` to `src/main/lib/trpc/routers/commands.ts`, run the guard, confirm it FAILS with a clear error message. Revert the temporary edit.

## 8. Add the frontmatter shim unit test

- [ ] 8.1 Create `tests/regression/frontmatter-shim-shape.test.ts` that:
  - Imports `matter` from `src/main/lib/frontmatter.ts`.
  - Tests: standard `---\\nkey: value\\n---\\nbody` input produces `{ data: { key: "value" }, content: "body" }` (modulo trim).
  - Tests: empty-frontmatter input (`"just body"`) produces `{ data: {}, content: "just body" }` (or equivalent).
  - Tests: empty-string input (`""`) produces a valid `{ data, content }` shape without throwing.
  - Tests: BOM-prefixed input (`"\\uFEFF---\\nkey: value\\n---\\nbody"`) parses correctly.
  - Tests: a sample agent .md fixture (e.g., `tests/fixtures/sample-agent.md` — create if needed) parses into the shape `parseAgentMd` expects, with `data.name`, `data.description`, and `data.tools` accessible as properties of the correct type (after narrowing).
- [ ] 8.2 Verify the unit test passes: `bun test tests/regression/frontmatter-shim-shape.test.ts`. Expect all assertions pass.

## 9. Validation plan (all six quality gates — must pass before PR)

- [ ] 9.1 `bun run ts:check` — expect **0 errors**, baseline preserved. If any errors surface, investigate before proceeding.
- [ ] 9.2 `bun run lint` — expect clean (no new eslint or sonarjs findings).
- [ ] 9.3 `bun run build` — expect clean completion AND no Rollup eval warning. Verify explicitly: `bun run build 2>&1 | grep -iE "(gray-matter|engines\.js|eval)" | wc -l` must return `0`.
- [ ] 9.4 `bun test` — expect 174 tests now (172 baseline + 1 no-gray-matter guard + 1 frontmatter-shim-shape test). 0 failures. 10 skipped integration tests unchanged.
- [ ] 9.5 `bun audit` — expect unchanged count of advisories (pre-existing ones only; the new `front-matter` package should not introduce new advisories).
- [ ] 9.6 `cd docs && bun run build && cd ..` — expect unchanged (this change does not touch docs, but the gate must pass).
- [ ] 9.7 Bundle introspection (per `.claude/rules/vite-config.md`):
  - `grep -cE 'require\\("gray-matter"\\)' out/main/index.js` → expect `0`
  - `grep -c "parseMatter\\|engines\\.js" out/main/index.js` → expect `0`
  - `grep -c "FrontMatterResult\\|bodyBegin" out/main/index.js` → expect >0
  - `grep -cE 'require\\("front-matter"\\)' out/main/index.js` → expect `0` (bundled, not required)

## 10. Manual runtime smoke test

- [ ] 10.1 Run the desktop app from inside the worktree: `bun run dev`.
- [ ] 10.2 In the running app, open the Commands panel (hover the `/` button or the commands chip). Verify the list populates, entries show descriptions, and no `[commands] Failed to parse frontmatter` errors appear in the terminal stdout for valid files.
- [ ] 10.3 Open the Agents panel. Verify agents list with names + descriptions and that `model: sonnet`/`opus`/`haiku`/`inherit` agents resolve correctly. Spot-check 2–3 agents by clicking to view.
- [ ] 10.4 Open the Skills panel. Verify SKILL.md files parse and show in the list.
- [ ] 10.5 Open the Plugins panel. Verify each plugin's commands/skills/agents expand with the expected counts.
- [ ] 10.6 Kill the dev server with Ctrl+C.

## 11. Documentation updates

- [ ] 11.1 In `docs/operations/roadmap.md`, move the "Eliminate gray-matter eval warning" item from the active backlog section to the "Recently Completed" table. Record: date completed (today), change name (`replace-gray-matter-with-front-matter`), and a one-line note citing the factual corrections from `proposal.md` "Impact" section ("3 packages dropped, not 7; Option 1 empirically does not work; Option 3 deferred pending ESM-in-main refactor").
- [ ] 11.2 Use the `/roadmap` skill (`roadmap-tracker`) to mark the item complete rather than hand-editing, if the skill supports it.
- [ ] 11.3 Do NOT edit CLAUDE.md, .serena/memories/, `.claude/PROJECT_INDEX.md`, or README for this change — those surfaces are synced by the `/session-sync` skill after merge, not per-change. Skip unless `docs-drift-check` surfaces a specific drift.
- [ ] 11.4 Do NOT reference `.scratchpad/research-notes/gray-matter-eval-warning-research.md` from any tracked file, including commit messages, PR descriptions, or the roadmap entry. Per `.claude/rules/scratchpad.md`, tracked files never cite scratchpad contents. The research has already been promoted inline into `proposal.md` and `design.md`.

## 12. OpenSpec validation + commit + push + PR

- [ ] 12.1 Validate the change: `bunx @fission-ai/openspec@1.2.0 validate --change replace-gray-matter-with-front-matter --strict --no-interactive`. Expect a clean validation — no errors, no warnings.
- [ ] 12.2 Stage only the files this change touches. **Do NOT use `git add -A`** — another change may be in progress in a separate worktree. Explicit `git add`:
  - `git add package.json bun.lock`
  - `git add src/main/lib/frontmatter.ts`
  - `git add src/main/lib/trpc/routers/commands.ts src/main/lib/trpc/routers/plugins.ts src/main/lib/trpc/routers/skills.ts src/main/lib/trpc/routers/agent-utils.ts`
  - `git add electron.vite.config.ts`
  - `git add tests/regression/no-gray-matter.test.ts tests/regression/frontmatter-shim-shape.test.ts`
  - `git add tests/fixtures/sample-agent.md` (if a new fixture was created)
  - `git add docs/operations/roadmap.md`
  - `git add openspec/changes/replace-gray-matter-with-front-matter/` (the OpenSpec artifacts themselves)
- [ ] 12.3 Review the staged diff one more time: `git diff --cached --stat` then `git diff --cached | less`. Verify you see exactly the expected files, no stray edits.
- [ ] 12.4 Commit with a descriptive message. Suggested format:

  ```
  feat(main): replace gray-matter with front-matter to eliminate Rollup eval warning

  - New src/main/lib/frontmatter.ts shim (canonical main-process parser)
  - 8 call sites across 4 routers swapped to import from the shim
  - electron.vite.config.ts externalizeDeps updated gray-matter -> front-matter
  - agent-utils.ts:85 narrow-fix for VALID_AGENT_MODELS.includes typing
  - 2 new regression guards (no-gray-matter, frontmatter-shim-shape)
  - Roadmap item moved to Recently Completed

  Empirically eliminates the Rollup warning at gray-matter/lib/engines.js:43.
  Bundle introspection confirms: 0 references to parseMatter/engines.js in
  out/main/index.js; FrontMatterResult/bodyBegin present (bundled, not
  externalized).

  OpenSpec change: replace-gray-matter-with-front-matter
  ```

- [ ] 12.5 Push the feature branch: `git push -u origin feat/replace-gray-matter-with-front-matter`.
- [ ] 12.6 Open a pull request: `gh pr create --title "feat(main): replace gray-matter with front-matter" --body "<body derived from the commit message plus a link to the OpenSpec change directory>"`. Do NOT reference `.scratchpad/` from the PR body.
- [ ] 12.7 Record the PR URL in the change's `tasks.md` here (check this item off and paste the URL inline as a reference for `/opsx:verify`).

## 13. Post-merge cleanup (MUST run last — only after PR is merged)

- [ ] 13.1 From inside the worktree, verify the feature branch is merged: `git fetch origin && git log origin/main --oneline | grep "replace gray-matter"`. Confirm your commit is in main.
- [ ] 13.2 Return to the main checkout: `cd /Users/jason/dev/ai-stack/ai-coding-cli`.
- [ ] 13.3 Remove the worktree: `git worktree remove ../ai-coding-cli-worktrees/replace-gray-matter-with-front-matter`. This deletes the checkout directory.
- [ ] 13.4 Prune stale worktree references: `git worktree prune`.
- [ ] 13.5 Delete the remote feature branch if not auto-deleted: `git push origin --delete feat/replace-gray-matter-with-front-matter` (skip if the repo is configured to auto-delete branches on merge).
- [ ] 13.6 Pull the latest main: `git pull --ff-only origin main`. Verify `bun run build 2>&1 | grep -iE "engines\.js" | wc -l` returns `0` — the warning is gone from `main`.
- [ ] 13.7 Run `/opsx:verify replace-gray-matter-with-front-matter` to confirm the implementation matches the OpenSpec artifacts.
- [ ] 13.8 Run `/opsx:archive replace-gray-matter-with-front-matter` to archive the change and promote the `frontmatter-parsing` capability spec into `openspec/specs/frontmatter-parsing/spec.md` as a new baseline.
- [ ] 13.9 Update `.scratchpad/research-notes/gray-matter-eval-warning-research.md` with a "Status: Shipped — see archived change `YYYY-MM-DD-replace-gray-matter-with-front-matter`" header line (inside the scratchpad; no reference from tracked files).

## 14. If rollback is needed mid-review (before merge)

> Only execute tasks in this section if the PR receives a request for changes that cannot be addressed incrementally, or if runtime smoke testing surfaces a blocker.

- [ ] 14.1 From inside the worktree, reset the feature branch to main: `git fetch origin && git reset --hard origin/main`.
- [ ] 14.2 Run `bun install --frozen-lockfile` to restore gray-matter.
- [ ] 14.3 Run `bun run build` and verify the eval warning is back at its baseline position (confirms clean rollback).
- [ ] 14.4 Close the PR with a note explaining the rollback reason.
- [ ] 14.5 Return to the main checkout and remove the worktree: `cd /Users/jason/dev/ai-stack/ai-coding-cli && git worktree remove ../ai-coding-cli-worktrees/replace-gray-matter-with-front-matter`.
- [ ] 14.6 Update the roadmap item with the rollback rationale so the next attempt has context.
