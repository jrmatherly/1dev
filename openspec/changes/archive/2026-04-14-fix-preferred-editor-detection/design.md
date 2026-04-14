## Context

The 1Code enterprise fork inherits a Preferred Editor dropdown from the upstream project. Three issues combine to produce the observable bug where Cursor appears in (and is pre-selected by) the dropdown even when Cursor is not installed on the user's machine:

1. The filter that should hide non-installed editors fails open while the tRPC query is in flight or in an error state.
2. The persisted default for the atom is a hard-coded literal `"cursor"` baked in by the upstream authors.
3. The detection function is macOS-only, so Windows and Linux release builds would either show nothing (if bug #1 were fixed first) or show every editor (as today).

Our sibling project at `/Users/jason/dev/shipit/` already solves the cross-platform detection problem with a clean pattern — `npm which` for PATH lookup plus environment-variable inspection for OS-defaults. Porting that pattern avoids native addons, avoids the macOS-only `LSCopyDefaultApplicationURLForContentType` Core Services API (not exposed through Electron's JS), and avoids parsing `lsregister -dump` output. The shipit source files that demonstrate the pattern are:

- `packages/core/src/infrastructure/services/environment-detector.service.ts` (221 lines)
- `packages/core/src/infrastructure/services/tool-installer/binary-exists.ts` (32 lines)
- `packages/core/src/application/use-cases/settings/detect-environment-defaults.use-case.ts` (36 lines)

The change is small enough (~4 hours of work, ~11 tasks, zero new capability specs) that it should archive with `openspec archive --skip-specs --yes` rather than introducing a new baseline. The existing `renderer-data-access` baseline covers different invariants (camelCase timestamps, upstream-boundary preservation) and does not cleanly own editor-detection semantics, so adding a MODIFIED requirement there would be a poor fit as well.

Stakeholders: end-user developers on all three platforms (macOS today, Windows and Linux when release builds are tested). No upstream-team coordination required.

## Goals / Non-Goals

**Goals:**
- Eliminate the visible bug: the Preferred Editor dropdown must only show editors that are actually resolvable on the user's machine.
- Remove the macOS-only assumption in `isAppInstalled()` so Windows and Linux release builds behave correctly.
- Replace the upstream-authored `"cursor"` default with a null-or-derived value so first-install sessions never pre-select an uninstalled editor.
- Preserve the existing `openPathInApp()` launch behavior — the `open -a "Cursor"` path is orthogonal to detection and stays unchanged.
- Add a regression guard so the fail-open filter and the upstream-default cannot regress.

**Non-Goals:**
- Native Objective-C++ addon for `LSCopyDefaultApplicationURLForContentType`. Deferred; revisit if `$VISUAL`/`$EDITOR`/`$TERM_PROGRAM` coverage proves insufficient after ship. Track as a roadmap entry rather than adding build-system complexity speculatively.
- Introducing a new capability spec `editor-detection`. The change is too small to justify a 17th baseline.
- Adjustments to `APP_META` label strings, icons, or launch-command configuration.
- Renaming or relocating the existing `APP_META` / `EDITOR_ICONS` / `EDITORS` / `TERMINALS` / `VSCODE` / `JETBRAINS` data tables.
- Windows / Linux installer or end-to-end testing — logic-level correctness only.

## Decisions

### Decision 1 — Use `npm which` for cross-platform detection rather than `process.platform` branching

**Chosen:** Add `which` as a production dependency. Call `await which(cliBinary, { nothrow: true })` inside the detection function. When the result is a path string, the editor is available; when the result is `null`, the editor is not on PATH.

**Alternatives considered:**
- `fs.existsSync` across platform-specific canonical install paths (current macOS approach extended to Windows/Linux) — brittle; users with Homebrew casks, Scoop buckets, or apt installs may have editors outside canonical paths.
- `spawnSync("which", [binary])` on Unix + `spawnSync("where", [binary])` on Windows — reinvents what the `which` package already does correctly, and is slower.
- Native Objective-C++ addon using `LSCopyApplicationURLsForBundleIdentifier` — highest fidelity on macOS, highest cost everywhere. Rejected per Non-Goals.

**Why `npm which`:** ~50M weekly downloads, actively maintained, handles Windows `PATHEXT` resolution (`.exe`/`.cmd`/`.bat`) internally via `where.exe`, returns a path or null without throwing. Zero `process.platform` branches needed in our code. Established pattern in `/Users/jason/dev/shipit/packages/core/src/infrastructure/services/tool-installer/binary-exists.ts`.

### Decision 2 — Detection uses the CLI binary, launch still uses the macOS `.app` name

**Chosen:** Extend `AppMeta` with an optional `cliBinary?: string` field. Detection uses `cliBinary` via `which`; launch continues to use `macAppName` via `open -a "<name>"` on macOS. The two fields are independent; GUI-only editors without CLI launchers use `macAppName`-only detection as a fallback.

**Alternatives considered:**
- Unify detection and launch under a single `cliCommand` field — breaks the existing `open -a "Cursor"` flow and requires rewriting `openPathInApp()`. Out of scope.
- Detect via `macAppName` path check on all platforms — only works on macOS; no meaningful Windows or Linux equivalent.

**Why the split:** Detection and launch are separate concerns today; keeping them separate preserves the existing launch behavior and lets us add detection robustness without touching the launch path.

### Decision 3 — Fail-closed on undefined `installedEditors`, with a loading state

**Chosen:** Change the filter at `agents-preferences-tab.tsx:169-185` from `installedEditors ? EDITORS.filter(...) : EDITORS` to `installedEditors ? EDITORS.filter(...) : []` and render a small "Detecting editors…" placeholder while the query is in flight.

**Alternatives considered:**
- Render `EDITORS` (current fail-open) — this is the current bug; rejected.
- Use React Suspense for the loading state — heavier footprint, requires boundary setup; not worth it for a single dropdown.
- Block rendering until the query resolves — blocks the entire Preferences tab on a detection query; poor UX.

### Decision 4 — Atom default becomes `null`, type widens to `ExternalApp | null`

**Chosen:** Change `preferredEditorAtom` at `src/renderer/lib/atoms/index.ts:931-936` from default `"cursor"` typed `ExternalApp` to default `null` typed `ExternalApp | null`. A first-paint hook in `agents-preferences-tab.tsx` resolves it to an installed editor if possible.

**Resolution chain (first-paint hook):**
1. If `osDefaults.editor` is non-null AND is in the installed set → use it.
2. Else if any editor in the installed set → use the first one (deterministic by the declared order in `EDITORS`, `TERMINALS`, `VSCODE`, `JETBRAINS`).
3. Else → leave null; button shows "No editor selected".

**Alternatives considered:**
- Keep default `"cursor"` but intercept reads and swap in a valid one if stale — hidden state mutation; surprising to consumers.
- Store OS default separately and treat the atom purely as "user override" — adds complexity and a second atom for no UX benefit; most consumers just want "what editor do we open things in?".

**Why widen the type:** a null state is a legitimate runtime state (fresh install + nothing installed yet). Consumers must handle it; TypeScript enforces this at compile time after the atom-type change.

### Decision 5 — Read `$VISUAL` / `$EDITOR` / `$TERM_PROGRAM` / `$SHELL` for OS defaults

**Chosen:** New tRPC procedure `external.getOsDefaults` reads those four env vars in that order and maps them through a binary-basename table to `ExternalApp` ids. No `process.platform` branching; the same code works on all three platforms because those env vars are Unix-conventional and Windows PowerShell / Git Bash set compatible values.

**Mapping table (subset):**
- `code` → `vscode`
- `code-insiders` → `vscode-insiders`
- `cursor` → `cursor`
- `windsurf` → `windsurf`
- `zed` → `zed`
- `nvim` / `vim` → `null` (no terminal-editor entry in `EXTERNAL_APPS`)
- `TERM_PROGRAM=iTerm.app` → `iterm`
- `TERM_PROGRAM=WarpTerminal` → `warp`
- `TERM_PROGRAM=Apple_Terminal` → `terminal`

**Alternatives considered:**
- Windows registry lookups (`HKEY_CLASSES_ROOT\Directory\shell\<cmd>`) — platform-specific, adds `node-registry` dep, marginal accuracy gain.
- Parse `~/.zshrc` / `~/.bashrc` for `export EDITOR=...` — unreliable (eval semantics, conditional exports).
- Skip OS-default derivation entirely; just pick the first installed editor — worse UX for users who deliberately configured `$EDITOR`.

### Decision 6 — No `docs/` changes; no capability spec

**Chosen:** Archive with `openspec archive fix-preferred-editor-detection --skip-specs --yes`. The change touches no documented user contract, no persisted-data schema, no capability baseline. Proposal header explicitly states "Capabilities: None — UX correctness fix."

**Alternatives considered:**
- MODIFIED requirement against `renderer-data-access` baseline — poor fit; `renderer-data-access` covers camelCase timestamp invariants and upstream-boundary preservation, not editor-detection semantics.
- NEW capability spec `editor-detection` — scope expansion. 200 lines of bug fix does not merit a 17th baseline. If future work (Windows registry, native addon) expands the feature substantially, a capability spec can be added then.

## Risks / Trade-offs

- **[Risk] `which` finds a binary but the editor bundle is broken** → Mitigation: acceptable trade-off. The `open -a "Cursor"` launch path will surface the broken bundle to the user at launch time, not detection time. Detection's job is "is it reasonable to show this option?", not "will launch succeed?".

- **[Risk] `$EDITOR=nano` or `$EDITOR=vim` — no matching `ExternalApp`** → Mitigation: the map table returns null for unknown values; the first-paint hook falls through to "first installed" resolution. User sees the first installed GUI editor, not nano.

- **[Risk] `$VISUAL`/`$EDITOR` not set in Electron's child env even when the shell has them set** → Mitigation: Electron inherits parent env by default. If launched from Finder rather than a shell, these vars may be unset; the hook gracefully returns `{ editor: null, terminal: null, shell: null }` and falls through to "first installed".

- **[Risk] `which` returns a path that's actually a shim (e.g., mise-managed launcher)** → Mitigation: a shim path is still "the editor is available"; launch via `open -a` uses the Launch Services database, not the PATH binary. Safe.

- **[Trade-off] Adding a runtime dependency** → accepted. `which` is tiny (~4 KB minified), has one transitive dep (`isexe`), and is battle-tested. Captured in the 5-CI-gate `bun audit` step.

- **[Trade-off] Type widening from `ExternalApp` to `ExternalApp | null`** → accepted. Consumers gain compile-time enforcement that "no editor selected" is a real state they must handle.

- **[Risk] Regression in the trigger button's live-reactivity** → Mitigation: regression guard `tests/regression/preferred-editor-reflects-installed.test.ts` asserts the fail-closed filter behavior and the null-default handling.

## Migration Plan

No data migration needed. The atom default change takes effect at next app launch; existing users with a persisted valid editor selection keep it. Existing users with a persisted invalid editor selection (e.g., "cursor" from upstream default that was never touched) will see a one-time "No editor selected" placeholder on first launch after upgrade; the first-paint hook then resolves it to their OS default or first installed editor on next render.

Rollback: revert the commit. No schema or persisted-data changes to reverse.

## Open Questions

None at this point. All decisions above are settled pending user review of the proposal.
