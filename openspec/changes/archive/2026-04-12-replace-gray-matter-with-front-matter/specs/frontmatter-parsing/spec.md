## ADDED Requirements

### Requirement: Main process uses a single canonical frontmatter parser

The main process SHALL import YAML frontmatter parsing functionality from exactly one file: `src/main/lib/frontmatter.ts`. No other file under `src/main/**/*.ts` SHALL import `front-matter`, `gray-matter`, `vfile-matter`, `js-yaml`, or any other YAML frontmatter parsing package directly for the purpose of parsing frontmatter from `.md` files.

This mirrors the credential-storage pattern where `src/main/lib/credential-store.ts` is the single file allowed to call `safeStorage.*`, enforced via regression guard.

#### Scenario: Canonical shim file exists

- **GIVEN** the project has completed the gray-matter → front-matter migration
- **WHEN** the file `src/main/lib/frontmatter.ts` is inspected
- **THEN** it exports a function named `matter` that accepts a `string` and returns an object with `data` and `content` properties
- **AND** it imports `front-matter` as its underlying parser

#### Scenario: Consumer files import from the shim, not the underlying parser

- **GIVEN** the files `src/main/lib/trpc/routers/commands.ts`, `plugins.ts`, `skills.ts`, and `src/main/lib/trpc/routers/agent-utils.ts` parse YAML frontmatter
- **WHEN** their import statements are inspected
- **THEN** each imports `matter` from the local `frontmatter.ts` shim (e.g., `import { matter } from "../../frontmatter"`)
- **AND** none of them imports `front-matter`, `gray-matter`, `vfile-matter`, or `js-yaml` directly

#### Scenario: Regression guard blocks direct parser imports outside the shim

- **GIVEN** a regression guard `tests/regression/no-gray-matter.test.ts`
- **WHEN** `bun test` runs
- **THEN** the guard scans `src/main/**/*.ts` and fails if any file other than `src/main/lib/frontmatter.ts` contains `import ... from "front-matter"`, `require("front-matter")`, `import ... from "gray-matter"`, or `require("gray-matter")`
- **AND** the guard also fails if `package.json` declares `gray-matter` in `dependencies` or `devDependencies`

### Requirement: Main-process build emits no Rollup dynamic-code-evaluation warning from frontmatter parser

The `bun run build` command SHALL complete without emitting a Rollup warning of the form `Use of \`eval\` in "node_modules/.../engines.js" is strongly discouraged`, or any semantically equivalent warning, originating from a frontmatter parser package.

#### Scenario: Build output contains no eval warning from the frontmatter parser

- **WHEN** `bun run build 2>&1` is captured
- **THEN** the output contains zero lines matching `/gray-matter\/lib\/engines\.js.*eval/i`
- **AND** the output contains zero lines matching `/front-matter.*eval/i`

#### Scenario: Bundled main output does not contain gray-matter internals

- **GIVEN** a clean build (`bun run build` has completed successfully)
- **WHEN** `out/main/index.js` is inspected via `grep -c`
- **THEN** `grep -c "parseMatter\\|engines\\.js" out/main/index.js` returns `0`
- **AND** `grep -c "FrontMatterResult\\|bodyBegin" out/main/index.js` returns a non-zero count (proving the replacement parser is actually bundled, not externalized)
- **AND** `grep -cE 'require\\("gray-matter"\\)' out/main/index.js` returns `0`

### Requirement: Frontmatter shim preserves the `{ data, content }` destructure shape

The canonical frontmatter parser function `matter()` exported from `src/main/lib/frontmatter.ts` SHALL return an object compatible with the destructure patterns `{ data }`, `{ content }`, `{ data, content }`, and `{ content: body }` — the four shapes used by the four existing consumer files. The `data` property SHALL be typed as `Record<string, unknown>` (or a caller-provided generic `T extends Record<string, unknown>`), not `any`.

#### Scenario: Shim returns data-and-content shape for standard input

- **GIVEN** a string `input = "---\\nname: test\\ndescription: hi\\n---\\nbody"`
- **WHEN** `const { data, content } = matter(input)` is evaluated
- **THEN** `data` is `{ name: "test", description: "hi" }`
- **AND** `content` contains the body text `"body"` (trimmed or untrimmed — callers already apply `.trim()` as needed)

