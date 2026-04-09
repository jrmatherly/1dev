# electron-runtime Specification

## Purpose

Electron runtime version must be actively maintained with security patches from the Electron team.

## Requirements

### Requirement: Electron runtime version is actively maintained

The application SHALL run on a supported Electron version that receives security patches from the Electron team. The current target is Electron 40.x (Node.js 24, Chromium 144).

#### Scenario: Electron version is within support window

- **GIVEN** the application is built and packaged
- **WHEN** a security researcher checks the bundled Chromium and Node.js versions
- **THEN** both versions are within their respective support windows (receiving security patches)
- **AND** the Electron version listed in `package.json` has not reached its end-of-life date per the Electron releases timeline

#### Scenario: Native modules compile against the bundled Node.js version

- **GIVEN** the application depends on native C++ addons (`better-sqlite3`, `node-pty`)
- **WHEN** `electron-rebuild` runs during `postinstall`
- **THEN** all native modules compile successfully against the Electron-bundled Node.js ABI
- **AND** the resulting binaries pass the `bun test` regression suite

#### Scenario: Build toolchain produces valid artifacts

- **GIVEN** the application uses `electron-vite` for compilation and `electron-builder` for packaging
- **WHEN** `bun run build` and `bun run package:mac` are executed
- **THEN** both commands complete successfully without errors
- **AND** the packaged application launches and passes smoke testing