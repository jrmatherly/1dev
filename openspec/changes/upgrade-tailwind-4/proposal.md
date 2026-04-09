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
- **Note:** If this change lands after Vite 7 (Phase A) but before Vite 8 (Phase B), `@tailwindcss/vite` must be compatible with Vite 7.x. If it lands before any Vite upgrade, Vite 6.x compatibility is needed. If either is incompatible with electron-vite's plugin system, fall back to `@tailwindcss/postcss`. **A spike task is required** to validate `@tailwindcss/vite` + electron-vite before committing to Option A vs Option B.

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
- `agents-styles.css` lines 219-234 directly reference `--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-ring-inset`, `--tw-ring-color` (including dark mode override at line 234). These Tailwind internals may change in v4 — **must be rewritten** to use v4's ring utilities or verified against v4's actual internal variable names.

**Escaped Tailwind class selectors (MISSED IN INITIAL ANALYSIS):**
- `agents-styles.css` lines 191-195 contain hardcoded escaped selectors matching Tailwind-generated class names: `.hover\:bg-foreground\/5:hover`, `.hover\:text-foreground:hover`, `.hover\:bg-primary\/15:hover`, etc. If TW4 changes generated class name format (especially arbitrary opacity syntax), these selectors will silently stop matching. TW4's native `@media (hover: hover)` wrapping may make this override pattern unnecessary.

**Custom `borderRadius` theme interaction with scale shift:**
- The project has custom `borderRadius` values: `lg: var(--radius)`, `md: calc(var(--radius) - 2px)`, `sm: calc(var(--radius) - 4px)`. The TW4 scale shift (`rounded-sm` → `rounded-xs`, `rounded` → `rounded-sm`) assumes default values. The interaction between custom theme values and the scale-shift renames must be tested — bare `rounded` (30+ occurrences across 20+ files) and `rounded-sm` (28 occurrences across 21 files) are heavily used.

**`ring-offset-background` custom utility (12 occurrences across 11 files):**
- Used on tabs, switches, badges, dialogs. Relies on custom `background` color being valid for `ring-offset` in the `@theme` block.

**Behavioral changes (not renamed, need manual QA):**
- `space-y-*` / `space-x-*` selector changed from `:not([hidden]) ~ :not([hidden])` to `:not(:last-child)` — affects hidden elements within spacing containers. Note: `agents-styles.css` lines 259-346 use `.space-y-4` as a CSS *selector* (targeting Streamdown-generated wrappers), not for spacing behavior — verify class name format is unchanged.
- `hover:` variant now wrapped in `@media (hover: hover)` — desirable for Electron (desktop). This may make the escaped hover selectors in `agents-styles.css:191-195` unnecessary.
- Variant stacking order: right-to-left → left-to-right (0 compound variant stacking patterns found in codebase)
- Button default cursor: `pointer` → `default`. 119 explicit `cursor-pointer` occurrences across 74 files are fine, but buttons WITHOUT explicit `cursor-pointer` will regress. Consider adding `@layer base { button { cursor: pointer; } }` to preserve behavior.

**Package changes:**
- **Install:** `@tailwindcss/vite` (or `@tailwindcss/postcss`), `tw-animate-css`, `tailwindcss@^4.2.2`
- **Remove:** `autoprefixer`, `@tailwindcss/container-queries`, `tailwindcss-animate`, possibly `postcss` (if using `@tailwindcss/vite`)
- **Update:** `tailwind-merge` (2→3), `@tailwindcss/typography` (v4-compatible version)
- **Note:** `postcss.config.js` is currently UNUSED — the active PostCSS config is inline in `electron.vite.config.ts:69-73`. Deleting `postcss.config.js` is a cleanup, not a functional change.
- **Note:** Verify `tw-animate-css` provides identical class names to `tailwindcss-animate` for: `animate-in`, `animate-out`, `fade-in-0`, `fade-out-0`, `slide-in-from-*`, `zoom-in-*`, `zoom-out-*` (27 occurrences across 15 files).

**Ordering constraint:** This change assumes `noUncheckedSideEffectImports: false` is set in tsconfig.json (done by the TypeScript 6 upgrade). If Tailwind 4 is executed before TypeScript 6, this is not yet relevant but should be set proactively.

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
