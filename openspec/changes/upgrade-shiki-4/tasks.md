## 1. Pre-merge validation

- [ ] 1.1 Verify PR #11 (`dependabot/bun/shiki-4.0.2`) is still green: `gh pr view 11 --json statusCheckRollup` — all 6 quality gates (`ts:check`, `lint`, `build`, `test`, `audit`, `docs-build`) + CodeQL must show `SUCCESS`. Re-run workflow if stale: `gh workflow run ci.yml --ref dependabot/bun/shiki-4.0.2`
- [ ] 1.2 Re-confirm `@pierre/diffs@1.1.13` has NO shiki in `peerDependencies`: `bun info @pierre/diffs` — only `react` and `react-dom` should appear under `peerDependencies`. If this has changed since the investigation, reassess before merging.
- [ ] 1.3 Read PR #11's `bun.lock` diff: `gh pr diff 11 -- bun.lock` — confirm the diff shows top-level `shiki@4.0.2` AND a nested `"@pierre/diffs/shiki": ["shiki@3.23.0", ...]` entry alongside its `@shikijs/core@3.23.0` subdeps
- [ ] 1.4 Check out PR #11 branch locally: `gh pr checkout 11 && bun install`
- [ ] 1.5 Verify node_modules shows both shiki versions: `cat node_modules/shiki/package.json | grep '"version"'` reports `4.0.2`; either `cat node_modules/@pierre/diffs/node_modules/shiki/package.json | grep '"version"'` reports `3.x` OR `bun.lock` declares a nested `@pierre/diffs/shiki` resolution at `3.x` (Bun's hoisting behavior varies). Also record the on-disk footprint for the measurement log: `du -sh node_modules/@pierre/diffs/node_modules/ 2>/dev/null` (writes to §8 at the bottom of this file).
- [ ] 1.6 Pre-flight type check against shiki 4 API surface: `bun run ts:check 2>&1 | grep -i "shiki" | tee /tmp/shiki-tserrors.txt` — MUST report zero lines in the output. Any shiki-related type error is a BLOCKER because the proposal asserts "no API surface breakage." If errors appear, abort the plan and reassess. `shiki-theme-loader.ts` uses a namespace import (`import * as shiki from "shiki"`), so the coupling surface includes every type reference from that namespace.

## 2. Bundle size validation

- [ ] 2.1 Baseline measurement on main: `git checkout main && bun install && bun run build && du -sh out/renderer/assets/ | tee /tmp/shiki-baseline.txt && ls out/renderer/assets/*.js | wc -l >> /tmp/shiki-baseline.txt`
- [ ] 2.2 Post-upgrade measurement: `gh pr checkout 11 && bun install && bun run build && du -sh out/renderer/assets/ | tee /tmp/shiki-post.txt && ls out/renderer/assets/*.js | wc -l >> /tmp/shiki-post.txt`
- [ ] 2.3 Compute delta: `diff /tmp/shiki-baseline.txt /tmp/shiki-post.txt` — record size-before, size-after, chunk-count-before, chunk-count-after as a comment at the bottom of this tasks.md
- [ ] 2.4 Assert pass threshold: renderer assets size MUST be ≤ 110% of baseline. If the threshold is breached, DO NOT merge — instead execute the escalation defined in design.md §Risks (investigate `@pierre/diffs` dynamic import potential, file upstream issue, or defer behind a roadmap entry)
- [ ] 2.5 **Required depth check** — grep the renderer output for shiki bundles and verify no single chunk contains BOTH version 3 and version 4 markers simultaneously (answers design.md Open Question Q1 empirically):
  - `grep -l "shiki" out/renderer/assets/*.js > /tmp/shiki-chunks.txt` — enumerate chunks mentioning shiki
  - For each chunk in `/tmp/shiki-chunks.txt`, check whether it contains a v3 marker (e.g. `"version":"3.23.0"` or `@shikijs/core@3`) AND a v4 marker (e.g. `"version":"4.0.2"` or `@shikijs/core@4`). The intersection (chunks containing both) MUST be empty, OR the finding MUST be documented in the measurements block at the bottom of this file as an accepted outcome
  - Record the total chunk count matching `shiki` to the measurements block
  - **Pass criterion (soft):** Between 5% and 10% renderer size regression → land, but add a roadmap entry to investigate `@pierre/diffs` dynamic-import potential. **Pass criterion (hard fail):** >10% regression → do NOT merge; execute the escalation in design.md §Risks

## 3. Runtime verification (from `.claude/rules/vite-config.md` playbook)

- [ ] 3.1 On PR #11 branch: `bun run dev` — wait for `[claude] SDK initialization took Xs` and `[DB] Migrations completed`
- [ ] 3.2 Test top-level `shiki@4.0.2` path: create a new chat, paste a TypeScript code block, verify syntax highlighting renders (exercises `highlightCode()` → `codeToHtml` in `src/renderer/lib/themes/shiki-theme-loader.ts`)
- [ ] 3.3 Test top-level `shiki@4.0.2` path via custom diff highlighter: trigger an agent session that produces multi-file diffs, open the diff sidebar, verify diff lines are syntax-highlighted (exercises `createCustomDiffHighlighter()` → `codeToHast` in `src/renderer/lib/themes/diff-view-highlighter.ts`)
- [ ] 3.4 Test nested `@pierre/diffs/shiki@3.23.0` path: open a diff via the `PatchDiff` / `FileDiff` components in `src/renderer/features/agents/ui/agent-diff-view.tsx` — verify no runtime errors in the dev console, diff renders with highlighting
- [ ] 3.5 Test theme switching — broad coverage: in Settings → Appearance, cycle through **all 9 mapped themes in `THEME_TO_SHIKI_MAP`** (`1code-dark`, `1code-light`, `claude-dark`, `claude-light`, `vesper-dark`, `vitesse-dark`, `vitesse-light`, `min-dark`, `min-light`) PLUS **at least one `BUILTIN_THEMES` entry with populated `tokenColors`** (e.g. a Cursor theme) to exercise the `loadFullTheme()` code path in `src/renderer/lib/themes/shiki-theme-loader.ts:131`. Verify highlighting remains correct after each switch. This path is the risk surface for Shiki 4 theme-schema changes (see design.md §Risks "loadTheme input schema").
- [ ] 3.6 Capture dev-server stdout: grep the dev log for `shiki` — there should be zero WARN or ERROR lines mentioning shiki. Also grep for `Failed to load full theme` — that string is the specific error `loadFullTheme`'s catch block emits if Shiki 4 tightened the theme schema
- [ ] 3.7 Dev-console: open Electron DevTools on the renderer, check Console tab for any shiki-related errors, unhandled rejections, or `Failed to load full theme` messages during steps 3.2-3.5

## 4. Quality gates (all 6, from CLAUDE.md §Commands)

- [ ] 4.1 `bun run ts:check` — MUST report ≤ the current value of `.claude/.tscheck-baseline` (45 as of 2026-04-10 after commit `46f49a4`; re-read the file at execution time as it may have shifted further)
- [ ] 4.2 `bun run lint` — MUST exit 0
- [ ] 4.3 `bun run build` — MUST exit 0, electron-vite emits main+preload CJS and renderer ESM
- [ ] 4.4 `bun test` — MUST report all regression guards passing (14 regression guards in `tests/regression/` + 5 service test files in `services/1code-api/tests/`)
- [ ] 4.5 `bun audit` — MUST NOT show any new advisories compared to main baseline (58 pre-existing dev-dep advisories). Diff via `bun audit 2>&1 | wc -l` before and after if in doubt.
- [ ] 4.6 `cd docs && bun run build` — xyd docs site MUST build clean

## 5. Merge and post-merge cleanup

- [ ] 5.1 Merge PR #11 to main via the normal branch-protection flow (required CI + admin approval)
- [ ] 5.2 Pull latest main: `git checkout main && git pull`
- [ ] 5.3 Edit `openspec/changes/upgrade-vite-8-build-stack/proposal.md` — remove ALL Shiki content (use section-header/string anchors, not line numbers, because the file may have drifted). Specifically:
  - Remove the `### Shiki 3→4 (blocked on @pierre/diffs)` section in its entirety (from the heading through its final line, stopping at the next `## Capabilities` heading)
  - Remove the paragraph in `## Why` beginning with "Additionally, **Shiki 3→4** is grouped here because…"
  - In the Risk surface list, remove the bullet `- **Critical blocker:** @pierre/diffs shiki v4 + @shikijs/transformers v4 support (Shiki upgrade)`
  - In the Risk surface list, remove the bullet `- **No risk:** Shiki API changes (none that affect us)`
  - Leave the neutral "shiki version bumps" / "shiki import verification" mentions in the `## Impact` > Affected code section alone — those are incidental and still accurate after this change ships
  - Verify with `grep -n "Shiki\|shiki" openspec/changes/upgrade-vite-8-build-stack/proposal.md` — only the `## Impact` mentions should remain
- [ ] 5.4 Edit `openspec/changes/upgrade-vite-8-build-stack/design.md` — remove ALL Shiki content:
  - Remove the `### Shiki 3→4 (Trivial When Unblocked)` section in its entirety (heading through final numbered list item, stopping at the next `### Electron-Specific Constraints` heading)
  - In the `## Context` section's Phase B bullet, remove the `+ Shiki 3→4` suffix from the phrase "Vite 7→8 + electron-vite 5→6 + plugin-react 5→6 + Shiki 3→4" — final text should be "Vite 7→8 + electron-vite 5→6 + plugin-react 5→6"
  - Verify with `grep -n "Shiki\|shiki" openspec/changes/upgrade-vite-8-build-stack/design.md` — should return zero matches
- [ ] 5.5 Edit `openspec/changes/upgrade-vite-8-build-stack/tasks.md`:
  - Remove `## 10. Shiki upgrade (blocked on @pierre/diffs)` entirely (heading through tasks 10.1-10.9)
  - Renumber `## 11. Final documentation` → `## 10. Final documentation`, its sub-tasks `11.1` → `10.1`, `11.2` → `10.2`, `11.3` → `10.3`
  - Renumber `## 12. Post-all-upgrades validation sweep` → `## 11. Post-all-upgrades validation sweep`, its sub-tasks accordingly
  - In the newly-renumbered task `10.1`, edit the phrase "remove Vite 6.x and Shiki 3.x pins" to "remove Vite 6.x pin" — the Shiki 3.x pin will already be removed by this change's Task 5.7, so leaving the reference would make task 10.1 a partial no-op
  - Verify with `grep -n "Shiki\|shiki" openspec/changes/upgrade-vite-8-build-stack/tasks.md` — should return zero matches
- [ ] 5.6 Validate the Vite 8 change still passes: `bunx @fission-ai/openspec@1.2.0 validate upgrade-vite-8-build-stack --strict --no-interactive`
- [ ] 5.7 Edit `docs/conventions/pinned-deps.md` — remove the `shiki: 3.x` pin entry (or update to `shiki: 4.x` if the file documents current pins rather than pins-with-reasons)
- [ ] 5.8 Edit `docs/architecture/tech-stack.md` — bump any Shiki version reference from `3.x` to `4.x`
- [ ] 5.9 Edit `CLAUDE.md` "Version pins (load-bearing)" line — remove or update the "Shiki 3.x" mention to reflect the new 4.x pin
- [ ] 5.10 Edit `docs/operations/roadmap.md` — move the `[Research] Re-evaluate Shiki 4 upgrade tractability` entry from the P2/P3 research section to "Recently Completed" with completion date `2026-04-10` and a one-line summary citing this change's proposal
- [ ] 5.11 Run `/session-sync` skill to catch any remaining documentation drift across CLAUDE.md, Serena memories, `.claude/PROJECT_INDEX.md`, and the code-review graph

## 6. Archive the change

- [ ] 6.1 Run `bunx @fission-ai/openspec@1.2.0 validate upgrade-shiki-4 --strict --no-interactive` — MUST pass
- [ ] 6.2 Run `bunx @fission-ai/openspec@1.2.0 archive upgrade-shiki-4 --yes` — promotes `specs/shiki-highlighter/spec.md` to `openspec/specs/shiki-highlighter/spec.md`, moves the change to `openspec/changes/archive/2026-04-10-upgrade-shiki-4/`
- [ ] 6.3 Verify baseline specs now include `shiki-highlighter`: `bunx @fission-ai/openspec@1.2.0 list --specs | grep shiki-highlighter` — MUST appear with a non-zero requirement count
- [ ] 6.4 Verify `upgrade-vite-8-build-stack` still active: `bunx @fission-ai/openspec@1.2.0 list` — MUST show it, MUST NOT show `upgrade-shiki-4`
- [ ] 6.5 Verify `.claude/.tscheck-baseline` is unchanged (still `54`) — open the file and confirm

## 7. Post-archive follow-ups (non-blocking)

- [ ] 7.1 File an issue or PR on `@pierre/diffs` asking for `shiki@^4` + `@shikijs/transformers@^4` compatibility — once upstream updates, a future change can collapse the dual-version install
- [ ] 7.2 Add a roadmap entry `[Blocked] Collapse shiki dual-version install` referencing the upstream issue, effort Small, prereqs `@pierre/diffs` publishes a shiki-4-compatible release
- [ ] 7.3 Commit with message `feat(shiki): upgrade to shiki 4.0.2 (resolves PR #11)` and push

## 8. Measurement log (filled in during Phases 1 and 2)

**On-disk footprint (from Task 1.5):**

| Metric | Baseline (main) | Post-upgrade (PR #11) | Delta |
|---|---|---|---|
| `du -sh node_modules/shiki/` | _TBD_ | _TBD_ | _TBD_ |
| `du -sh node_modules/@shikijs/` | _TBD_ | _TBD_ | _TBD_ |
| `du -sh node_modules/@pierre/diffs/node_modules/` | _TBD_ | _TBD_ | _TBD_ |

**Renderer bundle (from Phase 2):**

| Metric | Baseline (main) | Post-upgrade (PR #11) | Delta | Pass? |
|---|---|---|---|---|
| `du -sh out/renderer/assets/` | _TBD_ | _TBD_ | _TBD_ | _(≤ +10%)_ |
| `ls out/renderer/assets/*.js \| wc -l` (chunk count) | _TBD_ | _TBD_ | _TBD_ | — |
| Chunks containing shiki markers (Task 2.5) | _TBD_ | _TBD_ | — | — |
| Chunks containing BOTH v3 and v4 markers (Task 2.5) | — | _TBD_ | — | _(MUST be 0)_ |

**Pass thresholds** (from the `shiki-highlighter` capability spec):
- Hard fail: renderer size delta > +10% → do NOT merge, execute escalation
- Soft warning: renderer size delta between +5% and +10% → land, but add a roadmap entry to investigate `@pierre/diffs` dynamic-import potential
- Clean pass: renderer size delta ≤ +5%
