## MODIFIED Requirements

### Requirement: Runtime version is Electron 41

The application SHALL run on Electron 41.2.x (Chromium 146, Node.js 24.14, V8 14.6), upgraded from Electron 40.8.5. The Electron 40 EOL is 2026-06-30; Electron 41 extends support to 2026-08-25.

#### Scenario: App builds and runs on Electron 41

- **GIVEN** the app is built and packaged
- **WHEN** the application launches
- **THEN** it runs on Electron 41.2.x with Chromium 146 and Node.js 24.14

### Requirement: Native modules rebuild against Electron 41 ABI

Native C++ addons (`better-sqlite3`, `node-pty`) SHALL be rebuilt against Electron 41's Node.js ABI headers during the `postinstall` phase.

#### Scenario: node-pty works after rebuild

- **GIVEN** the app starts
- **WHEN** the terminal feature is accessed
- **THEN** node-pty is loaded and functional (rebuilt against Electron 41 ABI)

#### Scenario: better-sqlite3 works after rebuild

- **GIVEN** the app starts
- **WHEN** any database operation occurs
- **THEN** better-sqlite3 is loaded and functional (rebuilt against Electron 41 ABI)

### Requirement: safeStorage API is unchanged

The `safeStorage` API used by `credential-store.ts` SHALL behave identically between Electron 40 and 41. No methods have been changed, deprecated, or removed.

#### Scenario: Credential storage operates identically

- **GIVEN** the app is running on Electron 41
- **WHEN** credentials are stored or retrieved
- **THEN** safeStorage API behaves identically to Electron 40

### Requirement: Build tooling remains compatible

The existing build toolchain (electron-vite 5.0.0, electron-builder 26.8.1) SHALL work with Electron 41 without version changes.

#### Scenario: Build succeeds with existing toolchain

- **GIVEN** electron-vite 5.0.0 and electron-builder 26.8.1
- **WHEN** `bun run build` or `bun run package:mac` is executed
- **THEN** the build succeeds without errors
