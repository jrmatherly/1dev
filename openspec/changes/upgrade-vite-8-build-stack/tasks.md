## Tasks

### Phase A: Vite 7 (proceed immediately)

#### Task A1: Bump to Vite 7 + plugin-react 5
- Update `package.json`: `"vite": "^7.0.0"`, `"@vitejs/plugin-react": "^5.0.0"`
- Keep `electron-vite` at `5.0.0` (supports Vite 7)
- Run `bun install`
- **Files:** `package.json`, `bun.lock`

#### Task A2: Validate CJS interop
- Run `bun run build` — verify main/preload CJS output works
- Run `bun run dev` — verify dev server starts
- Test modules in `externalizeDeps.exclude` (superjson, trpc-electron, gray-matter, async-mutex) — verify imports resolve correctly
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

#### Task B2: Migrate electron.vite.config.ts
- Rename `rollupOptions` to `rolldownOptions` in all 3 sections (main, preload, renderer)
- Verify `external` arrays work with Rolldown
- Verify `output.format: "cjs"` works with Rolldown for main/preload
- Verify `externalizeDeps` option works in electron-vite 6.x
- **Files:** `electron.vite.config.ts`

#### Task B3: Validate Rolldown output
- Run `bun run build` — verify Rolldown produces correct bundles
- Compare output sizes to Rollup baseline
- Verify main process starts correctly (CJS format)
- Verify preload script loads correctly (CJS format)
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
- Update `openspec/config.yaml` — update tech stack versions in context block
