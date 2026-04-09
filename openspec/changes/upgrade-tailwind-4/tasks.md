## 0. Spike — validate @tailwindcss/vite + electron-vite compatibility

- [ ] 0.1 Install `@tailwindcss/vite` as a devDependency
- [ ] 0.2 Add `tailwindcss()` to the renderer `plugins` array in `electron.vite.config.ts`
- [ ] 0.3 Run `bun run build` and `bun run dev` — verify CSS processing works
- [ ] 0.4 If incompatible, fall back to `@tailwindcss/postcss` approach
- [ ] 0.5 Decision gate: Option A (Vite plugin) or Option B (PostCSS) must be resolved before proceeding

## 1. Pre-flight audit

- [ ] 1.1 Catalog all `--tw-ring-*` internal variable references in `agents-styles.css` (lines 219-234)
- [ ] 1.2 Catalog escaped Tailwind class selectors in `agents-styles.css` (lines 191-195)
- [ ] 1.3 Count bare `shadow` (3 files), `shadow-sm` (16 files), bare `rounded` (30+ files), `rounded-sm` (28 files) — track for scale-shift verification
- [ ] 1.4 Count `flex-shrink-*` (340/83 files), `outline-none` (78/48 files), `backdrop-blur-sm` (7/4 files)
- [ ] 1.5 Count buttons WITHOUT explicit `cursor-pointer` — assess need for base cursor override
- [ ] 1.6 Verify `tw-animate-css` provides same class names as `tailwindcss-animate` (27 occurrences across 15 files)
- [ ] 1.7 Verify `ring-offset-background` custom utility (12 occurrences across 11 files) works with `@theme` color registration
- [ ] 1.8 Analyze custom `borderRadius` theme interaction with TW4 scale-shift renames
- [ ] 1.9 Identify `@layer utilities` / `@layer components` blocks that need conversion to `@utility`
- [ ] 1.10 Verify `@container` usage in file-viewer components (3 files) works with TW4 built-in

## 2. Run the upgrade tool

- [ ] 2.1 Commit all current work (clean working tree required)
- [ ] 2.2 Run `npx @tailwindcss/upgrade`
- [ ] 2.3 Review all automated changes before proceeding

## 3. Migrate build configuration

- [ ] 3.1 Delete `postcss.config.js`
- [ ] 3.2 Replace `tailwindcss`/`autoprefixer` imports with `@tailwindcss/vite` in `electron.vite.config.ts`
- [ ] 3.3 Add `tailwindcss()` as renderer Vite plugin
- [ ] 3.4 Remove `css.postcss` block from renderer config

## 4. Migrate CSS and plugins

- [ ] 4.1 Replace `@tailwind base/components/utilities` with `@import "tailwindcss"` in `globals.css`
- [ ] 4.2 Add `@custom-variant dark (&:where(.dark, .dark *));`
- [ ] 4.3 Migrate `tailwind.config.js` theme → `@theme { }` block
- [ ] 4.4 Add `@plugin "@tailwindcss/typography"`
- [ ] 4.5 Add `@import "tw-animate-css"` (replacing tailwindcss-animate)
- [ ] 4.6 Verify `@source` directive for streamdown is picked up correctly in v4

## 5. Fix agents-styles.css internal variables and escaped selectors

- [ ] 5.1 Rewrite lines 219-234 that reference `--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-ring-color`
- [ ] 5.2 Use v4's ring utilities or verified v4 internal variable names
- [ ] 5.3 Evaluate escaped hover selectors at lines 191-195 — verify against TW4's native `@media (hover: hover)` wrapping
- [ ] 5.4 Verify `.space-y-4` selectors at lines 259-346 still match TW4 class names
- [ ] 5.5 Test ring styling and hover overrides visually

## 6. Update dependencies

- [ ] 6.1 Install: `@tailwindcss/vite` (or `@tailwindcss/postcss`), `tw-animate-css`, `tailwindcss@^4.2.2`
- [ ] 6.2 Remove: `autoprefixer`, `@tailwindcss/container-queries`, `tailwindcss-animate`
- [ ] 6.3 Update: `tailwind-merge@^3.5.0`, `@tailwindcss/typography` (v4-compatible)

## 7. Run quality gates

- [ ] 7.1 Run `bun run ts:check` — verify no new TS errors from dependency changes
- [ ] 7.2 Run `bun run build` — verify esbuild packaging succeeds
- [ ] 7.3 Run `bun test` — verify all regression guards pass
- [ ] 7.4 Run `bun audit` — check for new advisories
- [ ] 7.5 Run `cd docs && bun run build` — verify docs site build

## 8. Visual regression testing

- [ ] 8.1 Inspect default border styling — verify `@apply border-border` works in `@layer base`
- [ ] 8.2 Inspect ring styling on focus states (especially `ring-offset-background` 12 occurrences)
- [ ] 8.3 Inspect shadow/rounded scale shifts — verify all renamed correctly
- [ ] 8.4 Inspect placeholder color changes
- [ ] 8.5 Inspect button cursor behavior — add base cursor override if regressed
- [ ] 8.6 Verify dark mode toggle works correctly
- [ ] 8.7 Verify `space-y-*` containers with hidden children
- [ ] 8.8 Verify `@container` responsive behavior in file-viewer sidebar, markdown viewer, image viewer
- [ ] 8.9 Verify animation classes (dialog, tooltip, select, hover-card transitions)
- [ ] 8.10 Verify WDYR plugin ordering still works after Tailwind plugin addition

## 9. Update documentation and pins

- [ ] 9.1 Update `docs/conventions/pinned-deps.md` — remove Tailwind 3.x pin (no longer needed)
- [ ] 9.2 Update `docs/architecture/tech-stack.md` — Tailwind version
- [ ] 9.3 Update `openspec/config.yaml` context block — Tailwind version
