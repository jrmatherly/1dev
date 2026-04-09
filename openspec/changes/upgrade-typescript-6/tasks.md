## 1. Pre-flight checks

- [ ] 1.1 Read current baseline: `cat .claude/.tscheck-baseline` (currently 86)
- [ ] 1.2 Grep for import assertions: `grep -r "assert {" src/` — must migrate to `with {` syntax
- [ ] 1.3 Grep for CSS side-effect imports: `grep -rn "import ['\"].*\.css" src/renderer/` (expect 5)
- [ ] 1.4 Enumerate `@types/*` packages from package.json (must go in `types` array)
- [ ] 1.5 Count `@ts-expect-error` / `@ts-ignore` directives (expect 43 across 14 files)
- [ ] 1.6 Check `/// <reference types` directives resolve correctly in `src/env.d.ts` and `src/renderer/wdyr.ts`
- [ ] 1.7 Check `noEmit: true` + `declaration: true` compatibility with TS 6.0
- [ ] 1.8 Check if `.vscode/settings.json` exists with pinned `typescript.tsdk`

## 2. Update TypeScript and tsconfig

- [ ] 2.1 Update `package.json`: `"typescript": "^6.0.2"`
- [ ] 2.2 Add `"types": ["node", "better-sqlite3", "diff", "react", "react-dom"]` to tsconfig compilerOptions
- [ ] 2.3 Add `"noUncheckedSideEffectImports": false` to tsconfig compilerOptions
- [ ] 2.4 Consider removing `"declaration": true` and `"declarationMap": true` (no-ops with noEmit)
- [ ] 2.5 Run `bun install`
- [ ] 2.6 Optionally run `npx @andrewbranch/ts5to6` for automated migration

## 3. Fix import assertions

- [ ] 3.1 Replace `import ... assert { type: "json" }` with `import ... with { type: "json" }` in any files identified in task 1.2

## 4. Update tsgo (globally installed)

- [ ] 4.1 Run `npm install -g @typescript/native-preview@latest`
- [ ] 4.2 Run `bun run ts:check` — record new error count
- [ ] 4.3 Compare to prior baseline (86) — note: up to +42 errors possible from unused `@ts-expect-error` directives
- [ ] 4.4 Update `.claude/.tscheck-baseline` with new count
- [ ] 4.5 Update CLAUDE.md if tsgo install instructions or version reference changes

## 5. Run all quality gates

- [ ] 5.1 Run `bun run ts:check` — verify against new baseline
- [ ] 5.2 Run `bun run build` — verify esbuild packaging succeeds
- [ ] 5.3 Run `bun test` — verify all regression guards pass
- [ ] 5.4 Run `bun audit` — check for new advisories
- [ ] 5.5 Run `cd docs && bun run build` — verify docs site build

## 6. Update documentation

- [ ] 6.1 Update `docs/architecture/tech-stack.md` — TypeScript version
- [ ] 6.2 Update `docs/conventions/pinned-deps.md` — if TypeScript was pinned
- [ ] 6.3 Update `openspec/config.yaml` context block — TypeScript version