#### Scenario: Shim handles input with no frontmatter

- **GIVEN** a string `input = "just body, no frontmatter"`
- **WHEN** `const { data, content } = matter(input)` is evaluated
- **THEN** `data` is `{}`
- **AND** `content` equals the original input (modulo whitespace)

#### Scenario: Shim handles empty input

- **GIVEN** a string `input = ""`
- **WHEN** `matter(input)` is evaluated
- **THEN** the call succeeds and returns a `data: {}` / `content: ""` shape (or equivalent)
- **AND** no exception is thrown

#### Scenario: Data property is typed as Record<string, unknown>

- **GIVEN** the shim's TypeScript definition
- **WHEN** `bun run ts:check` is run on a consumer file that writes `data.foo.bar` without first narrowing `data.foo`
- **THEN** `tsgo` reports an error that `data.foo` is of type `unknown` and cannot be indexed
- **AND** the consumer is forced to use a type guard (e.g., `typeof data.foo === "object" && data.foo !== null`) before property access

### Requirement: Frontmatter parsing is synchronous

The canonical frontmatter parser function `matter()` SHALL be synchronous — it returns a plain object, not a `Promise`. This preserves the synchronous API shape that four main-process parse helpers (`parseCommandMd`, `parseSkillMd`, `parseAgentMd`, the inline parse blocks in `scanPluginCommands`/`scanPluginSkills`/`scanPluginAgents`) currently depend on.

This requirement exists to preclude accidental adoption of ESM-only parsers (such as `vfile-matter@5.x`) that would force the parse helpers to become `async` and ripple async-ness up through every caller. Future migration to an async parser is permitted if and only if it is scoped as a dedicated OpenSpec change that also refactors the parse call tree.

#### Scenario: Shim function signature is synchronous

- **GIVEN** the canonical shim `src/main/lib/frontmatter.ts`
- **WHEN** its exported `matter` symbol is inspected
- **THEN** its TypeScript return type is a plain object (not `Promise<...>`)
- **AND** it can be called from a synchronous function without `await`

### Requirement: Frontmatter shim bundles into the main-process output

The canonical shim and its underlying parser package (`front-matter` for the 2026-04 baseline) SHALL be bundled into `out/main/index.js` rather than left as runtime `require()` targets. The `electron.vite.config.ts` configuration SHALL include the underlying parser package name in `main.build.externalizeDeps.exclude`.

#### Scenario: Underlying parser package is in the exclude list

- **GIVEN** the file `electron.vite.config.ts`
- **WHEN** its `main.build.externalizeDeps.exclude` array is inspected
- **THEN** it contains `"front-matter"` (or the name of the current underlying parser package)
- **AND** it does NOT contain `"gray-matter"`

#### Scenario: Bundled output does not contain a runtime require for the parser

- **GIVEN** a clean build (`bun run build` has completed successfully)
- **WHEN** `out/main/index.js` is inspected
- **THEN** `grep -cE 'require\\("front-matter"\\)' out/main/index.js` returns `0` (bundled, not required)
- **AND** the build did not error

### Requirement: Consumer narrowing of untyped frontmatter data

Any main-process consumer that reads a property from the `data` object returned by the canonical shim SHALL narrow the property's type before use — for example, via `typeof data.name === "string"` for string properties or `Array.isArray(data.tools)` for array properties. Consumers SHALL NOT cast `data` to `any` or to a type that silently admits non-conforming values.

This requirement prevents latent bugs of the form `VALID_AGENT_MODELS.includes(data.model)` where `data.model` is untyped at runtime — under a strictly-typed parser, such calls fail at compile time and force the consumer to add an explicit string check.

#### Scenario: Agent model validation narrows data.model to string first

- **GIVEN** the function `parseAgentMd` in `src/main/lib/trpc/routers/agent-utils.ts`
- **WHEN** it validates the `model` field
- **THEN** it first checks `typeof data.model === "string"` before calling `VALID_AGENT_MODELS.includes(data.model as AgentModel)`
- **AND** `bun run ts:check` reports zero type errors on the validation block
