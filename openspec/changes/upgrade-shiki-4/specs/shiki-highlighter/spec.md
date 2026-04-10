## ADDED Requirements

### Requirement: Shiki package is pinned at major version 4

The project SHALL use `shiki` at major version 4 for renderer syntax highlighting. The `shiki` dependency in `package.json` SHALL be pinned to an exact version in the `4.x` line (initially `4.0.2`).

#### Scenario: package.json declares shiki 4.x

- **GIVEN** the project has completed the Shiki 3→4 upgrade
- **WHEN** the dependency tree is inspected
- **THEN** `package.json` dependencies contain `"shiki": "4.0.2"` (or a later 4.x version)
- **AND** `bun.lock` resolves top-level `shiki` to the same 4.x version

### Requirement: Renderer consumes shiki via a stable API surface

The renderer's shiki consumers SHALL only use API symbols that exist and behave identically in `shiki@4.x`. The API surface the project consumes is limited to: `createHighlighter`, `codeToHtml`, `codeToHast`, `loadTheme`, `getLoadedThemes`, `getLoadedLanguages`, and the type exports `Highlighter`, `BundledTheme`, `BundledLanguage`. No deprecated APIs that were removed in Shiki 4.0.0 SHALL be used.

#### Scenario: shiki-theme-loader uses only stable v4 APIs

- **GIVEN** `src/renderer/lib/themes/shiki-theme-loader.ts` is the central highlighter wrapper
- **WHEN** it is type-checked against `shiki@4.x`
- **THEN** `bun run ts:check` reports zero new type errors attributable to shiki
- **AND** the file exclusively imports symbols from the allow-listed API surface

#### Scenario: diff-view-highlighter uses only stable v4 APIs

- **GIVEN** `src/renderer/lib/themes/diff-view-highlighter.ts` calls `codeToHast` with `cssVariablePrefix`, `defaultColor: false`, and `mergeWhitespaces: false`
- **WHEN** the renderer is built against `shiki@4.x`
- **THEN** `bun run build` succeeds
- **AND** the `codeToHast` option signature remains compatible

### Requirement: Dual-version coexistence with @pierre/diffs is permitted

Because `@pierre/diffs@1.1.x` declares `shiki: ^3.0.0` and `@shikijs/transformers: ^3.0.0` as regular `dependencies` (not `peerDependencies`), the project SHALL tolerate a nested install of `shiki@3.23.0` under `node_modules/@pierre/diffs/node_modules/` while the top-level `node_modules/shiki` resolves to `4.x`. This coexistence SHALL NOT produce runtime errors in either consumer.

#### Scenario: Both shiki copies coexist in node_modules

- **GIVEN** `@pierre/diffs@1.1.x` is installed
- **AND** top-level `shiki` is at major version 4
- **WHEN** `bun install` completes
- **THEN** `node_modules/shiki/package.json` reports version `4.x`
- **AND** either `node_modules/@pierre/diffs/node_modules/shiki/package.json` reports version `3.x` OR `bun.lock` declares a nested `@pierre/diffs/shiki` resolution at `3.x`

#### Scenario: Renderer code using shiki 4 runs without errors

- **GIVEN** the renderer is running with top-level `shiki@4.x`
- **WHEN** a user opens a chat containing a fenced code block
- **THEN** the code block renders with syntax highlighting
- **AND** no shiki-related errors appear in the dev console

#### Scenario: @pierre/diffs code using nested shiki 3 runs without errors

- **GIVEN** the renderer is running with `@pierre/diffs` resolving its internal `shiki@3.x`
- **WHEN** a user opens a diff view via the `PatchDiff` component in `agent-diff-view.tsx`
- **THEN** the diff renders with syntax-highlighted additions/deletions
- **AND** no shiki-related errors appear in the dev console

### Requirement: Renderer bundle size regression is bounded

The renderer's production bundle size SHALL NOT regress by more than 10% as a result of the dual-version shiki install. Measured by `du -sh out/renderer/assets/` after `bun run build`.

#### Scenario: Renderer bundle grows by less than 10% after upgrade

- **GIVEN** a baseline `out/renderer/assets/` size measured on `main` before the upgrade
- **WHEN** the upgrade lands and `bun run build` is run on the post-upgrade tree
- **THEN** `du -sh out/renderer/assets/` reports a size no greater than 110% of the baseline
- **AND** the delta is documented in the change's `tasks.md` under the bundle validation phase

### Requirement: Node runtime floor matches Shiki 4 requirements

The project's Node runtime floor SHALL be Node 20 or later, matching Shiki 4.0.0's minimum requirement. The project currently pins Node 24 in CI and development.

#### Scenario: CI runs on Node 24 (matching the current pin)

- **GIVEN** Shiki 4.0.0 dropped support for Node v18
- **WHEN** the CI workflow runs `bun run build`
- **THEN** the `docs-build` job's `actions/setup-node@v6` step installs Node 24 (matching the explicit `node-version: "24"` pin in `.github/workflows/ci.yml` and `release.yml`)
- **AND** no Shiki runtime version check errors are emitted

### Requirement: All six quality gates pass after the upgrade

The project's six quality gates (`bun run ts:check`, `bun run lint`, `bun run build`, `bun test`, `bun audit`, `cd docs && bun run build`) SHALL all pass after the shiki 4 upgrade lands on `main`.

#### Scenario: Quality gates pass on the upgrade commit

- **GIVEN** the shiki 4 upgrade PR has been merged to `main`
- **WHEN** all six quality gates are executed on the merge commit
- **THEN** every gate exits with status 0
- **AND** `bun run ts:check` reports a count less than or equal to the `.claude/.tscheck-baseline` value (currently 45, reduced from 54 via commit `46f49a4` on 2026-04-10)
