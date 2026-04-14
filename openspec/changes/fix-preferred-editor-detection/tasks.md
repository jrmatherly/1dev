## 1. Dependencies and shared types

- [ ] 1.1 Run `bun add which` to add `which` as a production dependency, then `bun add -d @types/which` to add the DefinitelyTyped declarations. Confirm both entries appear in `package.json` and that `bun.lock` is regenerated cleanly.
- [ ] 1.2 Run `bun install` and `bun run ts:check` to confirm the `which` types resolve and the TS baseline (`.claude/.tscheck-baseline`) stays at 0.
- [ ] 1.3 Extend the `AppMeta` interface in `src/shared/external-apps.ts` with an optional field `cliBinary?: string`. Add JSDoc explaining that the field is consumed by `isAppInstalled()` for cross-platform PATH-based detection via `which`.
- [ ] 1.4 Populate `cliBinary` on each `APP_META` entry that has a known CLI launcher: `vscode: "code"`, `vscode-insiders: "code-insiders"`, `cursor: "cursor"`, `windsurf: "windsurf"`, `zed: "zed"`, `trae: "trae"`, `sublime: "subl"` (if the Sublime Text CLI is commonly installed; leave absent if uncertain), `intellij: "idea"`, `webstorm: "webstorm"`, `pycharm: "pycharm"`, `phpstorm: "phpstorm"`, `goland: "goland"`, `clion: "clion"`, `rider: "rider"`, `rustrover: "rustrover"`, `fleet: "fleet"`. Leave `cliBinary` absent on GUI-only entries: `finder`, `xcode`, `terminal`, `iterm`, `warp`, `ghostty`, `github-desktop`, `datagrip`, `appcode`, `rubymine` (RubyMine CLI launcher is less consistently installed).

## 2. Main-process detection rewrite

- [ ] 2.1 In `src/main/lib/trpc/routers/external.ts`, import `which` at the top of the file alongside the existing `os` and `fs` imports.
- [ ] 2.2 Rewrite `isAppInstalled()` at lines 34-40 to accept the full `AppMeta` object (not just `macAppName`) and branch: if `meta.cliBinary` is set, return `(await which(meta.cliBinary, { nothrow: true })) !== null`; otherwise fall back to the existing `fs.existsSync('/Applications/${meta.macAppName}.app') || fs.existsSync(`${os.homedir()}/Applications/${meta.macAppName}.app`)` logic. The function becomes `async` — update all call sites.
- [ ] 2.3 Update the `getInstalledEditors` procedure at line 137-154 to `await` the now-async `isAppInstalled()` call. Keep the `terminal` / `finder` always-available short-circuits.
- [ ] 2.4 Add a new tRPC procedure `getOsDefaults` to `externalRouter` that returns `{ editor: ExternalApp | null, terminal: ExternalApp | null, shell: string | null }`. Implementation reads `process.env.VISUAL ?? process.env.EDITOR` for editor, `process.env.TERM_PROGRAM` (with `$TERM` fallback) for terminal, and `process.env.SHELL` for shell. Map env values through a binary-basename table: `code → vscode`, `code-insiders → vscode-insiders`, `cursor → cursor`, `windsurf → windsurf`, `zed → zed`, `TERM_PROGRAM=iTerm.app → iterm`, `TERM_PROGRAM=WarpTerminal → warp`, `TERM_PROGRAM=Apple_Terminal → terminal`. Unknown values return `null`.
- [ ] 2.5 Run `bun run ts:check` and confirm baseline holds at 0. Fix any TS errors introduced by the async conversion in step 2.2.

## 3. Renderer atom and consumers

- [ ] 3.1 In `src/renderer/lib/atoms/index.ts` at lines 931-936, change the `preferredEditorAtom` type parameter from `ExternalApp` to `ExternalApp | null` and change the default value from `"cursor"` to `null`.
- [ ] 3.2 Run `bun run ts:check` — all consumers that assumed a non-null value must now handle null. Expected consumers: `agents-preferences-tab.tsx`, `open-in-button.tsx`, and any other file that imports `preferredEditorAtom`. Add null-guards where they're missing; rely on the baseline regression to catch any I miss.
- [ ] 3.3 Verify the TS baseline file at `.claude/.tscheck-baseline` still reads 0 after fixing the consumer handling.

## 4. Renderer UI corrections

