## Design

### Approach

Migrate from Tailwind CSS v3 (PostCSS plugin + JS config) to v4 (Rust engine + CSS-first config). Use the official upgrade tool (`npx @tailwindcss/upgrade`) for automated class renames (~80% of work), then manual fixes for build config, plugin replacements, and internal CSS variable references (~20%).

### Architecture Impact

**Renderer-only.** Tailwind CSS is used exclusively in the renderer process. No main process or preload code changes. The build tooling migration (PostCSS → Vite plugin) affects `electron.vite.config.ts` renderer section only.

### Build Tooling Migration

**Current pipeline:**
```
globals.css → PostCSS (tailwindcss + autoprefixer) → bundled CSS
```

**Target pipeline (option A — Vite plugin, preferred):**
```
globals.css → @tailwindcss/vite plugin → bundled CSS
```

**Target pipeline (option B — PostCSS fallback):**
```
globals.css → @tailwindcss/postcss → bundled CSS
```

Option A is preferred for performance. Option B exists as fallback if `@tailwindcss/vite` doesn't integrate cleanly with `electron-vite`'s plugin system.

### CSS Configuration Migration

The `tailwind.config.js` moves into CSS directives within `globals.css`:

| JS Config | CSS-First |
|-----------|-----------|
| `content: [...]` | Automatic detection (no config needed) |
| `darkMode: "class"` | `@custom-variant dark (&:where(.dark, .dark *));` |
| `theme.extend.colors` | `@theme { --color-*: hsl(var(--*)); }` |
| `theme.extend.screens` | `@theme { --breakpoint-*: *px; }` |
| `theme.extend.borderRadius` | `@theme { --radius-*: ...; }` |
| `plugins: [require("...")]` | `@plugin "..."` or `@import "..."` |

### Plugin Migration

| Current | Target | Action |
|---------|--------|--------|
| `@tailwindcss/typography` | `@tailwindcss/typography` (v4-compatible) | `@plugin "@tailwindcss/typography"` in CSS |
| `tailwindcss-animate` | `tw-animate-css` | `@import "tw-animate-css"` in CSS |
| `@tailwindcss/container-queries` | Built-in to TW4 | Remove entirely |
| `autoprefixer` | Built-in to TW4 | Remove entirely |

### Critical Risk: agents-styles.css Internal Variables

Lines 219-226 of `agents-styles.css` directly reference Tailwind internal CSS variables:
- `--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-ring-inset`
- `--tw-ring-offset-width`, `--tw-ring-offset-color`
- `--tw-ring-color`, `--tw-ring-opacity`

These must be rewritten to either:
1. Use v4's ring utility classes directly
2. Use v4's verified internal variable names (if unchanged)
3. Replace with standard CSS box-shadow equivalents

### Visual Regression Risk

Scale shifts (`shadow-xs`→`shadow-2xs`, etc.) are handled by the upgrade tool — it renames classes to preserve visual appearance. But default value changes (border color, ring width/color, placeholder color, button cursor) will cause subtle visual differences that need manual QA.

### Verification Strategy

1. Automated: `npx @tailwindcss/upgrade` handles class renames
2. Build: `bun run build` with new Vite/PostCSS plugin
3. Visual QA: borders, rings, shadows, dark mode, focus states
4. Behavioral QA: `space-y-*` containers with hidden children
5. Regression guards: `bun test` for any CSS-referencing tests
