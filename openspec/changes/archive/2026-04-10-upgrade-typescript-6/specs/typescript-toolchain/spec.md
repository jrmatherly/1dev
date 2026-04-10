## ADDED Requirements

### Requirement: TypeScript 6.0 is the installed version

The project SHALL use TypeScript 6.0.x for type checking. TS 6.0 is the "bridge release" before the Go rewrite (TS 7.0), aligning defaults and deprecating legacy options.

#### Scenario: Type checking uses TS 6.0 semantics

- **GIVEN** the project uses TypeScript for type checking
- **WHEN** `bun run ts:check` is executed
- **THEN** TypeScript 6.0.x is the installed version
- **AND** tsgo produces results consistent with TS 6.0 semantics

### Requirement: Explicit types configuration prevents ambient resolution loss

TypeScript 6.0 defaults `types` to `[]` instead of auto-discovering all `@types/*` packages. The tsconfig SHALL explicitly list required type packages.

#### Scenario: All required type packages are available

- **GIVEN** TypeScript 6.0 defaults `types` to `[]`
- **WHEN** the project is type-checked
- **THEN** `tsconfig.json` includes `"types": ["node", "better-sqlite3", "diff", "react", "react-dom"]`

### Requirement: Side-effect CSS imports are allowed

TypeScript 6.0 enables `noUncheckedSideEffectImports` by default, which flags CSS imports handled by the bundler. The tsconfig SHALL opt out of this check.

#### Scenario: CSS imports compile without error

- **GIVEN** TypeScript 6.0 enables `noUncheckedSideEffectImports` by default
- **WHEN** the renderer imports CSS files as side effects
- **THEN** `tsconfig.json` sets `"noUncheckedSideEffectImports": false`

### Requirement: Error baseline is re-measured after upgrade

The TS error baseline (`.claude/.tscheck-baseline`) SHALL be re-measured after upgrading, as the error count will shift due to new strictness or improved inference.

#### Scenario: Baseline reflects TS 6.0 error count

- **GIVEN** the TypeScript version has changed
- **WHEN** `bun run ts:check` is executed
- **THEN** the error count is recorded in `.claude/.tscheck-baseline`

### Requirement: Build is independent of TypeScript version

The project uses `noEmit: true` with esbuild for actual transpilation. The build SHALL succeed regardless of the TypeScript version change.

#### Scenario: esbuild transpilation succeeds

- **GIVEN** the project uses `noEmit: true` with esbuild for transpilation
- **WHEN** TypeScript is upgraded
- **THEN** `bun run build` succeeds without changes
