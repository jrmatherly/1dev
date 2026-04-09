## Tasks

### Task 1: Pre-flight checks
- Read current baseline: `cat .claude/.tscheck-baseline` (currently 86)
- Grep for import assertions: `grep -r "assert {" src/` — must migrate to `with {` syntax (expect 0 occurrences)
- Grep for CSS side-effect imports: `grep -rn "import ['\"].*\.css" src/renderer/` — catalog all occurrences (expect 5: `main.tsx`, `terminal.tsx`, 3 automations files)
- Enumerate `@types/*` packages: `grep "@types/" package.json` — confirm: `@types/better-sqlite3`, `@types/diff`, `@types/node`, `@types/react`, `@types/react-dom` (all 5 must go in `types` array)
- Count `@ts-expect-error` / `@ts-ignore`: `grep -rn "@ts-expect-error\|@ts-ignore" src/` — catalog count (expect 43 across 14 files, mostly `webkitAppRegion`)
- Check for `/// <reference types` directives: verify `src/env.d.ts` and `src/renderer/wdyr.ts` resolve correctly
- Check for `noEmit: true` + `declaration: true` compatibility with TS 6.0
- Check if `.vscode/settings.json` exists with pinned `typescript.tsdk`
- **Files:** Read-only analysis

### Task 2: Update TypeScript and tsconfig
- Update `package.json`: `"typescript": "^6.0.2"`
- Update `tsconfig.json`:
  - Add `"types": ["node", "better-sqlite3", "diff", "react", "react-dom"]` to compilerOptions
  - Add `"noUncheckedSideEffectImports": false` to compilerOptions
  - Consider removing `"declaration": true` and `"declarationMap": true` (contradicted by `noEmit: true`, no-ops)
- Run `bun install`
- Optionally run `npx @andrewbranch/ts5to6` to check for automated migrations
- **Files:** `package.json`, `tsconfig.json`, `bun.lock`

### Task 3: Fix import assertions (if any)
- Replace `import ... assert { type: "json" }` with `import ... with { type: "json" }`
- **Files:** Any files identified in Task 1

### Task 4: Update tsgo (globally installed)
- Run `npm install -g @typescript/native-preview@latest` — tsgo is globally installed, NOT a project dependency
- Run `bun run ts:check` — record new error count
- Compare to prior baseline (86) — note: up to +42 errors possible if `@ts-expect-error` directives become unused
- Update `.claude/.tscheck-baseline` with new count
- Update CLAUDE.md if the tsgo install instructions or version reference changes
- **Files:** `.claude/.tscheck-baseline` (no package.json change for tsgo)

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
