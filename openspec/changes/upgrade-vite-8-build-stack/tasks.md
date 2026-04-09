## 1. Phase A — Bump to Vite 7 + plugin-react 5

- [ ] 1.1 Update `package.json`: `"vite": "^7.0.0"`, `"@vitejs/plugin-react": "^5.0.0"`
- [ ] 1.2 Keep `electron-vite` at `5.0.0` (supports Vite 7)
- [ ] 1.3 Run `bun install`

## 2. Phase A — Validate CJS interop and env replacements

- [ ] 2.1 Run `bun run build` — verify main/preload CJS output works
- [ ] 2.2 Run `bun run dev` — verify dev server starts
- [ ] 2.3 Test modules in `externalizeDeps.exclude` (superjson, trpc-electron, gray-matter, async-mutex)
- [ ] 2.4 Verify `import.meta.env` replacements work in all 3 processes (DEV, PROD, MAIN_VITE_*)
- [ ] 2.5 Verify single React instance in bundle (no duplicate React from missing `resolve.dedupe`)

## 3. Phase A — Quality gates

- [ ] 3.1 Run `bun run ts:check` — verify no new TS errors
- [ ] 3.2 Run `bun run build` — verify packaging succeeds
- [ ] 3.3 Run `bun test` — verify regression guards pass
- [ ] 3.4 Run `bun audit` — check for new advisories

## 4. Phase A — Functional verification

- [ ] 4.1 Open app in dev mode — verify hot reload works
- [ ] 4.2 Create chat session — verify tRPC communication
- [ ] 4.3 Open terminal — verify PTY works
- [ ] 4.4 Test AI backends (Claude, Codex, Ollama) — verify agent SDK integration

## 5. Phase B — Bump to Vite 8 + electron-vite 6 + plugin-react 6 (blocked on electron-vite 6.0.0 stable)

- [ ] 5.1 Verify electron-vite 6.0.0 stable released on npm (prerequisite)
- [ ] 5.2 Update `package.json`: `"vite": "^8.0.8"`, `"electron-vite": "^6.0.0"`, `"@vitejs/plugin-react": "^6.0.1"`
- [ ] 5.3 Run `bun install`
- [ ] 5.4 Verify `@swc/core` peer dependency — may be dropped in electron-vite 6.x
- [ ] 5.5 Verify `@babel/core` dependency — may be replaced by Oxc
- [ ] 5.6 Update `@swc/core` in devDependencies if needed

## 6. Phase B — Migrate electron.vite.config.ts

- [ ] 6.1 Rename `rollupOptions` to `rolldownOptions` in all 3 sections (main, preload, renderer)
- [ ] 6.2 Remove `@prisma/client` from `external` array (dead config)
- [ ] 6.3 Consider adding `node-pty` to explicit `external` array
- [ ] 6.4 Remove `pnpm.overrides` section from `package.json` (project uses bun)
- [ ] 6.5 Verify `externalizeDeps` option works in electron-vite 6.x

## 7. Phase B — Validate Rolldown output

- [ ] 7.1 Run `bun run build` — verify Rolldown produces correct bundles
- [ ] 7.2 Compare output sizes to Rollup baseline
- [ ] 7.3 Verify main process starts correctly (CJS format)
- [ ] 7.4 Verify preload script loads correctly (CJS format)
- [ ] 7.5 Verify `__dirname` resolves correctly at runtime (8+ sites in main process)
- [ ] 7.6 Verify `require()` calls work (3 sites: `index.ts:71`, `vscode-theme-scanner.ts:136`, `auth-manager.ts:367`)
- [ ] 7.7 Verify dynamic `await import()` preserved as native imports (node-pty, Claude SDK, electron, chokidar)
- [ ] 7.8 Verify `import.meta.env` replacements work for MAIN_VITE_* prefixed variables

## 8. Phase B — Verify WDYR integration

- [ ] 8.1 Run `bun run dev` — verify Why Did You Render still works with Oxc JSX transforms
- [ ] 8.2 Check console for WDYR re-render reports
- [ ] 8.3 If broken: evaluate whether to keep WDYR or drop it

## 9. Phase B — Quality gates

- [ ] 9.1 Run `bun run ts:check`
- [ ] 9.2 Run `bun run build`
- [ ] 9.3 Run `bun test`
- [ ] 9.4 Run `bun audit`
- [ ] 9.5 Run `cd docs && bun run build`

## 10. Shiki upgrade (blocked on @pierre/diffs)

- [ ] 10.1 Monitor `@pierre/diffs` for shiki v4 support: `npm info @pierre/diffs versions`
- [ ] 10.2 File issue on @pierre/diffs GitHub if no update available
- [ ] 10.3 Update `package.json`: `"shiki": "^4.0.2"` once unblocked
- [ ] 10.4 Update `@pierre/diffs` to shiki-v4-compatible version
- [ ] 10.5 Run `bun install`
- [ ] 10.6 Run `bun run build` — verify shiki bundling works
- [ ] 10.7 Open chat with code blocks — verify syntax highlighting
- [ ] 10.8 Switch themes — verify theme loading and mapping
- [ ] 10.9 Open diff view — verify diff highlighting with `codeToHast`

## 11. Final documentation

- [ ] 11.1 Update `docs/conventions/pinned-deps.md` — remove Vite 6.x and Shiki 3.x pins
- [ ] 11.2 Update `docs/architecture/tech-stack.md` — Vite, plugin-react, Shiki versions
- [ ] 11.3 Update `openspec/config.yaml` context — batch update ALL tech stack versions (this is the last proposal to land)

## 12. Post-all-upgrades validation sweep

- [ ] 12.1 Run ALL 5 quality gates: ts:check, build, test, audit, docs build
- [ ] 12.2 Re-baseline `.tscheck-baseline` one final time (combined impact of all 4 upgrades)
- [ ] 12.3 Full functional test: app startup, chat, terminal, credential storage, auto-updater, dark mode
- [ ] 12.4 Verify no emergent failures from combined upgrade state (Electron 41 + TS 6 + Tailwind 4 + Vite 7/8)
