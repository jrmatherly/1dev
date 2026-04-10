## Why

The `[Research] Re-evaluate Shiki 4 upgrade tractability` entry in [`docs/operations/roadmap.md`](../../../docs/operations/roadmap.md) (lines 94-100) asked us to validate whether PR #11 (`shiki 3.23.0 → 4.0.2`) is mergeable standalone. Investigation (2026-04-10) shows it is:

- **PR #11 is currently green on all 6 CI quality gates** (run `24252853838`, 2026-04-10 16:24 UTC — more recent than the roadmap's cited run `24224043794`). Diff is +25/-9 across `package.json` and `bun.lock` only. The 6 gates are `ts:check`, `lint`, `build`, `test`, `audit`, and `docs-build`, matching the set documented in [`CLAUDE.md`](../../../CLAUDE.md) §Commands.
- **The roadmap's "peer-dep blocker" assumption was wrong.** `@pierre/diffs@1.1.13` pins `shiki: ^3.0.0` and `@shikijs/transformers: ^3.0.0` as regular **`dependencies`**, NOT `peerDependencies`. There is no peer-dep conflict to resolve; Bun installs a nested duplicate of `shiki@3.23.0` scoped under `node_modules/@pierre/diffs/` while top-level `shiki` advances to `4.0.2`. Verified via `bun info @pierre/diffs` (only peerDeps are `react`, `react-dom`) and confirmed in PR #11's `bun.lock` diff (explicit `"@pierre/diffs/shiki": ["shiki@3.23.0", ...]` nested tree alongside top-level `"shiki": ["shiki@4.0.2", ...]`).
- **Shiki 4 has no API breaks that affect us.** The only v4.0.0 breaking change per [shikijs/shiki#1249](https://github.com/shikijs/shiki/pull/1249) is "drop Node v18 support, requires Node v20+" (we are on Node 24), plus removal of previously-deprecated APIs (none of which we use). The existing [`upgrade-vite-8-build-stack` proposal](../upgrade-vite-8-build-stack/proposal.md) §"Shiki 3→4 (blocked on @pierre/diffs)" already validated this against every `shiki` symbol our renderer consumes.

Splitting Shiki 4 out of `upgrade-vite-8-build-stack` Phase B de-risks both efforts: Shiki is a small, independent, CI-green upgrade that ships immediately, while the Vite 8 + electron-vite 6 + plugin-react 6 Rolldown migration remains blocked on `electron-vite@6.0.0` stable release and no longer has Shiki as a tangled concern.

## What Changes

- **Bump `shiki`** in `package.json` from `3.23.0` to `4.0.2` (PR #11 already authored by Dependabot).
- **Accept dual-version coexistence in `node_modules`**: top-level `shiki@4.0.2` for renderer code, nested `@pierre/diffs/node_modules/shiki@3.23.0` for the `@pierre/diffs` package's internal use. `@shikijs/transformers` stays at `3.22.0` (hoisted at top level; no top-level consumer other than `@pierre/diffs`, so it does not need to advance to v4 until `@pierre/diffs` itself does).
- **No source code changes.** All `shiki` APIs consumed by the renderer (`createHighlighter`, `codeToHtml`, `codeToHast`, `loadTheme`, `getLoadedThemes`, `getLoadedLanguages`, `BundledTheme`, `BundledLanguage`, `Highlighter`) are unchanged in v4.
- **Follow-up edits to `upgrade-vite-8-build-stack`** (tracked as tasks in this change, not executed here): remove the `### Shiki 3→4 (blocked on @pierre/diffs)` section from `proposal.md`, the `### Shiki 3→4 (Trivial When Unblocked)` section from `design.md`, and §10 "Shiki upgrade (blocked on @pierre/diffs)" (tasks 10.1-10.9) from `tasks.md`, renumbering subsequent sections. Also remove the `## Why` paragraph "Additionally, Shiki 3→4 is grouped here…", the Risk surface bullets that mention Shiki, and the `Phase B` description's Shiki reference in `design.md`. This resolves the ownership overlap the new change creates. Exact edits are enumerated in `tasks.md` Phase 5 using section-header citations, not line numbers, so they survive file drift.
- **Documentation sync** (tracked as tasks): `docs/conventions/pinned-deps.md` (drop Shiki 3.x pin entry), `docs/architecture/tech-stack.md` (bump to 4.x), `CLAUDE.md` "Version pins" line (drop "Shiki 3.x"), `docs/operations/roadmap.md` (move the research entry to Recently Completed).

## Capabilities

### New Capabilities
- `shiki-highlighter`: Establishes the invariants for renderer syntax highlighting via the `shiki` package — version pin, API surface we consume, dual-version coexistence with `@pierre/diffs`, and bundle size thresholds. Following the precedent of `upgrade-typescript-6` (capability: `typescript-toolchain`), a toolchain upgrade still captures the measurable invariants it must preserve so future changes cannot silently break them.

### Modified Capabilities
None. The 3 renderer consumers of `shiki` (`src/renderer/lib/themes/shiki-theme-loader.ts`, `src/renderer/lib/themes/diff-view-highlighter.ts`, `src/renderer/features/agents/ui/agent-diff-view.tsx`) preserve their current externally-observable behavior.

The `shiki-highlighter` capability will promote to `openspec/specs/shiki-highlighter/spec.md` on archive. Because this change HAS a capability delta, it will archive normally (`bunx @fission-ai/openspec@1.2.0 archive upgrade-shiki-4 --yes`), NOT with `--skip-specs`. This is the same pattern used by `upgrade-typescript-6` in the archive.

## Impact

**Affected files (change scope):**
- `package.json` — single line diff on the `shiki` entry
- `bun.lock` — resolution tree update (top-level + nested resolution for `@pierre/diffs`)

**Affected downstream consumers (verified unchanged, validation required):**
- `src/renderer/lib/themes/shiki-theme-loader.ts` — imports top-level `shiki` (→ 4.0.2)
- `src/renderer/lib/themes/diff-view-highlighter.ts` — imports type-only `BundledTheme`, `Highlighter` from top-level `shiki` (→ 4.0.2)
- `src/renderer/features/agents/ui/agent-diff-view.tsx` — imports `@pierre/diffs/react` and `@pierre/diffs`, which internally resolve to the nested `shiki@3.23.0` (unchanged from main)
- Transitive consumers of `highlightCode()` from `shiki-theme-loader.ts`: `agent-mcp-tool-call.tsx`, `message-json-display.tsx`, `agent-edit-tool.tsx`, `chat-markdown-renderer.tsx` (no direct shiki imports — behavior unchanged if `shiki-theme-loader.ts` still compiles)

**Affected build pipeline:**
- `node_modules` disk footprint: expected increase of ~12-16 MB due to nested `shiki@3.23.0` tree under `@pierre/diffs`. Current shiki-related footprint on main: `shiki` 3.8 MB + `@shikijs/langs` 9.8 MB + `@shikijs/themes` 1.8 MB + `@shikijs/engine-oniguruma` 652 KB + support packages ≈ 16-17 MB.
- **Renderer bundle size: MUST be validated, not assumed.** `release.yml` notes that renderer builds produce "463 renderer chunks from monaco/mermaid/shiki" under a constrained 6 GB `NODE_OPTIONS` heap on macOS-15 runners. Whether Vite tree-shakes the nested `@pierre/diffs/shiki@3.23.0` or bundles both copies is the open question this change resolves empirically.

**Cross-dependency ordering:**
- Independent of `upgrade-vite-8-build-stack` Phase B (Vite 8 + electron-vite 6 + plugin-react 6)
- Independent of `upgrade-electron-41`
- Independent of TypeScript 6.0 upgrade (already landed)
- Independent of Tailwind 4 upgrade (already landed)

**Upstream boundary impact:** None. No `remoteTrpc.*` or `fetch(${apiUrl}/...)` call sites touched. F1-F10 catalog unchanged. See [`.claude/rules/upstream-boundary.md`](../../../.claude/rules/upstream-boundary.md).

**Database / tRPC impact:** None. No schema changes. No new or modified tRPC routers.

**Phase 0 gate impact:** N/A — Phase 0 (15/15 hard gates) is complete. This is a post-Phase-0 toolchain upgrade.

**Risk surface:**
- **LOW — API surface:** No breaking changes hit by our consumption pattern (validated against Shiki 4 release notes, PR #1249, and the existing Vite 8 proposal's Shiki analysis).
- **LOW — Runtime floor:** Node 20+ requirement met by our Node 24 environment.
- **LOW — CI signal:** All 6 gates already green on PR #11 run `24252853838`.
- **MEDIUM — Bundle size:** Dual-version install creates a potential renderer bundle regression if Vite bundles both shiki copies instead of tree-shaking. Mitigated by a hard pass threshold of "<10% renderer bundle size regression" as a task gate.
- **LOW — Rollback cost:** Revert PR #11 + `bun install` + re-run gates. Two-file diff.
