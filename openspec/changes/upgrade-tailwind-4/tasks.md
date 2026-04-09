## Tasks

### Task 1: Pre-flight audit
- Catalog all `--tw-ring-*` internal variable references in `agents-styles.css` (lines 219-226)
- Count `flex-shrink-*`, `outline-none`, `shadow-*`, `rounded-*` occurrences for comparison
- Check `@tailwindcss/vite` compatibility with current Vite version and `electron-vite`
- Identify any `@layer utilities` or `@layer components` blocks that need conversion to `@utility`
- **Files:** Read-only analysis

### Task 2: Run the upgrade tool
- Commit all current work (clean working tree required)
- Run `npx @tailwindcss/upgrade`
- Review all automated changes before proceeding
- **Files:** Many — the tool modifies templates, config, and CSS files

### Task 3: Migrate build configuration
- Delete `postcss.config.js`
- Update `electron.vite.config.ts`:
  - Replace `tailwindcss`/`autoprefixer` imports with `@tailwindcss/vite`
  - Add `tailwindcss()` as renderer Vite plugin
  - Remove `css.postcss` block from renderer config
- **Files:** `postcss.config.js`, `electron.vite.config.ts`

### Task 4: Migrate CSS and plugins
- Update `globals.css`:
  - Replace `@tailwind base/components/utilities` with `@import "tailwindcss"`
  - Add `@custom-variant dark (&:where(.dark, .dark *));`
  - Migrate `tailwind.config.js` theme → `@theme { }` block
  - Add `@plugin "@tailwindcss/typography"`
  - Add `@import "tw-animate-css"` (replacing tailwindcss-animate)
- Verify `@source` directive for streamdown is picked up correctly in v4
- **Files:** `src/renderer/styles/globals.css`, `tailwind.config.js`

### Task 5: Fix agents-styles.css internal variables
- Rewrite lines 219-226 that reference `--tw-ring-offset-shadow`, `--tw-ring-shadow`, etc.
- Use v4's ring utilities or verified v4 internal variable names
- Test ring styling visually
- **Files:** `src/renderer/styles/agents-styles.css`

### Task 6: Update dependencies
- Install: `@tailwindcss/vite` (or `@tailwindcss/postcss`), `tw-animate-css`, `tailwindcss@^4.2.2`
- Remove: `autoprefixer`, `@tailwindcss/container-queries`, `tailwindcss-animate`
- Update: `tailwind-merge@^3.5.0`, `@tailwindcss/typography` (v4-compatible)
- **Files:** `package.json`, `bun.lock`

### Task 7: Run quality gates
- `bun run ts:check` — verify no new TS errors from dependency changes
- `bun run build` — verify esbuild packaging succeeds
- `bun test` — verify all regression guards pass
- `bun audit` — check for new advisories
- `cd docs && bun run build` — verify docs site build

### Task 8: Visual regression testing
- Inspect default border styling (bare `border` class should still look correct)
- Inspect ring styling on focus states
- Inspect shadow/rounded scale shifts (visual appearance should be preserved by rename)
- Inspect placeholder color changes
- Inspect button cursor behavior
- Verify dark mode toggle works correctly
- Verify `space-y-*` containers with hidden children

### Task 9: Update documentation and pins
- Update `docs/conventions/pinned-deps.md` — remove Tailwind 3.x pin (no longer needed)
- Update `docs/architecture/tech-stack.md` — Tailwind version
- Update `openspec/config.yaml` — Tailwind version in context block
