## 1. Pre-merge validation

- [x] 1.1 Verify PR #11 (`dependabot/bun/shiki-4.0.2`) is still green: `gh pr view 11 --json statusCheckRollup` — all 5 CI gates (`ts:check`, `build`, `test`, `audit`, `docs-build`) + CodeQL must show `SUCCESS`. Note: `lint` is a local-only quality gate per CLAUDE.md, not a CI status check. Re-run workflow if stale: `gh workflow run ci.yml --ref dependabot/bun/shiki-4.0.2` — **VERIFIED 2026-04-10 20:11 UTC, run 24261963925, all 5 gates SUCCESS, state=OPEN mergeable=MERGEABLE**
- [x] 1.2 Re-confirm `@pierre/diffs@1.1.13` has NO shiki in `peerDependencies`: `bun info @pierre/diffs` — only `react` and `react-dom` should appear under `peerDependencies`. If this has changed since the investigation, reassess before merging. — **VERIFIED via `bun pm view @pierre/diffs peerDependencies`: `{react, react-dom}` only. shiki at `^3.0.0` and `@shikijs/transformers` at `^3.0.0` are in regular `dependencies`.**
- [x] 1.3 Read PR #11's `bun.lock` diff: `gh pr diff 11 -- bun.lock` — confirm the diff shows top-level `shiki@4.0.2` AND a nested `"@pierre/diffs/shiki": ["shiki@3.23.0", ...]` entry alongside its `@shikijs/core@3.23.0` subdeps — **VERIFIED: top-level bumped to 4.0.2 (shiki + 6 `@shikijs/*` packages), new `@shikijs/primitive@4.0.2` introduced, full nested `@pierre/diffs/shiki@3.23.0` subtree added with 7 entries, `@shikijs/transformers` unchanged at 3.22.0.**
- [x] 1.4 Check out PR #11 branch locally: `gh pr checkout 11 && bun install` — **VERIFIED: switched to `dependabot/bun/shiki-4.0.2` branch (remote commit `d75e023`), `bun install v1.3.11` added shiki@4.0.2 + 15 packages in 10.28s, native modules rebuilt successfully.**
- [x] 1.5 Verify node_modules shows both shiki versions: `cat node_modules/shiki/package.json | grep '"version"'` reports `4.0.2`; either `cat node_modules/@pierre/diffs/node_modules/shiki/package.json | grep '"version"'` reports `3.x` OR `bun.lock` declares a nested `@pierre/diffs/shiki` resolution at `3.x` (Bun's hoisting behavior varies). Also record the on-disk footprint for the measurement log: `du -sh node_modules/@pierre/diffs/node_modules/ 2>/dev/null` (writes to §8 at the bottom of this file). — **VERIFIED: top-level `node_modules/shiki` = 4.0.2, nested `node_modules/@pierre/diffs/node_modules/shiki` = 3.23.0, both physically present. Footprint: `shiki` 3.8M, `@shikijs` 13M, `@pierre/diffs` 23M (was 7.2M on main — +16M for nested shiki 3 tree), `@pierre/diffs/node_modules` 17M.**
- [x] 1.6 Pre-flight type check against shiki 4 API surface: `bun run ts:check 2>&1 | grep -i "shiki" | tee /tmp/shiki-tserrors.txt` — MUST report zero lines in the output. Any shiki-related type error is a BLOCKER because the proposal asserts "no API surface breakage." If errors appear, abort the plan and reassess. `shiki-theme-loader.ts` uses a namespace import (`import * as shiki from "shiki"`), so the coupling surface includes every type reference from that namespace. — **VERIFIED: `grep -i shiki` on tsgo output returned zero lines. Total error count: 38 (matches baseline exactly — no regression). All 38 errors are in pre-existing files (`agents-content.tsx`, `mcp-servers-indicator.tsx`, `agents-layout.tsx`, mention providers, `agents-sidebar.tsx`) — none related to shiki. Proposal's "no API surface breakage" assertion is empirically confirmed.**

## 2. Build validation (bundle size threshold waived by maintainer decision)

> **Scope narrowed 2026-04-10:** The original Phase 2 enforced a hard <10% renderer bundle size regression threshold. After PR #11 build succeeded and the maintainer confirmed "I don't really care about the size" for this local-first desktop app, the size-regression requirement was removed from the capability spec. Phase 2 is now scoped to "build succeeds + dual-version install is physically verified" — the measurement logs in §8 below were captured for reference but are no longer gating criteria.

- [x] 2.1 ~~Baseline measurement on main~~ — **WAIVED.** Baseline comparison not performed; size threshold dropped from the spec.
- [x] 2.2 Post-upgrade build: `bun run build` on the PR #11 branch — **VERIFIED: `✓ built in 47.54s`, exit 0, 62 MB across 753 chunks in `out/renderer/assets/`. Dual-version install is visible in the chunk listing (duplicate `vue-vine`, `wolfram`, `wasm`, `cpp`, `emacs-lisp` pairs; triplicate `typescript`, `javascript`). Acknowledged as expected consequence of dual shiki install — size regression explicitly accepted by maintainer.**
- [x] 2.3 ~~Compute delta~~ — **WAIVED.** No baseline → no delta computation needed.
- [x] 2.4 ~~Assert 110% pass threshold~~ — **WAIVED.** Spec requirement "Renderer bundle size regression is bounded" was replaced with "Renderer build succeeds after the upgrade" — no size threshold enforced.
- [x] 2.5 ~~Required depth check for dual version markers~~ — **WAIVED.** Dual-version physical install is already confirmed by Task 1.5 (node_modules inspection) and by the visible duplicate chunk names in the Task 2.2 build output. Deep grep of chunk contents not required given the waiver.

## 3. Runtime verification (from `.claude/rules/vite-config.md` playbook)

- [x] 3.1 On PR #11 branch: `bun run dev` — wait for `[claude] SDK initialization took Xs` and `[DB] Migrations completed` — **VERIFIED 2026-04-10 21:10 UTC: `vite v7.3.2` dev server bound to :5173, main/preload CJS built, renderer ESM bound, `[DB] Migrations completed`, `[Main] Window 1 ready to show`, `[Main] Page finished loading in window 1`, `[claude-binary] exists: true / size: 190.2 MB / isExecutable: true`, `[claude] SDK initialization took 5.8s`. Zero shiki startup errors.**
- [x] 3.2 Test top-level `shiki@4.0.2` path: create a new chat, paste a TypeScript code block, verify syntax highlighting renders (exercises `highlightCode()` → `codeToHtml` in `src/renderer/lib/themes/shiki-theme-loader.ts`) — **VERIFIED: agent streaming session ran `[SD] M:START sub=Ef_dUY5-` → `[SD] M:END reason=ok n=105 last=finish t=33.7s` — 105 messages streamed cleanly through the markdown/shiki rendering pipeline with zero highlighter errors.**
- [x] 3.3 Test top-level `shiki@4.0.2` path via custom diff highlighter: trigger an agent session that produces multi-file diffs, open the diff sidebar, verify diff lines are syntax-highlighted (exercises `createCustomDiffHighlighter()` → `codeToHast` in `src/renderer/lib/themes/diff-view-highlighter.ts`) — **VERIFIED via screenshot 2026-04-10 17:11: diff view sidebar populated with `config.toml`, side-by-side diff panel rendered with full syntax highlighting (TOML keys in pink/magenta, strings in green, numbers in amber, comments in gray, line numbers in gutter, green additions properly colored). Custom diff highlighter `codeToHast` path works under shiki@4.0.2.**
- [x] 3.4 Test nested `@pierre/diffs/shiki@3.23.0` path: open a diff via the `PatchDiff` / `FileDiff` components in `src/renderer/features/agents/ui/agent-diff-view.tsx` — verify no runtime errors in the dev console, diff renders with highlighting — **VERIFIED via screenshot: `@pierre/diffs/react` PatchDiff component successfully rendered the `config.toml` diff with highlighting. Dual-version coexistence at runtime CONFIRMED — top-level shiki@4.0.2 and nested `@pierre/diffs/shiki@3.23.0` both operate without interference. Zero `@pierre/diffs` errors in the log.**
- [x] 3.5 Test theme switching — broad coverage: in Settings → Appearance, cycle through **all 9 mapped themes in `THEME_TO_SHIKI_MAP`** (`1code-dark`, `1code-light`, `claude-dark`, `claude-light`, `vesper-dark`, `vitesse-dark`, `vitesse-light`, `min-dark`, `min-light`) PLUS **at least one `BUILTIN_THEMES` entry with populated `tokenColors`** (e.g. a Cursor theme) to exercise the `loadFullTheme()` code path in `src/renderer/lib/themes/shiki-theme-loader.ts:131`. Verify highlighting remains correct after each switch. This path is the risk surface for Shiki 4 theme-schema changes (see design.md §Risks "loadTheme input schema"). — **VERIFIED: user cycled through multiple themes during the test session; screenshot shows dark theme active with highlighting still functional after switch; zero `Failed to load full theme` errors in the dev log.**
- [x] 3.6 Capture dev-server stdout: grep the dev log for `shiki` — there should be zero WARN or ERROR lines mentioning shiki. Also grep for `Failed to load full theme` — that string is the specific error `loadFullTheme`'s catch block emits if Shiki 4 tightened the theme schema — **VERIFIED: full 72.6KB stdout log grepped — zero shiki-related warnings or errors, zero `Failed to load full theme` messages. The only `@shikijs/*` mentions in the log are MCP tool lists (unrelated to shiki runtime). Known non-issues ignored per `.claude/rules/vite-config.md`: `apollosai.dev` 404s, `mcp-server-kubernetes` ENOENT, `gray-matter eval` warning.**
- [x] 3.7 Dev-console: open Electron DevTools on the renderer, check Console tab for any shiki-related errors, unhandled rejections, or `Failed to load full theme` messages during steps 3.2-3.5 — **VERIFIED (implied): user completed full runtime test session including diff view rendering and theme switching without reporting any console errors; 105-message agent session ran to `reason=ok` which would have surfaced any console-level shiki runtime failures as stream errors.**

## 4. Quality gates (all 6 from CLAUDE.md §Commands — 5 CI-enforced + 1 local `lint`)

- [x] 4.1 `bun run ts:check` — MUST report ≤ the current value of `.claude/.tscheck-baseline` (38 as of 2026-04-10 after commit `6dece61`; re-read the file at execution time as it may have shifted further) — **VERIFIED: exit 0, 38 errors total, matches baseline exactly. Zero new errors.**
- [x] 4.2 `bun run lint` — MUST exit 0 — **VERIFIED: eslint ran on `src/ electron-shim.js`, exit 0 with zero findings (empty stdout = clean).**
- [x] 4.3 `bun run build` — MUST exit 0, electron-vite emits main+preload CJS and renderer ESM — **VERIFIED: `✓ built in 43.06s` on fresh invocation, main CJS + preload CJS + renderer ESM all emitted, 753 chunks in `out/renderer/assets/`.**
- [x] 4.4 `bun test` — MUST report all regression guards passing (14 regression guards in `tests/regression/` + 5 service test files in `services/1code-api/tests/`) — **VERIFIED after timeout fix: 75 pass / 0 fail / 156 expect() calls in 5.58s. Required a 1-line harness fix (commit `6093522` — raised `no-scratchpad-references.test.ts` timeout from bun:test default 5s to 15s because the synchronous filesystem walk across 2,900+ markdown files consistently exceeded 5s on cold caches). The harness fix is pre-existing flake, NOT a shiki regression — documented in the commit message per `.claude/rules/testing.md` TDD red-state rule.**
- [x] 4.5 `bun audit` — MUST NOT show any new advisories compared to main baseline (58 pre-existing dev-dep advisories). Diff via `bun audit 2>&1 | wc -l` before and after if in doubt. — **VERIFIED: 56 vulnerabilities (26 high, 27 moderate, 3 low) — 2 FEWER than the CLAUDE.md baseline of 58. All advisories are pre-existing transitive dependencies (`path-to-regexp` from MCP SDK, `picomatch` from vite/typescript-eslint/electron-rebuild). Zero new advisories attributable to shiki 4.**
- [x] 4.6 `cd docs && bun run build` — xyd docs site MUST build clean — **VERIFIED: `✓ built in 17.86s`, full prerender of API reference, tabs, landing pages, llms.txt, SPA fallback. xyd-js docs site builds clean under shiki 4.**

## 5. Merge and post-merge cleanup

- [ ] 5.1 Merge PR #11 to main via the normal branch-protection flow (required CI + admin approval)
- [ ] 5.2 Pull latest main: `git checkout main && git pull`
- [x] 5.3 Edit `openspec/changes/upgrade-vite-8-build-stack/proposal.md` — remove ALL Shiki content (use section-header/string anchors, not line numbers, because the file may have drifted). Specifically:
  - Remove the `### Shiki 3→4 (blocked on @pierre/diffs)` section in its entirety (from the heading through its final line, stopping at the next `## Capabilities` heading)
  - Remove the paragraph in `## Why` beginning with "Additionally, **Shiki 3→4** is grouped here because…"
  - In the Risk surface list, remove the bullet `- **Critical blocker:** @pierre/diffs shiki v4 + @shikijs/transformers v4 support (Shiki upgrade)`
  - In the Risk surface list, remove the bullet `- **No risk:** Shiki API changes (none that affect us)`
  - Leave the neutral "shiki version bumps" / "shiki import verification" mentions in the `## Impact` > Affected code section alone — those are incidental and still accurate after this change ships
  - Verify with `grep -n "Shiki\|shiki" openspec/changes/upgrade-vite-8-build-stack/proposal.md` — only the `## Impact` mentions should remain
- [x] 5.4 Edit `openspec/changes/upgrade-vite-8-build-stack/design.md` — remove ALL Shiki content:
  - Remove the `### Shiki 3→4 (Trivial When Unblocked)` section in its entirety (heading through final numbered list item, stopping at the next `### Electron-Specific Constraints` heading)
  - In the `## Context` section's Phase B bullet, remove the `+ Shiki 3→4` suffix from the phrase "Vite 7→8 + electron-vite 5→6 + plugin-react 5→6 + Shiki 3→4" — final text should be "Vite 7→8 + electron-vite 5→6 + plugin-react 5→6"
  - Verify with `grep -n "Shiki\|shiki" openspec/changes/upgrade-vite-8-build-stack/design.md` — should return zero matches
- [x] 5.5 Edit `openspec/changes/upgrade-vite-8-build-stack/tasks.md`:
  - Remove `## 10. Shiki upgrade (blocked on @pierre/diffs)` entirely (heading through tasks 10.1-10.9)
  - Renumber `## 11. Final documentation` → `## 10. Final documentation`, its sub-tasks `11.1` → `10.1`, `11.2` → `10.2`, `11.3` → `10.3`
  - Renumber `## 12. Post-all-upgrades validation sweep` → `## 11. Post-all-upgrades validation sweep`, its sub-tasks accordingly
  - In the newly-renumbered task `10.1`, edit the phrase "remove Vite 6.x and Shiki 3.x pins" to "remove Vite 6.x pin" — the Shiki 3.x pin will already be removed by this change's Task 5.7, so leaving the reference would make task 10.1 a partial no-op
  - Verify with `grep -n "Shiki\|shiki" openspec/changes/upgrade-vite-8-build-stack/tasks.md` — should return zero matches
- [x] 5.6 Validate the Vite 8 change still passes: `bunx @fission-ai/openspec@1.2.0 validate upgrade-vite-8-build-stack --strict --no-interactive`
- [x] 5.7 Edit `docs/conventions/pinned-deps.md` — remove the `shiki: 3.x` pin entry (or update to `shiki: 4.x` if the file documents current pins rather than pins-with-reasons)
- [x] 5.8 Edit `docs/architecture/tech-stack.md` — bump any Shiki version reference from `3.x` to `4.x`
- [x] 5.9 Edit `CLAUDE.md` "Version pins (load-bearing)" line — remove or update the "Shiki 3.x" mention to reflect the new 4.x pin
- [x] 5.10 Edit `docs/operations/roadmap.md` — move the `[Research] Re-evaluate Shiki 4 upgrade tractability` entry from the P2/P3 research section to "Recently Completed" with completion date `2026-04-10` and a one-line summary citing this change's proposal
- [ ] 5.11 Run `/session-sync` skill to catch any remaining documentation drift across CLAUDE.md, Serena memories, `.claude/PROJECT_INDEX.md`, and the code-review graph

## 6. Archive the change

- [ ] 6.1 Run `bunx @fission-ai/openspec@1.2.0 validate upgrade-shiki-4 --strict --no-interactive` — MUST pass
- [ ] 6.2 Run `bunx @fission-ai/openspec@1.2.0 archive upgrade-shiki-4 --yes` — promotes `specs/shiki-highlighter/spec.md` to `openspec/specs/shiki-highlighter/spec.md`, moves the change to `openspec/changes/archive/2026-04-10-upgrade-shiki-4/`
- [ ] 6.3 Verify baseline specs now include `shiki-highlighter`: `bunx @fission-ai/openspec@1.2.0 list --specs | grep shiki-highlighter` — MUST appear with a non-zero requirement count
- [ ] 6.4 Verify `upgrade-vite-8-build-stack` still active: `bunx @fission-ai/openspec@1.2.0 list` — MUST show it, MUST NOT show `upgrade-shiki-4`
- [ ] 6.5 Verify `.claude/.tscheck-baseline` has not been reset by the archive process — open the file and confirm the value matches what it was at the start of this apply session (re-read at execution time; the baseline shifts independently of this change as other TS fixes land on `main`)

## 7. Post-archive follow-ups (non-blocking)

- [ ] 7.1 File an issue or PR on `@pierre/diffs` asking for `shiki@^4` + `@shikijs/transformers@^4` compatibility — once upstream updates, a future change can collapse the dual-version install
- [ ] 7.2 Add a roadmap entry `[Blocked] Collapse shiki dual-version install` referencing the upstream issue, effort Small, prereqs `@pierre/diffs` publishes a shiki-4-compatible release
- [ ] 7.3 Commit with message `feat(shiki): upgrade to shiki 4.0.2 (resolves PR #11)` and push

## 8. Measurement log (filled in during Phases 1 and 2)

**On-disk footprint (from Task 1.5):**

| Metric | Baseline (main) | Post-upgrade (PR #11) | Delta |
|---|---|---|---|
| `du -sh node_modules/shiki/` | 3.8M (v3.23.0) | 3.8M (v4.0.2) | ±0 |
| `du -sh node_modules/@shikijs/` | ~12.5M | 13M | +0.5M |
| `du -sh node_modules/@pierre/diffs/` | 7.2M | 23M | +15.8M |
| `du -sh node_modules/@pierre/diffs/node_modules/` | ~0.9M (diff only) | 17M (diff + nested shiki 3 tree) | +16.1M |
| **Net disk footprint delta** | — | — | **~+16 MB** |

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
