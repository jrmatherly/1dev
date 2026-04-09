## Tasks

### Task 0: Spike — validate @tailwindcss/vite + electron-vite compatibility
- Install `@tailwindcss/vite` as a devDependency
- Add `tailwindcss()` to the renderer `plugins` array in `electron.vite.config.ts`
- Run `bun run build` and `bun run dev` — verify CSS processing works
- If incompatible, fall back to `@tailwindcss/postcss` approach
- **Decision gate:** Option A (Vite plugin) or Option B (PostCSS) must be resolved before proceeding
- **Files:** `electron.vite.config.ts` (test only, revert if needed)

### Task 1: Pre-flight audit
- Catalog all `--tw-ring-*` internal variable references in `agents-styles.css` (lines 219-234, including dark mode)
- Catalog escaped Tailwind class selectors in `agents-styles.css` (lines 191-195) — `.hover\:bg-foreground\/5:hover` etc.
- Count bare `shadow` (3 files), `shadow-sm` (16/12 files), bare `rounded` (30+/20+ files), `rounded-sm` (28/21 files) — track separately for scale-shift verification
- Count `flex-shrink-*` (340/83 files), `outline-none` (78/48 files), `backdrop-blur-sm` (7/4 files)
- Count buttons WITHOUT explicit `cursor-pointer` — assess need for base cursor override
- Verify `tw-animate-css` provides same class names as `tailwindcss-animate` (27 occurrences across 15 files)
- Verify `ring-offset-background` custom utility (12 occurrences across 11 files) works with `@theme` color registration
- Analyze custom `borderRadius` theme interaction with TW4 scale-shift renames
- Identify `@layer utilities` / `@layer components` blocks that need conversion to `@utility`
- Verify `@container` usage in file-viewer components (3 files) works with TW4 built-in
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

### Task 5: Fix agents-styles.css internal variables and escaped selectors
- Rewrite lines 219-234 that reference `--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-ring-color` (including dark mode override at line 234)
- Use v4's ring utilities or verified v4 internal variable names
- Evaluate escaped hover selectors at lines 191-195 — TW4's native `@media (hover: hover)` wrapping may make these unnecessary. If still needed, verify class name format matches TW4 output.
- Verify `.space-y-4` selectors at lines 259-346 (used as CSS selectors for Streamdown wrappers) still match TW4 class names
- Test ring styling and hover overrides visually
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
- Inspect default border styling — `@apply border-border` in `@layer base` mitigates default color change, but verify `@apply` within `@layer base` works in TW4
- Inspect ring styling on focus states — especially `ring-offset-background` (12 occurrences)
- Inspect shadow/rounded scale shifts — verify bare `shadow` (3 files), `shadow-sm` (16 files), bare `rounded` (30+ files), `rounded-sm` (28 files) all renamed correctly
- Inspect placeholder color changes
- Inspect button cursor behavior — if buttons without `cursor-pointer` regressed, add base cursor override
- Verify dark mode toggle works correctly
- Verify `space-y-*` containers with hidden children
- Verify `@container` responsive behavior in file-viewer sidebar, markdown viewer, image viewer (3 files)
- Verify animation classes (dialog, tooltip, select, hover-card transitions)
- Verify WDYR plugin ordering still works after Tailwind plugin addition to renderer plugins array

### Task 9: Update documentation and pins
- Update `docs/conventions/pinned-deps.md` — remove Tailwind 3.x pin (no longer needed)
- Update `docs/architecture/tech-stack.md` — Tailwind version
- Update `openspec/config.yaml` — Tailwind version in context block
