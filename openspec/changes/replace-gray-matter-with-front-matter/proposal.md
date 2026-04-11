## Why

The `electron-vite` main-process build emits a Rollup warning for `node_modules/gray-matter/lib/engines.js (43:13): Use of \`eval\` ... is strongly discouraged as it poses security risks`. The unreachable `engines.javascript` code path ships in every main-process bundle even though our 4 call sites only parse vanilla YAML frontmatter and never invoke the JavaScript/CoffeeScript engines. An empirical spike (captured in the research doc cited below) proved the warning cannot be silenced by passing `{ engines: { yaml: ... } }` at call sites — `gray-matter/index.js` unconditionally `require`s `./lib/engines`, so the offending function is always present in the bundled source. Replacing `gray-matter` with `front-matter` (behind a thin shim) removes the module from the bundle entirely and silences the warning, which was already validated end-to-end against all six quality gates during the research spike.

Closing this eliminates a defense-in-depth concern (the `eval` path is dead code, but still ships inside a signed Electron binary), removes the noisy recurring Rollup warning from CI output, and resolves a long-standing roadmap item (added 2026-04-09).

> Research reference (scratchpad-only, not cited from tracked files elsewhere per `.claude/rules/scratchpad.md`): the full research, option comparison, and spike log live at `.scratchpad/research-notes/gray-matter-eval-warning-research.md`. This proposal reproduces the key evidence inline below so it exists in tracked history.

## What Changes

- **ADD** `src/main/lib/frontmatter.ts` — a ~20-line shim that wraps `front-matter` and exposes a `{ data, content }` return shape matching the former `gray-matter` API. This is the canonical frontmatter parser for main-process code; direct `front-matter` imports outside this file are forbidden.
- **MODIFY** `src/main/lib/trpc/routers/commands.ts`, `plugins.ts`, `skills.ts`, and `agent-utils.ts` (8 call sites across 4 files) — swap `import matter from "gray-matter"` → `import { matter } from "../../frontmatter"` (adjust relative path). Zero changes to call-site destructures (`{ data }`, `{ data, content }`, `{ content: body }` all preserved by the shim).
- **MODIFY** `src/main/lib/trpc/routers/agent-utils.ts:85` — narrow-fix for `VALID_AGENT_MODELS.includes(data.model)` — front-matter's stricter typing resolves `data.model` to `unknown` rather than gray-matter's loose `any`, and `.includes()` rejects `unknown`. Solution: `typeof data.model === "string" && VALID_AGENT_MODELS.includes(data.model as AgentModel)`. **This is a small latent bug fix** — the pre-migration code silently bypassed validation for non-string model values.
- **MODIFY** `electron.vite.config.ts` — swap `"gray-matter"` for `"front-matter"` in `main.build.externalizeDeps.exclude` so the shim dependency is bundled into the main-process output (matching the current gray-matter treatment).
- **MODIFY** `package.json` / `bun.lock` — `bun remove gray-matter && bun add front-matter@^4.0.2`.
- **ADD** `tests/regression/no-gray-matter.test.ts` — new bun:test regression guard enforcing: (1) no `gray-matter` in `package.json` deps/devDeps, (2) no `gray-matter` imports/requires anywhere under `src/main/**/*.ts`. Prevents accidental re-introduction via Dependabot, AI suggestions, or manual edits. Follows the existing file-level allowlist pattern from guards such as `no-scratchpad-references.test.ts` and `credential-storage-tier.test.ts`.
- **ADD** `tests/regression/frontmatter-shim-shape.test.ts` — new bun:test unit test validating: (1) shim returns `{ data, content }` shape; (2) empty-frontmatter input produces `{ data: {}, content: <raw> }`; (3) BOM-prefixed input parses correctly; (4) a fixture agent `.md` file parses into the shape `parseAgentMd` expects (with `name`, `description`, `tools`, `model` accessible).
- **MODIFY** `docs/operations/roadmap.md` — move the "Eliminate gray-matter eval warning" item from the active backlog to the "Recently Completed" table upon merge, with a corrected effort breakdown and the factual corrections summarized under `## Impact` below.

## Capabilities

### New Capabilities
- `frontmatter-parsing`: Canonical main-process facility for parsing YAML frontmatter from `.md` files discovered under `~/.claude/{commands,agents,skills,plugins}` and `<cwd>/.claude/**`. This capability owns the single allowed import path for a frontmatter parser (`src/main/lib/frontmatter.ts`), the requirement that no main-process code invoke a dynamic-code-evaluation path, and the enforcement pattern (regression guard). This matches the precedent set by `shiki-highlighter` (pure dep-swap change → new micro-capability spec → archived as baseline) from the `upgrade-shiki-4` change.

