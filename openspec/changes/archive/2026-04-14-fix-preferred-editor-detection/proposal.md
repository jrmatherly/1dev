## Why

The Preferred Editor dropdown in Settings → Preferences shows editors that are not installed on the user's machine. Observed on macOS 25.4.0 on 2026-04-13: the button reads "Cursor" even though neither `/Applications/Cursor.app` nor `~/Applications/Cursor.app` exists. Three compounding bugs are responsible:

1. **Fail-open filter** (`src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx:169-185`) — when `trpc.external.getInstalledEditors` is still loading or errors, the ternary `installedEditors ? EDITORS.filter(...) : EDITORS` falls through to showing **all** editors. Should be fail-closed with a loading state.
2. **Upstream hard-coded default** (`src/renderer/lib/atoms/index.ts:931-936`) — `preferredEditorAtom` defaults to the string `"cursor"` (upstream's choice, never revisited for the enterprise fork). `atomWithStorage` with `getOnInit: true` hydrates this synchronously on first-ever launch, fresh install, or cleared app data — before the user selects anything. `APP_META["cursor"].label` then renders "Cursor" in the trigger button regardless of what's actually installed.
3. **macOS-only detection** (`src/main/lib/trpc/routers/external.ts:34-40`) — `isAppInstalled()` only checks `/Applications/<name>.app` paths. No `process.platform` branch, so Windows and Linux builds would filter everything out (masked today by bug #1's fail-open).

The fix adopts the cross-platform detection pattern from our sibling project at `/Users/jason/dev/shipit/` — PATH-based detection via `npm which` plus environment-variable-based OS-default derivation — avoiding native Objective-C++ addons and eliminating `process.platform` branching. Ship this now because (a) the visible bug erodes trust in settings UX, (b) Windows and Linux release builds carry a latent "empty editor list" regression, and (c) the pattern-port from shipit is a ~4-hour investment with no architectural risk.

## What Changes

- **ADD** `which` as a production dependency and `@types/which` as a dev dependency via `bun add which && bun add -d @types/which`.
- **EXTEND** the `AppMeta` type in `src/shared/external-apps.ts` with an optional `cliBinary?: string` field. Populate it for editors that ship CLI launchers (`code`, `code-insiders`, `cursor`, `windsurf`, `zed`, `trae`, and the JetBrains CLI aliases where available).
- **REWRITE** `isAppInstalled()` in `src/main/lib/trpc/routers/external.ts:34-40` to prefer `await which(cliBinary, { nothrow: true })` when `cliBinary` is set on the editor's `APP_META`. Keep the `/Applications/<name>.app` + `~/Applications/<name>.app` path check as a secondary fallback for GUI-only editors without CLI launchers (Xcode, Sublime Text).
- **ADD** a new tRPC procedure `external.getOsDefaults` that returns `{ editor, terminal, shell }` derived from `$VISUAL` → `$EDITOR` (editor default), `$TERM_PROGRAM` with fallback to `$TERM` (terminal default), and `$SHELL` (shell default). Env values are mapped through a binary-basename table (`code` → `vscode`, `cursor` → `cursor`, etc.).
- **BREAKING (renderer-internal only)** — `preferredEditorAtom` default changes from `"cursor"` to `null`; atom type becomes `ExternalApp | null`. Consumers that assume a non-null value must handle `null`.
- **FIX** the fail-open filter in `agents-preferences-tab.tsx:169-185` — change `installedEditors ? ... : EDITORS` to `installedEditors ? ... : []` and render a small loading state when `installedEditors === undefined`.
- **FIX** the trigger button label at `agents-preferences-tab.tsx:395-405` — when `preferredEditor` is null OR is not present in the current installed set, render a "No editor selected" placeholder instead of `APP_META[preferredEditor].label`.
- **ADD** a first-paint hook in `agents-preferences-tab.tsx` that queries `getOsDefaults` and `getInstalledEditors`; if `preferredEditorAtom` is null, resolve it to `osDefaults.editor` when that editor is in the installed set, else the first installed editor, else leave null.
- **ADD** regression guard `tests/regression/preferred-editor-reflects-installed.test.ts` that mocks `which` to return null for Cursor and a path for VS Code; asserts the filter excludes Cursor and that the atom default does not resolve to a non-installed editor on first paint.

## Capabilities

### New Capabilities

None. This change is a UX correctness fix + runtime-dependency addition. No coherent "editor-detection" capability exists as a standalone surface; creating a new baseline for ~200 lines of bug fix would be scope expansion.

### Modified Capabilities

- `renderer-data-access` — ADD two requirements covering (a) the "dropdown reflects only detectable editors" invariant (replaces the fail-open filter behavior) and (b) the "preferred-editor default cannot resolve to a non-installed editor on first paint" invariant (replaces the hard-coded `"cursor"` default). Both requirements specify scenarios that become the regression-guard test cases. The `renderer-data-access` baseline is the correct home because it already owns renderer-level UI contracts (camelCase timestamp reads, upstream-boundary preservation); preferred-editor filtering sits at the same stratum — what the renderer shows the user about their own machine.

## Impact

**Affected code (main process):**
- `src/main/lib/trpc/routers/external.ts` — rewrite `isAppInstalled()`, add `getOsDefaults` procedure (no router count change; same router, new method)

**Affected code (renderer):**
- `src/renderer/lib/atoms/index.ts:931-936` — atom default + type change
- `src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx:73-105, 169-185, 395-405` — filter fix, button label guard, first-paint hook

**Affected shared types:**
- `src/shared/external-apps.ts` — `AppMeta.cliBinary` addition; entries for CLI-equipped editors populated

**New tests:**
- `tests/regression/preferred-editor-reflects-installed.test.ts`

**Dependencies:**
- `which` (+1 production dep) — well-maintained, widely-used (~50M weekly downloads); drives cross-platform detection
- `@types/which` (+1 dev dep) — DefinitelyTyped declarations

**APIs / systems:**
- No upstream API contract change (no F-entry involvement)
- No database schema change
- No env-var changes; existing auth and spawn flows unchanged
- `openPathInApp()` launch behavior UNCHANGED — still uses `open -a "Cursor"` via `APP_META[id].macAppName` on macOS; detection changes do not affect the launch path

**CI / quality gates:**
- All 5 CI gates must pass; `bun run lint` advisory should remain clean
- `bun audit` will surface `which` transitive chain on first install — expected; not a blocker unless `which` itself carries an advisory
- `cd docs && bun run build` — unaffected; no docs changes required

**Out of scope:**
- Native Objective-C++ addon for macOS `LSCopyDefaultApplicationURLForContentType` (deferred; if env-var coverage proves insufficient post-ship, add as a follow-up proposal per `docs/operations/roadmap.md`)
- Adjustments to `APP_META` label strings or icons
- Windows / Linux installer testing (scope limited to logic-level cross-platform correctness; installer smoke covered by normal release-engineering flow)
