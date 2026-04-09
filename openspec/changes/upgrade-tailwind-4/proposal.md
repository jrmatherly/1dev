## Why

Tailwind CSS v4 is a complete engine rewrite in Rust (Oxide) with 2-5x faster builds. More importantly, it introduces a **CSS-first configuration model** that replaces `tailwind.config.js`, new `@theme` and `@import "tailwindcss"` directives, and removes/renames many utilities. The tailwind-merge package v3 **drops Tailwind v3 support entirely**, so both must upgrade together.

The migration is **the highest-touch upgrade** in this batch (~1,300+ class occurrences across 174 files need renaming), but an official upgrade tool (`npx @tailwindcss/upgrade`) handles ~80% automatically. The remaining 20% is manual: build config, plugin replacements, internal CSS variable references, and visual QA.

## What Changes

**Core version bumps:**
- **tailwindcss 3.4.19 → 4.2.2** — Rust engine, CSS-first config, utility renames
- **tailwind-merge 2.6.1 → 3.5.0** — drops TW3, adds TW4 support (must upgrade together)

**Build tooling migration:**
- **DELETE `postcss.config.js`** — no longer needed
- **DELETE `autoprefixer` dependency** — Tailwind v4 handles vendor prefixing
- **Replace PostCSS plugin with Vite plugin** in `electron.vite.config.ts`:
  - Remove: `import tailwindcss from "tailwindcss"` and `import autoprefixer from "autoprefixer"`
  - Add: `import tailwindcss from "@tailwindcss/vite"` as a renderer Vite plugin
  - Remove: entire `css.postcss` block from renderer config
- **Note:** If this change lands before the Vite 8 upgrade, `@tailwindcss/vite` must be compatible with Vite 6.x. If compatibility is an issue, use `@tailwindcss/postcss` as the PostCSS plugin instead.

**CSS directive migration (`globals.css`):**
- Replace `@tailwind base; @tailwind components; @tailwind utilities;` with `@import "tailwindcss"`
- Add `@custom-variant dark (&:where(.dark, .dark *));` to replace `darkMode: "class"` in JS config
- Migrate `tailwind.config.js` theme to `@theme { }` block (colors, breakpoints, borderRadius)
- Replace `tailwindcss-animate` with `tw-animate-css` (`@import "tw-animate-css"`)
- Add `@plugin "@tailwindcss/typography"` (CSS-based plugin loading)
- Remove `@tailwindcss/container-queries` reference (now built-in to TW4)

**Utility class renames (handled by upgrade tool):**
- `flex-shrink-0` → `shrink-0` (~334 occurrences across 83 files)
- `outline-none` → `outline-hidden` (78 occurrences across 48 files)
- Scale shifts: `shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm`, `rounded-sm` → `rounded-xs`, `rounded` → `rounded-sm` (~874 total across 174 files)
- `backdrop-blur-sm` → `backdrop-blur-xs` (7 occurrences across 4 files)

**Default value changes (visual regression potential):**
- Default border color: `gray-200` → `currentColor`
- Default ring width: `3px` → `1px`
- Default ring color: `blue-500` → `currentColor`
- Placeholder color: `gray-400` → current text color at 50% opacity
- Button cursor: `cursor: pointer` → `cursor: default`

**Internal CSS variable breakage:**
- `agents-styles.css` lines 219-226 directly reference `--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-ring-inset`, etc. These Tailwind internals may change in v4 — **must be rewritten** to use v4's ring utilities or verified against v4's actual internal variable names.

**Behavioral changes (not renamed, need manual QA):**
- `space-y-*` / `space-x-*` selector changed from `:not([hidden]) ~ :not([hidden])` to `:not(:last-child)` — affects hidden elements within spacing containers
- `hover:` variant now wrapped in `@media (hover: hover)` — desirable for Electron (desktop)
- Variant stacking order: right-to-left → left-to-right

**Package changes:**
- **Install:** `@tailwindcss/vite` (or `@tailwindcss/postcss`), `tw-animate-css`
- **Remove:** `tailwindcss` (old), `autoprefixer`, `@tailwindcss/container-queries`, `tailwindcss-animate`
- **Update:** `tailwind-merge` (2→3), `@tailwindcss/typography` (v4-compatible version)

## Capabilities

### New Capabilities
None — styling infrastructure upgrade only.

### Modified Capabilities
None — visual appearance should be preserved after migration.

## Impact

**Affected code:**
- `tailwind.config.js` — DELETE or convert to CSS-first via `@config` bridge
- `postcss.config.js` — DELETE
- `electron.vite.config.ts` — replace PostCSS config with `@tailwindcss/vite` plugin
- `src/renderer/styles/globals.css` — full directive migration
- `src/renderer/styles/agents-styles.css` — fix internal CSS variable references
- ~174 `.tsx`/`.ts` files — utility class renames (automated by upgrade tool)
- `src/renderer/lib/utils.ts` — no changes (cn() API unchanged in twMerge v3)
- `package.json` — dependency adds/removes/updates

**Risk surface:**
- **High risk:** `agents-styles.css` internal `--tw-ring-*` variable references
- **High risk:** Scale shift visual regression (shadow, rounded, blur renames)
- **Medium risk:** `space-y-*` selector behavioral change
- **Medium risk:** Default border/ring color changes
- **Medium risk:** `@tailwindcss/vite` compatibility with `electron-vite`
- **Low risk:** `tailwind-merge` v3 (simple twMerge() usage, no custom config)
- **Low risk:** `@tailwindcss/typography` v4 compatibility

**No changes to:**
- tRPC routers, database schema, Drizzle migrations
- Electron version, TypeScript version
- Main/preload process code (Tailwind is renderer-only)
- Upstream feature catalog (F1-F10)
