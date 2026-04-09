## Why

Vite 8 is the most significant architectural change in Vite's history — **Rolldown replaces both esbuild and Rollup** as the bundler. This delivers 10-30x faster builds and unifies the dev/build pipeline. However, it's also the highest-risk upgrade because:

1. **electron-vite 6.0.0 is beta-only** — the stable version (5.0.0) supports Vite 5/6/7 but NOT Vite 8. Moving to Vite 8 requires the unstable `electron-vite@6.0.0-beta.0`.
2. **CJS output format** — our main/preload processes use `output.format: "cjs"` which needs validation under Rolldown.
3. **@vitejs/plugin-react 6.0.1** requires Vite 8 (Babel fully removed, uses Oxc).

Additionally, **Shiki 3→4** is grouped here because its only blocker (`@pierre/diffs` pinning `shiki: ^3.0.0`) is a transitive dependency concern best resolved alongside the build stack upgrade.

**Recommended approach:** Two-phase. Phase A (Vite 7 with electron-vite 5.0.0 stable) can proceed immediately. Phase B (Vite 8 with electron-vite 6.0.0) is blocked on `electron-vite` stable release.

## What Changes

### Phase A: Vite 7 (unblocked)

**Version bumps:**
- **Vite 6.4.2 → 7.x** — browser target change, CJS interop change, removed features
- **@vitejs/plugin-react 4.7.0 → 5.x** — compatible with Vite 7, preserves `jsxImportSource`

**Vite 7 breaking changes affecting us:**
- `build.target` default changed from `'modules'` to `'baseline-widely-available'` (Chrome 107+) — non-issue for Electron
- CJS interop change — modules with both `browser` and `module` fields now respect `resolve.mainFields` order. May affect `superjson`, `trpc-electron`, `gray-matter`, `async-mutex` (all in `externalizeDeps.exclude`)
- `splitVendorChunkPlugin` removed — already resolved (not in our config)

**plugin-react v5 breaking changes:**
- `resolve.dedupe` no longer auto-configured for React/react-dom
- Default `exclude` changed to `[/\/node_modules\//]`

### Phase B: Vite 8 (blocked on electron-vite 6.0.0 stable)

**Version bumps:**
- **Vite 7.x → 8.0.8** — Rolldown replaces esbuild+Rollup
- **electron-vite 5.0.0 → 6.0.0** (when stable) — adds Vite 8 support
- **@vitejs/plugin-react 5.x → 6.0.1** — Babel removed, uses Oxc

**Vite 8 breaking changes affecting us:**
- `build.rollupOptions` renamed to `build.rolldownOptions` (alias works but deprecated) — affects all 3 sections of `electron.vite.config.ts`
- esbuild config deprecated in favor of `oxc` — doesn't affect us directly (electron-vite handles transpilation)
- `build.minify: 'esbuild'` deprecated — Oxc Minifier takes over
- CSS minification uses Lightning CSS by default
- `output.format: "cjs"` needs validation under Rolldown for main/preload processes
- `build.commonjsOptions` is now no-op

**plugin-react v6 breaking changes:**
- Babel completely removed — no impact (we only use `jsxImportSource`, which is preserved)
- Uses Oxc for React Refresh transforms
- `@vitejs/plugin-react-oxc` is now deprecated (this plugin does the same thing)

### Shiki 3→4 (blocked on @pierre/diffs)

**Version bump:**
- **shiki 3.23.0 → 4.0.2** — effectively a no-op upgrade at the code level

**Breaking changes (none affect us):**
- Node.js >= 20 required (we're on 24)
- `createdBundledHighlighter` typo-fix rename (we don't use it)
- All APIs we use (`createHighlighter`, `codeToHtml`, `codeToHast`, `loadTheme`, `getLoadedThemes`, `getLoadedLanguages`, `BundledTheme`, `Highlighter` types) are unchanged

**Blocker:** `@pierre/diffs@1.1.13` pins `"shiki": "^3.0.0"` and `"@shikijs/transformers": "^3.0.0"`. Cannot upgrade until upstream publishes a version accepting `^4.0.0`.

**WDYR integration:** The `jsxImportSource` option for `@welldone-software/why-did-you-render` is preserved in plugin-react v5 and v6. However, the switch from Babel to Oxc for JSX transforms means WDYR runtime integration needs verification.

## Capabilities

### New Capabilities
None — build toolchain upgrade only.

### Modified Capabilities
None — no behavioral changes; build infrastructure only.

## Impact

**Affected code:**
- `package.json` — vite, electron-vite, @vitejs/plugin-react, shiki version bumps
- `electron.vite.config.ts` — `rollupOptions` → `rolldownOptions` rename (Phase B)
- No application source code changes (except shiki import verification)

**Affected build/release pipeline:**
- Dev server startup time (expected improvement with Rolldown)
- Build output format and size (Rolldown + Oxc minification)
- All platform builds need verification

**Risk surface:**
- **Critical blocker:** electron-vite 6.0.0 stable release (Phase B)
- **Critical blocker:** @pierre/diffs shiki v4 support (Shiki upgrade)
- **High risk:** CJS output format under Rolldown for main/preload
- **Medium risk:** CJS interop behavior change for `externalizeDeps.exclude` modules
- **Medium risk:** WDYR integration with Oxc JSX transforms
- **Low risk:** plugin-react `resolve.dedupe` change
- **No risk:** Shiki API changes (none that affect us)

**No changes to:**
- tRPC routers, database schema, Drizzle migrations
- Electron version
- Runtime behavior of the application
- Upstream feature catalog (F1-F10)