### Modified Capabilities
None. This change adds a new micro-capability rather than modifying an existing one. The 4 target files are consumers of the new `frontmatter-parsing` capability but are themselves implementation details under the plugin/agent/skill/command tRPC surfaces, which describe request/response contracts, not parser choice.

**Why a new micro-capability, not a delta on `electron-runtime`**: Adding a "main-process dependencies must bundle without eval warnings" requirement to `electron-runtime` would overreach — it would apply to every dependency, not just frontmatter parsing. A dedicated `frontmatter-parsing` capability matches the granularity of other upgrade-driven specs (`shiki-highlighter`, `typescript-toolchain`) and gives future work a precise point of reference ("the frontmatter parser is specified here, not in the router files that happen to call it").

## Impact

### Affected code

- **Main-process files (4 files, 8 call sites):**
  - `src/main/lib/trpc/routers/commands.ts` — 3 call sites (lines 33, 103, 256)
  - `src/main/lib/trpc/routers/plugins.ts` — 3 call sites (lines 73, 118, 160)
  - `src/main/lib/trpc/routers/skills.ts` — 1 call site (line 32)
  - `src/main/lib/trpc/routers/agent-utils.ts` — 1 call site (line 55) + 1 narrow-fix (line 85)
- **Main-process infrastructure (2 files):**
  - `src/main/lib/frontmatter.ts` — new canonical parser wrapper
  - `electron.vite.config.ts` — `externalizeDeps.exclude` list edit
- **Tests (2 new files):**
  - `tests/regression/no-gray-matter.test.ts`
  - `tests/regression/frontmatter-shim-shape.test.ts`
- **Documentation (1 file):**
  - `docs/operations/roadmap.md` — move roadmap item to completed

### Affected tRPC routers

Three routers consume the shim indirectly through their helpers:
- `commandsRouter` — `parseCommandMd`, `scanCommandsDirectory`
- `pluginsRouter` — `scanPluginCommands`, `scanPluginSkills`, `scanPluginAgents`
- `skillsRouter` — `parseSkillMd`
- (`agent-utils.ts` is not a router but a shared helper for the agents surface, consumed by `chat-router.ts` via `loadAgent`/`buildAgentsOption`.)

No router input/output schemas change. No renderer-side types change. No tRPC client code needs updates.

### Affected database tables

None.

### Affected dependencies

- **Remove**: `gray-matter@4.0.3` (direct dep), `section-matter@1.0.0`, `strip-bom-string@1.0.0` (gray-matter's direct children — drop out of the tree).
- **Retain** (despite the original roadmap item's claim that they'd drop): `js-yaml@3.14.2`, `argparse@1.x`, `sprintf-js`, `esprima`, `kind-of` — these stay because `front-matter` depends on `js-yaml@^3.13.1`, the same version gray-matter uses. **This is a factual correction to the roadmap item**, which claimed the full 7-package tree would drop under Option 2. In reality only 3 packages drop under this option; the full 7-package reduction would require migrating to `vfile-matter` (Option 3), which is deferred to a future change because `vfile-matter` is ESM-only and our main process outputs CJS — requiring a disruptive async refactor of every parse helper. See the research doc's §2.3 for the Option 3 cost breakdown.
- **Add**: `front-matter@^4.0.2` (1 package; its `js-yaml@^3.13.1` dep is already satisfied via the existing gray-matter chain, so no net new transitive adds).

### Phase 0 gate advancement

None. Phase 0 is already 15/15 complete. This is a post-Phase-0 cleanup item from the operations roadmap.

### Upstream feature inventory (F1-F10)

None of the F1-F10 upstream-dependent code paths are touched. Frontmatter parsing is entirely local-first and sits in the main process's file-discovery path for `~/.claude/{commands,agents,skills,plugins}` — no upstream SaaS boundary is crossed.

### Bundle impact

Empirically measured during the research spike: `out/main/index.js` grows from ~840 KB to 868,936 bytes (**+28 KB**, ~3% delta). Within noise for an Electron main-process bundle (typical >2 MB). No size concern. Post-migration bundle introspection confirmed:
- `require("gray-matter")` count = 0
- `parseMatter` / `engines.js` string count in bundle = 0
- `FrontMatterResult` / `bodyBegin` count = 3 (proof front-matter is bundled, not externalized)
- Rollup warning count = 0

### Risk profile

Low. The shim pattern isolates the external API contact surface in a single file, so if `front-matter` is ever found to be buggy the migration can be reversed in minutes by pointing the shim at a different parser (or directly at `js-yaml`). Full rollback = `git revert` a single commit. Full validation plan: see `design.md`.
