## Why

TypeScript 6.0 (released March 23, 2026) is the **last JavaScript-based release** before TypeScript 7.0 (the Go rewrite). It is a "bridge release" designed to align defaults and deprecate legacy options. Staying on 5.x means missing the bridge and facing a harder jump to 7.0 later.

The project's `tsconfig.json` is **well-positioned** — most options are already set explicitly (strict, module, target, moduleResolution, esModuleInterop, rootDir), so most new defaults won't bite us. Since we use `noEmit: true` with esbuild for transpilation, **this is primarily a type-checking concern, not a build concern**.

## What Changes

**Core version bump:**
- **TypeScript 5.9.3 → 6.0.2** — 9 changed defaults, several removed options, deprecation bridge

**tsconfig.json changes required:**
- **ADD `"types": ["node"]`** — TS 6.0 defaults `types` to `[]` (was auto-discover all `@types/*`). Without this, builds break immediately as Node.js types vanish.
- **ADD `"noUncheckedSideEffectImports": false`** — TS 6.0 enables this by default. CSS/style side-effect imports (`import "./styles.css"`) handled by the bundler will error unless opted out.
- **REMOVE `"esModuleInterop": true`** — now unconditionally enabled; the option is ignored but setting it is harmless (can keep for clarity).

**Changes with NO impact (already explicit in tsconfig):**
- `strict` defaults to `true` — already set
- `module` defaults to `esnext` — already `"ESNext"`
- `target` defaults to `es2025` — already `"ES2022"`
- `moduleResolution` defaults to `bundler` — already `"bundler"`
- `rootDir` defaults to tsconfig directory — already `"./src"`

**Removed features (none affect us):**
- `moduleResolution: "classic"` removed — we use `"bundler"`
- `module: "amd"/"umd"/"system"` removed — we use `"ESNext"`
- `outFile` removed — we use `noEmit: true`
- Import assertions syntax removed — check for `assert { type: "json" }` (replace with `with { type: "json" }`)

**tsgo / @typescript/native-preview alignment:**
- TS 6.0 introduces `--stableTypeOrdering` flag for tsgo parity (25% perf cost, use only for comparison)
- Update `@typescript/native-preview` to a version aligned with TS 6.0 semantics
- The `types: []` default must be honored by both `tsc` and `tsgo`

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
- **High risk:** `types: []` default breaks ambient type resolution — mitigated by adding `"types": ["node"]`
- **High risk:** Error baseline shift — requires re-measurement
- **Medium risk:** `noUncheckedSideEffectImports` on CSS imports — mitigated by setting to `false`
- **Medium risk:** tsgo version alignment — must update `@typescript/native-preview`
- **Low risk:** Import assertions → attributes syntax change
- **Low risk:** Third-party `@types/*` compatibility — mitigated by `skipLibCheck: true`

**No changes to:**
- tRPC routers, database schema, Drizzle migrations
- Electron version, build tooling
- Runtime behavior of any kind
