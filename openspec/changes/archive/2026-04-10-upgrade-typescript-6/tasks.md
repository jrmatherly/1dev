## 1. Pre-flight checks

- [x] 1.1 Read current baseline: `cat .claude/.tscheck-baseline` (currently 86 → **80** after mock-api Phase 2)
- [x] 1.2 Grep for import assertions: `grep -r "assert {" src/` — must migrate to `with {` syntax (**0 occurrences**)
- [x] 1.3 Grep for CSS side-effect imports: `grep -rn "import ['\"].*\.css" src/renderer/` (**5 confirmed**)
- [x] 1.4 Enumerate `@types/*` packages from package.json (must go in `types` array) — **5: better-sqlite3, diff, node, react, react-dom**
- [x] 1.5 Count `@ts-expect-error` / `@ts-ignore` directives (**43 across 14 files** ✓)
- [x] 1.6 Check `/// <reference types` directives resolve correctly in `src/env.d.ts` and `src/renderer/wdyr.ts` — **both resolve via package types, unaffected**
- [x] 1.7 Check `noEmit: true` + `declaration: true` compatibility with TS 6.0 — **both present in tsconfig, will remove**
- [x] 1.8 Check if `.vscode/settings.json` exists with pinned `typescript.tsdk` — **exists, no tsdk pin (only useTsgo + mirrord)**

## 2. Update TypeScript and tsconfig

- [x] 2.1 Update `package.json`: `"typescript": "^6.0.2"`
- [x] 2.2 Add `"types": ["node", "better-sqlite3", "diff", "react", "react-dom"]` to tsconfig compilerOptions
- [x] 2.3 Add `"noUncheckedSideEffectImports": false` to tsconfig compilerOptions
- [x] 2.4 Consider removing `"declaration": true` and `"declarationMap": true` (no-ops with noEmit) — **REMOVED both**
- [x] 2.5 Run `bun install` — **TypeScript 6.0.2 installed, native modules rebuilt**
- [x] 2.6 Optionally run `npx @andrewbranch/ts5to6` for automated migration — **SKIPPED: Phase 1 confirmed no `baseUrl`, no import assertions to migrate**

## 3. Fix import assertions

- [x] 3.1 Replace `import ... assert { type: "json" }` with `import ... with { type: "json" }` in any files identified in task 1.2 — **NO-OP: 0 occurrences in src/**

## 4. Update tsgo (globally installed)

- [x] 4.1 Run `npm install -g @typescript/native-preview@latest` — **upgraded to 7.0.0-dev.20260409.1**
- [x] 4.2 Run `bun run ts:check` — record new error count — **80 errors across 22 files**
- [x] 4.3 Compare to prior baseline (86) — note: up to +42 errors possible from unused `@ts-expect-error` directives — **NO CHANGE: still 80 (matches post-mock-api Phase 2 baseline); zero @ts-expect-error became unused**
- [x] 4.4 Update `.claude/.tscheck-baseline` with new count — **already 80, no edit needed**
- [x] 4.5 Update CLAUDE.md if tsgo install instructions or version reference changes — **updated tech stack one-liner: TypeScript 5 → TypeScript 6**

## 5. Run all quality gates

- [x] 5.1 Run `bun run ts:check` — verify against new baseline — **80 errors, matches baseline exactly**
- [x] 5.2 Run `bun run build` — verify esbuild packaging succeeds — **✓ built in 43.29s**
- [x] 5.3 Run `bun test` — verify all regression guards pass — **58 pass / 0 fail / 130 expects**
- [x] 5.4 Run `bun audit` — check for new advisories — **58 vulnerabilities (pre-existing baseline, no new from TS upgrade)**
- [x] 5.5 Run `cd docs && bun run build` — verify docs site build — **✓ built in 14.92s (isolated TS 5.9.3 via @xyd-js)**

## 6. Update documentation

- [x] 6.1 Update `docs/architecture/tech-stack.md` — TypeScript version — **TypeScript 5 → TypeScript 6 in row 13**
- [x] 6.2 Update `docs/conventions/pinned-deps.md` — if TypeScript was pinned — **N/A: TypeScript was never pinned, file has no TS reference**
- [x] 6.3 Update `openspec/config.yaml` context block — TypeScript version — **TypeScript 5 → TypeScript 6 in line 5**
