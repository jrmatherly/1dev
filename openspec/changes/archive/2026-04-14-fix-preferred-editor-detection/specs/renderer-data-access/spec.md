## ADDED Requirements

### Requirement: Preferred-editor dropdown reflects only detectable editors

The Preferred Editor dropdown in Settings → Preferences (`src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx`) SHALL show an editor as selectable if and only if the main process reports that editor as detectable on the current machine via the `trpc.external.getInstalledEditors` query. When the query is still loading or has errored, the dropdown SHALL NOT fall through to showing all known editors; instead it SHALL render a loading/empty state.

Detectability is determined by `isAppInstalled()` in `src/main/lib/trpc/routers/external.ts`, which uses PATH-based detection via the `which` npm package against the editor's optional `AppMeta.cliBinary` field. GUI-only editors without a CLI launcher fall back to the existing macOS `.app` path check. The function is platform-agnostic via `which` and MUST NOT contain `process.platform` branches for the PATH lookup.

#### Scenario: Cursor is not installed and the dropdown list excludes it

- **GIVEN** the user has not installed Cursor (no `cursor` binary on PATH and no `Cursor.app` bundle)
- **AND** the user opens Settings → Preferences → Preferred Editor
- **WHEN** the dropdown list is rendered
- **THEN** the list MUST NOT contain a "Cursor" entry
- **AND** the list MUST contain entries for editors that ARE detected (e.g., VS Code when `code` is on PATH)

#### Scenario: Detection query is in flight — dropdown renders a loading state, not "all editors"

- **GIVEN** the `trpc.external.getInstalledEditors` query has not yet resolved on first render
- **WHEN** the Preferences tab is mounted
- **THEN** the dropdown list MUST NOT render the full unfiltered `EDITORS` / `TERMINALS` / `VSCODE` / `JETBRAINS` arrays
- **AND** the dropdown list MUST render an empty state or a brief "Detecting editors…" placeholder until the query resolves

#### Scenario: Windows user with VS Code installed sees VS Code in the dropdown

- **GIVEN** a Windows user has VS Code installed (the `code.cmd` launcher resolves via `where.exe code` with PATHEXT)
- **AND** the user opens Settings → Preferences → Preferred Editor
- **WHEN** the dropdown list is rendered
- **THEN** "VS Code" MUST appear as a selectable entry
- **AND** the list MUST NOT be empty (the pre-fix macOS-only detection would have produced an empty list on Windows)

### Requirement: Preferred-editor default cannot resolve to a non-installed editor on first paint

The `preferredEditorAtom` in `src/renderer/lib/atoms/index.ts` SHALL default to `null` with type `ExternalApp | null`. On first paint of the Preferences tab, a hook SHALL resolve the atom to a concrete editor using the precedence chain: (1) the OS default returned by `trpc.external.getOsDefaults` if it is present in the installed set; (2) the first entry of the installed set in declaration order; (3) leave the atom as `null`. The atom SHALL NOT default to a hard-coded literal editor identifier (e.g., `"cursor"`), because that produces the observable "button label shows an editor that isn't installed" bug on first install or after cleared app data.

When the atom's current value is not present in the live installed set (e.g., the user previously selected an editor that has since been uninstalled), the trigger button SHALL render a "No editor selected" placeholder instead of `APP_META[preferredEditor].label`.

#### Scenario: Fresh install does not pre-select an uninstalled editor

- **GIVEN** a first-ever launch of the app (no persisted `preferences:preferred-editor` localStorage entry)
- **AND** the installed-editor set is `["vscode"]` (Cursor is NOT installed)
- **WHEN** the Preferences tab is mounted
- **THEN** the trigger button label MUST NOT read "Cursor"
- **AND** the trigger button label reads either "VS Code" (first-installed resolution) or "No editor selected" (fallback) — never an editor not in the installed set

#### Scenario: Stored default references an uninstalled editor — button shows placeholder

- **GIVEN** the user previously selected "Zed" and Zed has since been uninstalled
- **AND** the installed-editor set no longer includes "zed"
- **WHEN** the Preferences tab is mounted
- **THEN** the trigger button renders "No editor selected" placeholder
- **AND** the user can pick a new editor from the now-filtered dropdown

#### Scenario: `$EDITOR` env var is respected when the editor is installed

- **GIVEN** `$EDITOR=code` is set in the user's shell environment
- **AND** VS Code is installed and `code` resolves via `which`
- **AND** no prior `preferences:preferred-editor` localStorage entry exists
- **WHEN** the Preferences tab is first mounted
- **THEN** the first-paint hook resolves `preferredEditorAtom` to `"vscode"` (OS default wins over first-installed fallback)
- **AND** the trigger button reads "VS Code"

#### Scenario: `$EDITOR` env var names an editor not in the installed set — fall through to first-installed

- **GIVEN** `$EDITOR=cursor` is set but Cursor is NOT installed
- **AND** VS Code IS installed
- **WHEN** the Preferences tab is first mounted
- **THEN** the first-paint hook MUST NOT resolve to `"cursor"`
- **AND** resolves to `"vscode"` (the first installed editor in declaration order)
