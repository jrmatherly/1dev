## Why

Vite 8 is the most significant architectural change in Vite's history — **Rolldown replaces both esbuild and Rollup** as the bundler. This delivers 10-30x faster builds and unifies the dev/build pipeline. However, it's also the highest-risk upgrade because:

1. **electron-vite 6.0.0 is beta-only** — the stable version (5.0.0) supports Vite 5/6/7 but NOT Vite 8. Moving to Vite 8 requires the unstable `electron-vite@6.0.0-beta.0`.
2. **CJS output format** — our main/preload processes use `output.format: "cjs"` which needs validation under Rolldown.
3. **@vitejs/plugin-react 6.0.1** requires Vite 8 (Babel fully removed, uses Oxc).

**Recommended approach:** Two-phase. Phase A (Vite 7 with electron-vite 5.0.0 stable) can proceed immediately. Phase B (Vite 8 with electron-vite 6.0.0) is blocked on `electron-vite` stable release.

> **Note (2026-04-10):** Shiki 3→4 was previously grouped into this proposal as §Shiki 3→4 but has been split out into a standalone `upgrade-shiki-4` change and merged via PR #11. The Shiki section and related Risk surface bullets have been removed from this proposal.

## What Changes

### Phase A: Vite 7 (unblocked)

**Version bumps:**
- **Vite 6.4.2 → 7.x** — browser target change, CJS interop change, removed features
- **@vitejs/plugin-react 4.7.0 → 5.x** — compatible with Vite 7, preserves `jsxImportSource`

**Vite 7 breaking changes affecting us:**
- `build.target` default changed from `'modules'` to `'baseline-widely-available'` (Chrome 107+) — non-issue for Electron
- CJS interop change — modules with both `browser` and `module` fields now respect `resolve.mainFields` order. May affect `superjson`, `trpc-electron`, `front-matter`, `async-mutex` (all in `externalizeDeps.exclude`; `gray-matter` was swapped for `front-matter` on 2026-04-12 via `replace-gray-matter-with-front-matter`)
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
- CSS minification uses Lightning CSS by default — **interaction with PostCSS/Tailwind pipeline needs analysis**: if Tailwind 4 has NOT landed yet, the Tailwind 3 PostCSS pipeline + Lightning CSS minifier may conflict (both handle vendor prefixing). May need `build.cssMinify: 'postcss'` during the interim.
- `output.format: "cjs"` needs validation under Rolldown for main/preload processes — specifically:
  - `__dirname` usage (5 sites in config, 8+ in main process source) — verify runtime resolution matches Rollup behavior
  - `require()` calls (3 sites: `index.ts:71`, `vscode-theme-scanner.ts:136`, `auth-manager.ts:367`) — verify Rolldown's CJS shim handles these correctly
  - Dynamic `await import()` (6+ sites including `node-pty`, `@anthropic-ai/claude-agent-sdk`, `electron`, `fs`, `chokidar`) — verify preserved as native dynamic imports, NOT converted to `require()` (ESM-only modules like claude-agent-sdk would break)
  - `import.meta.env` replacements (18+ locations across main and renderer) — verify MAIN_VITE_* prefixed variables still work under electron-vite 6.x + Rolldown
- `build.commonjsOptions` is now no-op

**`@swc/core` peer dependency:**
- electron-vite 5.0.0 has `@swc/core: "^1.0.0"` as optional peer dep. The project has `"@swc/core": "^1.15.24"`. When electron-vite 6.0.0 releases, its SWC/Babel peer deps may change (possibly replaced by Oxc). Must verify and update.

**Dead configuration cleanup:**
- `@prisma/client` in `rollupOptions.external` (line 22) — no source file imports it; dead config from upstream. Remove during `rolldownOptions` migration.
- `pnpm.overrides` section in `package.json:266-270` — project uses bun, not pnpm. Dead config.
- `node-pty` is NOT in explicit `external` array — relies on electron-vite's `externalizeDeps` auto-behavior. Consider adding explicitly for safety under Rolldown.

**plugin-react v6 breaking changes:**
- Babel completely removed — no impact (we only use `jsxImportSource`, which is preserved)
- Uses Oxc for React Refresh transforms
- `@vitejs/plugin-react-oxc` is now deprecated (this plugin does the same thing)

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

**Cross-dependency ordering:**
- Tailwind 4 MUST complete before Vite 8 Phase B — avoids double-restructuring `electron.vite.config.ts`
- If Vite 7 Phase A lands before Tailwind 4, verify `@tailwindcss/vite` works with Vite 7
- TypeScript 6 is order-independent (uses `noEmit`)
- Electron 41 is order-independent

**Risk surface:**
- **Critical blocker:** electron-vite 6.0.0 stable release (Phase B)
- **High risk:** CJS output format under Rolldown — `__dirname`, `require()`, dynamic `import()`, `import.meta.env`
- **High risk:** Lightning CSS + PostCSS/Tailwind 3 interaction (if Vite 8 lands before Tailwind 4)
- **High risk:** `@swc/core` peer dep changes in electron-vite 6.x
- **Medium risk:** CJS interop behavior change for `externalizeDeps.exclude` modules
- **Medium risk:** WDYR integration with Oxc JSX transforms
- **Medium risk:** `node-pty` implicit externalization under Rolldown
- **Low risk:** plugin-react `resolve.dedupe` change — verify single React instance in bundle

**No changes to:**
- tRPC routers, database schema, Drizzle migrations
- Electron version
- Runtime behavior of the application
- Upstream feature catalog (F1-F10)
