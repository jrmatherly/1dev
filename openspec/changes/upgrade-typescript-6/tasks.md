## Tasks

### Task 1: Pre-flight checks
- Read current baseline: `cat .claude/.tscheck-baseline`
- Grep for import assertions: `grep -r "assert {" src/` — must migrate to `with {` syntax
- Grep for CSS side-effect imports: `grep -rn "^import ['\"].*\.css" src/renderer/` — catalog all occurrences
- Enumerate `@types/*` packages in use: `grep "@types/" package.json` — determine if any beyond `@types/node` are needed in `types` array
- **Files:** Read-only analysis

### Task 2: Update TypeScript and tsconfig
- Update `package.json`: `"typescript": "^6.0.2"`
- Update `tsconfig.json`:
  - Add `"types": ["node"]` to compilerOptions
  - Add `"noUncheckedSideEffectImports": false` to compilerOptions
- Run `bun install`
- Optionally run `npx @andrewbranch/ts5to6` to check for automated migrations
- **Files:** `package.json`, `tsconfig.json`, `bun.lock`

### Task 3: Fix import assertions (if any)
- Replace `import ... assert { type: "json" }` with `import ... with { type: "json" }`
- **Files:** Any files identified in Task 1

### Task 4: Update tsgo
- Update `@typescript/native-preview` to latest version compatible with TS 6.0
- Run `bun run ts:check` — record new error count
- Compare to prior baseline (86)
- Update `.claude/.tscheck-baseline` with new count
- **Files:** `package.json`, `.claude/.tscheck-baseline`

### Task 5: Run all quality gates
- `bun run ts:check` — verify against new baseline
- `bun run build` — verify esbuild packaging succeeds
- `bun test` — verify all regression guards pass
- `bun audit` — check for new advisories
- `cd docs && bun run build` — verify docs site build

### Task 6: Update documentation
- Update `docs/architecture/tech-stack.md` — TypeScript version
- Update `docs/conventions/pinned-deps.md` — if TypeScript was pinned
- Update `openspec/config.yaml` — TypeScript version in context block
