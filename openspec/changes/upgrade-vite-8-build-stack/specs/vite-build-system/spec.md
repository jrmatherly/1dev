## ADDED Requirements

### Requirement: Vite 7 produces correct output formats

Vite 7.x with electron-vite 5.0.0 SHALL produce CJS bundles for main/preload and ESM for renderer, validating the intermediate upgrade step.

#### Scenario: CJS and ESM bundles are correct

- **GIVEN** Vite 7.x is installed with electron-vite 5.0.0
- **WHEN** `bun run build` is executed
- **THEN** main process bundle is CJS format
- **AND** preload bundle is CJS format
- **AND** renderer bundle is ESM format

### Requirement: Rolldown produces functional output

Vite 8 replaces esbuild and Rollup with Rolldown. The new bundler SHALL produce functionally equivalent output, particularly for CJS output used by Electron's main and preload processes.

#### Scenario: Vite 8 build matches Rollup output

- **GIVEN** Vite 8.x is installed with electron-vite 6.x
- **WHEN** `bun run build` is executed
- **THEN** Rolldown produces functionally correct output
- **AND** `rolldownOptions` is used instead of deprecated `rollupOptions`

### Requirement: External modules resolve at runtime

Modules marked as external (electron, better-sqlite3, @prisma/client, @anthropic-ai/claude-agent-sdk) SHALL resolve correctly at runtime under the new bundler.

#### Scenario: Native and SDK modules load correctly

- **GIVEN** modules are marked as external
- **WHEN** the app starts
- **THEN** external modules resolve correctly at runtime

### Requirement: CJS interop handles bundled modules

Modules in `externalizeDeps.exclude` (superjson, trpc-electron, gray-matter, async-mutex) SHALL import correctly under both Vite 7's and Vite 8's changed CJS interop behavior.

#### Scenario: Excluded externals import correctly

- **GIVEN** modules in `externalizeDeps.exclude` are bundled
- **WHEN** the main process loads
- **THEN** imports resolve correctly under the new CJS interop behavior

### Requirement: JSX transforms work with Oxc

Plugin-react v6 uses Oxc instead of Babel for JSX transforms. The `jsxImportSource` option for WDYR SHALL continue to work.

#### Scenario: WDYR integration functions in dev mode

- **GIVEN** plugin-react uses Oxc instead of Babel
- **WHEN** the renderer process runs in dev mode
- **THEN** `jsxImportSource` option for WDYR integration works correctly

### Requirement: Shiki v4 syntax highlighting works

Shiki v4 is a minor cleanup release with no API changes affecting this project. All highlighting APIs SHALL work identically after the upgrade.

#### Scenario: Code blocks highlight correctly

- **GIVEN** Shiki is upgraded from v3 to v4
- **WHEN** code blocks appear in chat messages
- **THEN** syntax highlighting works for all supported languages
- **AND** theme mapping produces correct colors