- [ ] 4.1 In `src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx` at lines 169-185, change each of the four filter expressions from fail-open (`installedEditors ? X.filter(...) : X`) to fail-closed (`installedEditors ? X.filter(...) : []`). The `filteredEditors`, `filteredTerminals`, `filteredVscode`, and `filteredJetbrains` arrays now return empty when the query has not resolved.
- [ ] 4.2 Add a loading-state check immediately before the dropdown render: when `installedEditors === undefined`, render a disabled trigger button with a "Detecting editors…" label instead of the normal dropdown. This gives a one-tick loading UX without blocking the rest of the Preferences tab.
- [ ] 4.3 At lines 395-405, add a guard around the trigger-button label: compute `const isStoredValid = preferredEditor !== null && (filteredEditors ∪ filteredTerminals ∪ filteredVscode ∪ filteredJetbrains).some(e => e.id === preferredEditor)`; when `!isStoredValid`, render "No editor selected" placeholder instead of `APP_META[preferredEditor].label`. Guard `EDITOR_ICONS[preferredEditor]` similarly so the icon does not render when `preferredEditor` is null or stale.
- [ ] 4.4 Add a first-paint `useEffect` hook that: (a) queries `trpc.external.getOsDefaults.useQuery()` alongside the existing `getInstalledEditors` query; (b) when `preferredEditor === null` AND both queries have resolved, computes the resolved editor via `osDefaults.editor in installedEditors ? osDefaults.editor : installedEditors[0] ?? null`; (c) calls `setPreferredEditor(resolved)` to persist it.

## 5. Regression guard

- [ ] 5.1 Create `tests/regression/preferred-editor-reflects-installed.test.ts` using bun:test. The guard has three test cases: (a) mock-import `which` to return `null` for "cursor" and a path for "code", then call `isAppInstalled()` with the cursor and vscode `AppMeta` entries and assert the results; (b) read `src/renderer/lib/atoms/index.ts` source and assert `preferredEditorAtom` default is `null` (not `"cursor"` or any other literal); (c) read `src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx` source and assert the filter expressions use `: []` (fail-closed), NOT `: EDITORS`/`: TERMINALS`/etc. Follow the shape-based pattern used by `tests/regression/no-entra-in-anthropic-auth-token.test.ts`.
- [ ] 5.2 Run `bun test tests/regression/preferred-editor-reflects-installed.test.ts` and confirm all three test cases pass.
- [ ] 5.3 Run `bun test` (full suite) and confirm no other regression guard fails as a side effect of the changes.

## 6. Quality gates

- [ ] 6.1 Run `bun run ts:check` — confirm baseline holds at 0. Update `.claude/.tscheck-baseline` ONLY if legitimately reducing the count (should not happen in this change).
- [ ] 6.2 Run `bun run build` — confirm esbuild packaging succeeds. The new `which` runtime dep must bundle correctly for the main process.
- [ ] 6.3 Run `bun run lint` — this is a local-only advisory gate. Confirm no new SonarJS findings from the async rewrite in `external.ts` or the null handling in `agents-preferences-tab.tsx`.
- [ ] 6.4 Run `bun audit` — confirm `which` transitive chain introduces no NEW advisories.
- [ ] 6.5 Run `cd docs && bun run build && cd ..` — docs site should build unchanged (no docs edits in this change).

## 7. Manual smoke test

- [ ] 7.1 Run `bun run dev` on macOS with `MAIN_VITE_DEV_BYPASS_AUTH=true`. Navigate to Settings → Preferences → Preferred Editor. Confirm the dropdown shows only editors actually installed on the machine. Confirm the trigger button does NOT read "Cursor" (unless Cursor is installed).
- [ ] 7.2 Manually delete `~/Library/Application Support/1Code/` (or the appropriate per-OS app data directory) to simulate a fresh install. Relaunch `bun run dev`. Confirm the trigger button resolves to the OS default editor (if `$EDITOR` points to an installed editor) or the first installed editor or "No editor selected" — never "Cursor" when Cursor isn't installed.
- [ ] 7.3 (If a Windows machine is accessible) Install VS Code, verify the dropdown shows "VS Code" as detectable. Without VS Code, verify the dropdown is empty or shows the loading placeholder (not all editors).

## 8. OpenSpec workflow wrap-up

- [ ] 8.1 Run `bunx @fission-ai/openspec@1.2.0 validate fix-preferred-editor-detection --strict --no-interactive` — confirm "Change is valid".
- [ ] 8.2 Commit all changes in a single commit referencing the change id.
- [ ] 8.3 Run `/session-sync` to refresh CLAUDE.md, PROJECT_INDEX, Serena memories, and rebuild the code-review graph. Note: router count stays at 23 (same `external` router, added a new method).
- [ ] 8.4 Run `/opsx:archive fix-preferred-editor-detection` to promote the `renderer-data-access` delta into the baseline.
