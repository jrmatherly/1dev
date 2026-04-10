## Why

TypeScript 6.0 (released March 23, 2026) is the **last JavaScript-based release** before TypeScript 7.0 (the Go rewrite). It is a "bridge release" designed to align defaults and deprecate legacy options. Staying on 5.x means missing the bridge and facing a harder jump to 7.0 later.

The project's `tsconfig.json` is **well-positioned** — most options are already set explicitly (strict, module, target, moduleResolution, esModuleInterop, rootDir), so most new defaults won't bite us. Since we use `noEmit: true` with esbuild for transpilation, **this is primarily a type-checking concern, not a build concern**.

## What Changes

**Core version bump:**
- **TypeScript 5.9.3 → 6.0.2** — 9 changed defaults, several removed options, deprecation bridge

**tsconfig.json changes required:**
- **ADD `"types": ["node", "better-sqlite3", "diff", "react", "react-dom"]`** — TS 6.0 defaults `types` to `[]` (was auto-discover all `@types/*`). The project has 5 explicit `@types/*` devDependencies plus 62 transitive `@types/*` packages. All explicitly declared packages must be listed or type resolution for those modules will break. (`skipLibCheck: true` only skips checking `.d.ts` files — it does NOT skip resolution.)
- **ADD `"noUncheckedSideEffectImports": false`** — TS 6.0 enables this by default. 5 TS/TSX files have CSS side-effect imports: `main.tsx`, `terminal.tsx`, `automations-detail-view.tsx`, `automations-view.tsx`, `inbox-view.tsx`.
- **REMOVE `"esModuleInterop": true`** — now unconditionally enabled; the option is ignored but setting it is harmless (can keep for clarity).
- **CONSIDER REMOVING `"declaration": true` and `"declarationMap": true`** — these are contradicted by `"noEmit": true` (which suppresses all output) and are effectively no-ops. TS 6.0's "align defaults" philosophy may flag contradictory settings.

**Changes with NO impact (already explicit in tsconfig):**
- `strict` defaults to `true` — already set
- `module` defaults to `esnext` — already `"ESNext"`
- `target` defaults to `es2025` — already `"ES2022"`
- `moduleResolution` defaults to `bundler` — already `"bundler"`
- `rootDir` defaults to tsconfig directory — already `"./src"`
- `resolveJsonModule` defaults to `true` — already set
- `isolatedModules` defaults to `true` — already set
- `forceConsistentCasingInFileNames` defaults to `true` — already set

**Removed features (none affect us):**
- `moduleResolution: "classic"` removed — we use `"bundler"`
- `module: "amd"/"umd"/"system"` removed — we use `"ESNext"`
- `outFile` removed — we use `noEmit: true`
- Import assertions syntax removed — check for `assert { type: "json" }` (replace with `with { type: "json" }`)

**tsgo / @typescript/native-preview alignment:**
- TS 6.0 introduces `--stableTypeOrdering` flag for tsgo parity (25% perf cost, use only for comparison)
- Update `@typescript/native-preview` to a version aligned with TS 6.0 semantics — **NOTE: tsgo is globally installed (`npm install -g @typescript/native-preview`), NOT a project dependency**
- The `types: []` default must be honored by both `tsc` and `tsgo`

**`/// <reference types>` directives (unaffected):**
- `src/env.d.ts:1` — `/// <reference types="vite/client" />` (provides `ImportMetaEnv`)
- `src/renderer/wdyr.ts:1` — `/// <reference types="@welldone-software/why-did-you-render" />`
- These resolve via package types, NOT `@types/*`, so the `types` array change does not affect them. Verify post-upgrade.

**`@ts-expect-error` baseline risk:**
- 43 occurrences across 14 files (42 are for `webkitAppRegion` CSS property)
- If TS 6.0 adds proper WebKit CSS property types, these could flip from suppressing a real error to being "unused @ts-expect-error" errors, increasing the baseline by up to 42

**Error baseline impact:**
- Current baseline: ~86 errors in `.claude/.tscheck-baseline`
- Baseline **will shift** — could go up (new strictness) or down (improved inference)
- Must re-baseline immediately after upgrade

**Migration tool available:** `npx @andrewbranch/ts5to6` — handles baseUrl/rootDir migrations. Since we don't use baseUrl and already set rootDir, this may report "nothing to do."

**Escape hatch:** `"ignoreDeprecations": "6.0"` suppresses deprecation errors temporarily. Must be resolved before TS 7.0.

## Capabilities

### New Capabilities
None — toolchain upgrade only.

### Modified Capabilities
None — no behavioral changes; type-checking only.

## Impact

**Affected code:**
- `package.json` — `"typescript": "^6.0.2"`
- `tsconfig.json` — add `types`, `noUncheckedSideEffectImports`
- `.claude/.tscheck-baseline` — re-baseline error count
- `openspec/config.yaml` — update TypeScript version in context

**Affected build/release pipeline:**
- `bun run ts:check` (tsgo) — error count will change
- `bun run build` (esbuild via electron-vite) — no impact expected (esbuild strips types)

**Risk surface:**
- **High risk:** `types: []` default breaks ambient type resolution — mitigated by listing all 5 `@types/*` packages
- **High risk:** Error baseline shift — up to +42 from `@ts-expect-error` directives becoming unused
- **High risk:** `noEmit` + `declaration` contradictory config — TS 6.0 may flag
- **Medium risk:** `noUncheckedSideEffectImports` on CSS imports (5 files) — mitigated by setting to `false`
- **Medium risk:** tsgo version alignment — must update global `@typescript/native-preview` install
- **Low risk:** Import assertions → attributes syntax change (0 occurrences found)
- **Low risk:** Third-party `@types/*` compatibility — mitigated by `skipLibCheck: true`

**Docs site isolation:**
- The `docs/` directory has its own `package.json` and `bun.lock` pinning TypeScript at 5.9.3 via `@xyd-js/sources`. The `cd docs && bun run build` quality gate does NOT validate TS 6 compatibility — it uses its own locked TS version. This is acceptable; the `@xyd-js/cli` pin cannot be changed (per `pinned-deps.md`). Also note `@react-router/dev@7.14.0` in docs has `peerDependencies: { "typescript": "^5.1.0" }`, blocking docs-side TS6 adoption until upstream updates.

**No changes to:**
- tRPC routers, database schema, Drizzle migrations
- Electron version, build tooling
- Runtime behavior of any kind
