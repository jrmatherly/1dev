## Tasks

### Phase A: Vite 7 (proceed immediately)

#### Task A1: Bump to Vite 7 + plugin-react 5
- Update `package.json`: `"vite": "^7.0.0"`, `"@vitejs/plugin-react": "^5.0.0"`
- Keep `electron-vite` at `5.0.0` (supports Vite 7)
- Run `bun install`
- **Files:** `package.json`, `bun.lock`

#### Task A2: Validate CJS interop and env replacements
- Run `bun run build` — verify main/preload CJS output works
- Run `bun run dev` — verify dev server starts
- Test modules in `externalizeDeps.exclude` (superjson, trpc-electron, gray-matter, async-mutex) — verify imports resolve correctly
- Verify `import.meta.env` replacements work in all 3 processes (DEV, PROD, MAIN_VITE_* prefixed vars)
- Verify single React instance in bundle (no duplicate React from missing `resolve.dedupe`)
- **Files:** No code changes expected

#### Task A3: Run quality gates
- `bun run ts:check` — verify no new TS errors
- `bun run build` — verify packaging succeeds
- `bun test` — verify regression guards pass
- `bun audit` — check for new advisories

#### Task A4: Functional verification
- Open app in dev mode — verify hot reload works
- Create chat session — verify tRPC communication
- Open terminal — verify PTY works
- Test AI backends (Claude, Codex, Ollama) — verify agent SDK integration

### Phase B: Vite 8 (blocked on electron-vite 6.0.0 stable)

#### Task B1: Bump to Vite 8 + electron-vite 6 + plugin-react 6
- **Prerequisite:** electron-vite 6.0.0 stable released on npm
- Update `package.json`: `"vite": "^8.0.8"`, `"electron-vite": "^6.0.0"`, `"@vitejs/plugin-react": "^6.0.1"`
- Run `bun install`
- **Files:** `package.json`, `bun.lock`

#### Task B1.5: Check electron-vite 6.0.0 peer dependencies
- Verify `@swc/core` peer dependency — may be dropped or changed in electron-vite 6.x
- Verify `@babel/core` dependency — may be replaced by Oxc
- Update `@swc/core` in devDependencies if needed
- **Files:** `package.json` (if version changes needed)

#### Task B2: Migrate electron.vite.config.ts
- Rename `rollupOptions` to `rolldownOptions` in all 3 sections (main, preload, renderer)
- Remove `@prisma/client` from `external` array (dead config — no source file imports it)
- Consider adding `node-pty` to explicit `external` array (currently relies on implicit `externalizeDeps`)
- Remove `pnpm.overrides` section from `package.json` (dead config — project uses bun)
- Verify `externalizeDeps` option works in electron-vite 6.x
- **Files:** `electron.vite.config.ts`, `package.json`

#### Task B3: Validate Rolldown output
- Run `bun run build` — verify Rolldown produces correct bundles
- Compare output sizes to Rollup baseline
- Verify main process starts correctly (CJS format)
- Verify preload script loads correctly (CJS format)
- **Specific CJS verifications:**
  - `__dirname` resolves correctly at runtime (8+ sites in main process: `windows/main.ts:141,613,698,879,890`, `index.ts:182,646`, `db/index.ts:37`, `cli.ts:63`)
  - `require()` calls work (3 sites: `index.ts:71`, `vscode-theme-scanner.ts:136`, `auth-manager.ts:367`)
  - Dynamic `await import()` preserved as native imports, NOT converted to `require()` — test `node-pty`, `@anthropic-ai/claude-agent-sdk` (ESM-only), `electron`, `chokidar`
  - `import.meta.env` replacements work for MAIN_VITE_* prefixed variables
- **Files:** No code changes expected

#### Task B4: Verify WDYR integration
- Run `bun run dev` — verify Why Did You Render still works with Oxc JSX transforms
- Check console for WDYR re-render reports
- If broken: evaluate whether to keep WDYR or drop it
- **Files:** May need `electron.vite.config.ts` adjustment

#### Task B5: Run all quality gates (Phase B)
- `bun run ts:check`, `bun run build`, `bun test`, `bun audit`, `cd docs && bun run build`

### Shiki Upgrade (blocked on @pierre/diffs)

#### Task S1: Monitor @pierre/diffs for shiki v4 support
- **Prerequisite:** `@pierre/diffs` releases a version with `"shiki": "^4.0.0"` or `"^3.0.0 || ^4.0.0"`
- Check npm: `npm info @pierre/diffs versions`
- If no update available, consider filing an issue on @pierre/diffs GitHub
- **Files:** None (monitoring only)

#### Task S2: Bump Shiki to v4
- Update `package.json`: `"shiki": "^4.0.2"`
- Update `@pierre/diffs` to shiki-v4-compatible version
- Run `bun install`
- **Files:** `package.json`, `bun.lock`

#### Task S3: Verify Shiki functionality
- `bun run build` — verify shiki bundling works
- Open chat with code blocks — verify syntax highlighting
- Switch themes — verify theme loading and mapping
- Open diff view — verify diff highlighting with `codeToHast`
- **Files:** No code changes expected

### Final Documentation

#### Task F1: Update documentation and pins
- Update `docs/conventions/pinned-deps.md` — remove Vite 6.x and Shiki 3.x pins
- Update `docs/architecture/tech-stack.md` — Vite, plugin-react, Shiki versions
- Update `openspec/config.yaml` — update ALL tech stack versions in context block (batch: Electron 41, TypeScript 6, Tailwind 4, Vite 8 — this is the last proposal to land, so update all versions at once to avoid sequential merge conflicts)

#### Task F2: Post-all-upgrades validation sweep
- Run ALL 5 quality gates: `bun run ts:check`, `bun run build`, `bun test`, `bun audit`, `cd docs && bun run build`
- Re-baseline `.tscheck-baseline` one final time (reflects combined impact of all 4 upgrades)
- Full functional test: app startup, chat, terminal, credential storage, auto-updater, dark mode
- Verify no emergent failures from combined upgrade state (Electron 41 + TS 6 + Tailwind 4 + Vite 7/8)
