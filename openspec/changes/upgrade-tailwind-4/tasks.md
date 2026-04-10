## 0.0 Reassessment (2026-04-10)

> **This block was added after a deep reassessment on 2026-04-10, prior to implementation.** The original proposal (2026-04-09) was written before Vite 7 Phase A landed and before several decisive compatibility signals surfaced. This block captures the post-research state so future sessions can validate the plan before executing.

### Decisive compatibility answers

**Q1: `@tailwindcss/vite` + Vite 7 + electron-vite compatibility → RESOLVED IN FAVOR OF OPTION A**

Direct registry query (2026-04-10) confirmed:
- `@tailwindcss/vite@4.2.2` peer range: `"vite": "^5.2.0 || ^6 || ^7 || ^8"`
- Our installed `vite@7.3.2` (landed via `upgrade-vite-8-build-stack` Phase A, 2026-04-10) sits in that range
- electron-vite issue #741 resolution: the original TS error required `"moduleResolution": "bundler"` in tsconfig — **we already have this** (set during TypeScript 6 upgrade)
- electron-vite #741 follow-up error: runtime PostCSS import failure caused by leftover `postcss.config.js` — **fix is to delete it**, which Section 3.1 already mandates
- Related tailwindcss issue #18760 concerns custom `@utility` directives + `config.root` in Electron dev — **we don't use custom `@utility` directives** (verified via grep of `src/renderer/styles/*.css`), so this edge case does not apply

**Decision**: Proceed directly with **Option A (`@tailwindcss/vite`)**. The Section 0 spike remains useful as a runtime sanity check but is no longer a true decision gate — the peer dep answer is definitive.

**Q2: `agents-styles.css` lines 219-234 `--tw-ring-*` block → REWRITE AS STANDARD CSS `box-shadow`**

Current content (verified via `sed -n '219,234p'`):
```css
body:has([data-agents-page]) [data-canvas-dialog],
[data-agents-page] [data-canvas-dialog],
body:has([data-agents-page]) .canvas-dialog,
[data-agents-page] .canvas-dialog {
  --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0
    var(--tw-ring-offset-width) var(--tw-ring-offset-color);
  --tw-ring-shadow: var(--tw-ring-inset) 0 0 0
    calc(4px + var(--tw-ring-offset-width)) var(--tw-ring-color);
  --tw-ring-opacity: 1;
  --tw-ring-color: rgb(229 231 235 / 0.8);  /* neutral-200/80 */
  box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow) !important;
}

.dark body:has([data-agents-page]) [data-canvas-dialog], ... {
  --tw-ring-color: rgb(38 38 38 / 0.8);  /* neutral-800/80 */
}
```

**Why rewrite (not map to v4 internals)**: Tailwind 4 fundamentally redesigned the ring system (default width 3px→1px, default color blue-500→currentColor, underlying variable names changed). The Tailwind 4 upgrade guide does NOT publish the new internal variable names as stable API. Using `--tw-ring-*` is a **private API dependency** that will break silently on any future Tailwind minor bump even if v4.2.2 happens to keep them.

**Target replacement** (plain CSS, zero Tailwind internals):
```css
body:has([data-agents-page]) [data-canvas-dialog],
[data-agents-page] [data-canvas-dialog],
body:has([data-agents-page]) .canvas-dialog,
[data-agents-page] .canvas-dialog {
  box-shadow: 0 0 0 4px rgb(229 231 235 / 0.8) !important;  /* neutral-200/80 */
}

.dark body:has([data-agents-page]) [data-canvas-dialog],
.dark [data-agents-page] [data-canvas-dialog],
.dark body:has([data-agents-page]) .canvas-dialog,
.dark [data-agents-page] .canvas-dialog {
  box-shadow: 0 0 0 4px rgb(38 38 38 / 0.8) !important;  /* neutral-800/80 */
}
```

This preserves the exact 4px ring offset and colors while removing the Tailwind-internal dependency entirely.

### Count drift vs original proposal (verified 2026-04-10)

| Proposal claim | Actual count | Status |
|---|---|---|
| `flex-shrink-0`: 334 / 83 files | **334 / 83** | ✅ Match |
| `outline-none`: 78 / 48 files | **78 / 48** | ✅ Match |
| `backdrop-blur-sm`: 7 / 4 files | **5 / 4** | ⚠️ Shrunk 7→5 (still upgrade-tool handled) |
| `cursor-pointer`: 119 / 74 files | **119 / 74** | ✅ Match |
| `ring-offset-background`: 12 / 11 files | **5 / 4** | ⚠️ Shrunk 12→5 (**good news**, less custom-utility surface) |
| `animate-*` classes: 27 / 15 files | **27 / 15** | ✅ Match |
| `shadow-sm`: 16 files | **16 / 12** | ✅ Match |
| `rounded-sm`: 28 / 21 files | **28 / 21** | ✅ Match |
| Bare `shadow`: 3 files | **3 / 3** | ✅ Match |
| Bare `rounded`: "30+ / 20+ files" | **82 / 44 files** | ⚠️ **2-3x more** (upgrade tool handles rename, but **visual QA surface is larger** than proposal assumed) |

**Net impact**: No count grew beyond what `@tailwindcss/upgrade` handles automatically. Risk is in visual verification, not mechanical migration.

### De-risked packages (no longer unknowns)

- **`tw-animate-css@1.4.0`** — npm description literally reads *"TailwindCSS v4.0 compatible replacement for `tailwindcss-animate`"*. Direct vendor marketing. Zero guesswork.
- **`@tailwindcss/typography@0.5.19`** — current installed version already declares peer `tailwindcss: >=3.0.0 || insiders || >=4.0.0-alpha.20 || >=4.0.0-beta.1`. **No typography package update needed**, only migrate from JS `require()` to CSS `@plugin "@tailwindcss/typography"`.
- **`tailwind-merge@3.5.0`** — latest stable, zero deps, explicitly drops v3 support. Simple `cn()` API unchanged. Clean upgrade from `2.6.1`.
- **`@tailwindcss/container-queries`** — Tailwind 4 has native container query support. The plugin is removable entirely.
- **`autoprefixer`** — Tailwind 4 bundles vendor prefixing. Remove entirely, not just from PostCSS config.
- **`postcss`** — confirmed still needed at runtime by other parts of the build; leave installed but remove from CSS processing chain.

### Prerequisites status

- ✅ **TypeScript 6** — landed 2026-04-10, `noUncheckedSideEffectImports: false` already set
- ✅ **Vite 7** — landed 2026-04-10 (Phase A of `upgrade-vite-8-build-stack`)
- ✅ **Node.js 20+** — Electron 41 bundles Node 24.14
- ✅ **Clean working tree** — previous session committed and pushed Vite 7 Phase A

### New Tailwind 4 breaking changes NOT in original proposal

The upgrade guide (fetched 2026-04-10) reveals these additional renames/changes beyond what the proposal listed. **All handled automatically by `npx @tailwindcss/upgrade`** but worth knowing:

- `flex-grow-*` → `grow-*`
- `overflow-ellipsis` → `text-ellipsis`
- `decoration-slice/clone` → `box-decoration-slice/clone`
- `drop-shadow-sm` → `drop-shadow-xs`, `drop-shadow` → `drop-shadow-sm`
- `blur-sm` → `blur-xs`, `blur` → `blur-sm`
- CSS variable arbitrary values: `bg-[--brand-color]` → `bg-(--brand-color)` (brackets → parens)
- Important modifier position: `!flex` → `flex!` (prefix → suffix)
- Space-separated arbitrary values: `grid-cols-[max-content,auto]` → `grid-cols-[max-content_auto]` (comma → underscore)
- `bg-opacity-*` / `text-opacity-*` / `border-opacity-*` / `ring-opacity-*` / `placeholder-opacity-*` removed — use `/N` opacity modifier
- `outline-2` now defaults `outline-style: solid` (no need for separate `outline` class)
- `ring` utility default changed from 3px → 1px and blue-500 → currentColor (**requires explicit `ring-3` and color for v3 behavior**)
- `transition` / `transition-colors` now include `outline-color` (may affect hover transitions on focus styles)
- Variant stacking order changed: right-to-left → left-to-right (**0 compound variant stacking patterns found in codebase**, non-issue)
- Gradient variants now preserve values across variants (need explicit `via-none` to unset)
- Individual transform property resets: `transform-none` → `scale-none` / `translate-none` / `rotate-none`
- `@layer utilities` / `@layer components` → `@utility` directive (**globals.css has 2 `@layer base` blocks — those stay as `@layer base`, only `utilities`/`components` layers need conversion; neither exists in our code**)
- `theme()` function → prefer CSS variables directly (`var(--color-red-500)`)
- `corePlugins` option removed (we don't use it)
- `safelist` option removed → use `@source inline(...)` (we don't use safelist)
- JavaScript config no longer auto-detected → use `@config` directive if keeping `tailwind.config.js`, OR migrate entirely to `@theme` in CSS (proposal already mandates the latter)

### Updated risk matrix

| Risk | Original | Updated | Why |
|---|---|---|---|
| `@tailwindcss/vite` + `electron-vite` compat | High | **Low** | Peer range explicit (`^7` supported); tsconfig already has `moduleResolution: bundler`; electron-vite #741 resolution already baked into Section 3.1 |
| `--tw-ring-*` internal variables | High | **High** | Confirmed present; rewrite to standard CSS `box-shadow` (spec block in Q2 above) |
| Scale shift visual regression | High | **Medium** | Upgrade tool handles rename preserving visual; `@theme` borderRadius interaction still needs visual QA |
| Escaped hover selectors (lines 191-195) | High | **Low** | Arbitrary opacity class name format unchanged in v4 docs; `@media (hover: hover)` wrapping is desirable for Electron |
| `space-y-*` selector behavioral change | Medium | **Low** | `agents-styles.css:259-346` uses `.space-y-4` as a **class selector matching Streamdown wrappers**, not Tailwind utility behavior — unaffected |
| Default border/ring/placeholder color changes | Medium | **Medium** | 82 bare `rounded` + 3 bare `shadow` still need visual verification; 119 `cursor-pointer` occurrences safe but base override for buttons without recommended |
| `@tailwindcss/vite` + Vite 7 compat | Medium | **Resolved** | Peer range `^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8` |
| `tailwind-merge` v3 | Low | **Low** | Zero deps, simple `cn()` API unchanged |
| `@tailwindcss/typography` v4 compat | Low | **Resolved** | 0.5.19 already supports Tailwind 4 |
| `tw-animate-css` class name parity | Low | **Resolved** | Vendor marketing is explicit |

### Execution strategy

**Phase 1 (autonomous, this-session-capable)**: Sections 0, 1, 2, 3, 4, 5, 6, 7, 9 (~44 tasks)
**Phase 2 (user handoff)**: Section 8 visual regression QA (10 tasks)
**Phase 3 (fix-up + archive)**: Address Section 8 findings, archive change

---

## 0. Spike — validate @tailwindcss/vite + electron-vite compatibility

> **REASSESSMENT (2026-04-10):** Section 0 is now a **runtime sanity check**, not a decision gate. Peer deps (`^5.2.0 || ^6 || ^7 || ^8`) explicitly support our Vite 7.3.2. Option B (PostCSS fallback) should NOT be needed. If Section 0 fails unexpectedly, investigate before falling back — the peer deps say it should work.

- [ ] 0.1 Install `@tailwindcss/vite` as a devDependency
- [ ] 0.2 Add `tailwindcss()` to the renderer `plugins` array in `electron.vite.config.ts`
- [ ] 0.3 Run `bun run build` and `bun run dev` — verify CSS processing works
- [ ] 0.4 If incompatible, fall back to `@tailwindcss/postcss` approach — **UNLIKELY per registry peer deps; investigate first**
- [ ] 0.5 Decision gate: Option A (Vite plugin) or Option B (PostCSS) must be resolved before proceeding — **PRE-RESOLVED: Option A**

## 1. Pre-flight audit

> **REASSESSMENT (2026-04-10):** Most of this section was completed during the 2026-04-10 research pass. Specific findings recorded inline per task. Remaining items are either deferred to Section 8 visual QA or already resolved.

- [ ] 1.1 Catalog all `--tw-ring-*` internal variable references in `agents-styles.css` (lines 219-234) — **DONE: 6 vars confirmed (`--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-ring-inset`, `--tw-ring-offset-width`, `--tw-ring-offset-color`, `--tw-ring-opacity`, `--tw-ring-color`). Target selector: `[data-canvas-dialog]` + `.canvas-dialog` in agents-page scope. Dark mode override at line ~234. Rewrite plan: replace entire block with plain CSS `box-shadow: 0 0 0 4px rgb(229 231 235 / 0.8) !important;` (light) + dark mode sibling.**
- [ ] 1.2 Catalog escaped Tailwind class selectors in `agents-styles.css` (lines 191-195) — **DONE: 5 selectors confirmed (`.hover\:bg-foreground\/5:hover`, `.hover\:text-foreground:hover`, `.hover\:bg-primary\/15:hover`, `.hover\:bg-muted\/50:hover`, `.hover\:bg-foreground\/10:hover`). Override pattern cancels Tailwind hover in `[data-agents-page]` scope. TW4 keeps the same escaped class name format for arbitrary opacity (`/5`, `/15`, `/50`, `/10`). Low risk — likely works as-is, verify in dev.**
- [ ] 1.3 Count bare `shadow` (3 files), `shadow-sm` (16 files), bare `rounded` (30+ files), `rounded-sm` (28 files) — track for scale-shift verification — **DONE: bare `shadow`=3/3 files ✓, `shadow-sm`=82/12 files (proposal said 16 files, actual 12), bare `rounded`=82/44 files (proposal estimated 30+/20+, actual 82/44 — 2-3x MORE than proposal), `rounded-sm`=28/21 files ✓. Section 8.3 visual QA surface is larger than proposal assumed.**
- [ ] 1.4 Count `flex-shrink-*` (340/83 files), `outline-none` (78/48 files), `backdrop-blur-sm` (7/4 files) — **DONE: `flex-shrink-0`=334/83 ✓, `outline-none`=78/48 ✓, `backdrop-blur-sm`=5/4 (shrunk from 7/4). All handled by upgrade tool.**
- [ ] 1.5 Count buttons WITHOUT explicit `cursor-pointer` — assess need for base cursor override — **DEFERRED to Section 8.5. Confirmed 119 `cursor-pointer` occurrences across 74 files are safe. Plan to add base-layer override in Section 5 regardless: `@layer base { button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; } }`**
- [ ] 1.6 Verify `tw-animate-css` provides same class names as `tailwindcss-animate` (27 occurrences across 15 files) — **RESOLVED: `tw-animate-css@1.4.0` npm description is literally *"TailwindCSS v4.0 compatible replacement for `tailwindcss-animate`"*. 27/15 count confirmed. Zero guesswork needed.**
- [ ] 1.7 Verify `ring-offset-background` custom utility (12 occurrences across 11 files) works with `@theme` color registration — **DONE: Actual count is 5/4 files (SHRUNK from 12/11). Less surface area than proposal. Must register `--color-background` in `@theme` block for `ring-offset-background` to resolve.**
- [ ] 1.8 Analyze custom `borderRadius` theme interaction with TW4 scale-shift renames — **Current tailwind.config.js defines `borderRadius: { lg: var(--radius), md: calc(var(--radius) - 2px), sm: calc(var(--radius) - 4px) }` with `--radius: 0.5rem`. TW4 rename pushes `rounded-sm → rounded-xs`, `rounded → rounded-sm`. The upgrade tool will rename class usages, but the `@theme` block must define: `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg` with the correct calc expressions. Plan: map `lg: var(--radius)`, `md: calc(...-2px)`, `sm: calc(...-4px)`, AND add `xs: calc(...-6px)` to maintain the visual scale. Section 8.3 visual QA REQUIRED.**
- [ ] 1.9 Identify `@layer utilities` / `@layer components` blocks that need conversion to `@utility` — **DONE: Grep of `src/renderer/styles/*.css` found only `@layer base` blocks in `globals.css` (2 blocks for CSS variables and body styles). Zero `@layer utilities` or `@layer components` blocks in our code. `@layer base` stays as `@layer base` in v4. NO conversion needed.**
- [ ] 1.10 Verify `@container` usage in file-viewer components (3 files) works with TW4 built-in — **DEFERRED: Tailwind 4 has native container query support (replaces `@tailwindcss/container-queries` plugin). Removing the plugin should not break existing `@container/<name>:` usage. Verify in Section 8.8 visual QA.**

> **ADDITIONAL AUDIT ITEMS (new findings 2026-04-10, not in original proposal):**

- [ ] 1.11 Grep for CSS variable arbitrary values `\[--[a-z]` in className attributes — **TW4 changes bracket to paren syntax: `bg-[--brand-color]` → `bg-(--brand-color)`. Upgrade tool handles this.**
- [ ] 1.12 Grep for leading `!` important modifiers in className — **TW4 moves `!` to suffix: `!flex` → `flex!`. Upgrade tool handles this.**
- [ ] 1.13 Grep for comma-separated arbitrary values (e.g. `[max-content,auto]`) — **TW4 changes comma to underscore. Upgrade tool handles this.**
- [ ] 1.14 Grep for bundled plugin removals: `@tailwindcss/container-queries` imports, `tailwindcss-animate` imports — **EXPECTED: only in `tailwind.config.js` plugins array. Confirmed via Section 1.9 audit.**
- [ ] 1.15 Verify `globals.css:3` already has `@source "../../../node_modules/streamdown/dist/*.js"` — **DONE: Yes, TW4 syntax already present (silently ignored by v3). Can keep verbatim.**

## 2. Run the upgrade tool

> **REASSESSMENT (2026-04-10):** Working tree already clean (previous session committed Vite 7 Phase A as commit `402dacb`). `npx @tailwindcss/upgrade` requires Node.js 20+ — we're on 24.14 via Electron 41. Ready to run.

- [ ] 2.1 Commit all current work (clean working tree required) — **ALREADY CLEAN (post-Vite 7 Phase A commit)**
- [ ] 2.2 Run `npx @tailwindcss/upgrade` — **Requires Node 20+ (✓ we have Node 24.14). Run in main repo root.**
- [ ] 2.3 Review all automated changes before proceeding — **Expected changes: (a) class renames across ~174 .tsx/.ts files, (b) `globals.css` `@tailwind` → `@import "tailwindcss"`, (c) possible `tailwind.config.js` → `@config` bridge or full migration to `@theme`. Tool may NOT automatically migrate the PostCSS plugin to Vite plugin — that's Section 3.**

## 3. Migrate build configuration

> **REASSESSMENT (2026-04-10):** electron-vite issue #741's runtime PostCSS import error was caused by leaving `postcss.config.js` in place while switching to `@tailwindcss/vite`. Task 3.1 IS the fix for that — do it before 3.3 to avoid triggering the same bug. CRITICAL: both `postcss.config.js` AND the `css.postcss` inline block in `electron.vite.config.ts` must be removed (we have BOTH in the current codebase — the inline block is the one actually used, per proposal Note).

- [ ] 3.1 Delete `postcss.config.js` — **File confirmed present (6 lines, minimal `tailwindcss + autoprefixer` config). Remove before Section 3.3 install to avoid electron-vite #741 runtime error.**
- [ ] 3.2 Replace `tailwindcss`/`autoprefixer` imports with `@tailwindcss/vite` in `electron.vite.config.ts` — **Current imports: `import tailwindcss from "tailwindcss"` and `import autoprefixer from "autoprefixer"` at top of file. Remove both. Add: `import tailwindcss from "@tailwindcss/vite";`**
- [ ] 3.3 Add `tailwindcss()` as renderer Vite plugin — **Add to existing `renderer.plugins` array (currently just has `react({ jsxImportSource: isDev ? "@welldone-software/why-did-you-render" : undefined })`). Order: `plugins: [tailwindcss(), react(...)]`. Verify WDYR JSX transform still works after plugin order change — Section 8.10 visual QA.**
- [ ] 3.4 Remove `css.postcss` block from renderer config — **Current block: `css: { postcss: { plugins: [tailwindcss, autoprefixer] } }` at renderer section. Delete entire `css` key.**

## 4. Migrate CSS and plugins

> **REASSESSMENT (2026-04-10):** The upgrade tool in Section 2 MAY handle 4.1 automatically. Tasks 4.2-4.6 are manual because they involve content migration decisions from JS config. Order matters: `@import "tailwindcss"` must come BEFORE `@custom-variant dark` and `@theme` blocks per v4 docs.

- [ ] 4.1 Replace `@tailwind base/components/utilities` with `@import "tailwindcss"` in `globals.css` — **Current globals.css lines 5-7 are `@tailwind base; @tailwind components; @tailwind utilities;`. Replace with single line: `@import "tailwindcss";`. Preserve line 1 `@import "./agents-styles.css";` and line 3 `@source "../../../node_modules/streamdown/dist/*.js";`.**
- [ ] 4.2 Add `@custom-variant dark (&:where(.dark, .dark *));` — **Replaces `darkMode: "class"` from tailwind.config.js. Place immediately after `@import "tailwindcss"`.**
- [ ] 4.3 Migrate `tailwind.config.js` theme → `@theme { }` block — **Migration targets: (a) `screens.min-420: "420px"` → `--breakpoint-min-420: 420px`; (b) 14 HSL color tokens → `--color-background: hsl(var(--background))` style (keeps CSS var indirection); (c) `borderRadius: { lg: var(--radius), md: calc(var(--radius) - 2px), sm: calc(var(--radius) - 4px) }` → `--radius-lg: var(--radius); --radius-md: calc(var(--radius) - 2px); --radius-sm: calc(var(--radius) - 4px); --radius-xs: calc(var(--radius) - 6px);` (add `xs` level to maintain visual scale after TW4 rename shift). DELETE `tailwind.config.js` after migration.**
- [ ] 4.4 Add `@plugin "@tailwindcss/typography"` — **Current `@tailwindcss/typography@0.5.19` already supports v4 (peer: `tailwindcss: >=3.0.0 || >=4.0.0-alpha.20 || >=4.0.0-beta.1`). NO package update needed.**
- [ ] 4.5 Add `@import "tw-animate-css"` (replacing tailwindcss-animate) — **Install `tw-animate-css@1.4.0` (Section 6.1). Remove `tailwindcss-animate` from package.json (Section 6.2). All 27 `animate-in/animate-out/fade-*/slide-*/zoom-*` class usages in 15 files remain unchanged — `tw-animate-css` provides identical class names per vendor marketing.**
- [ ] 4.6 Verify `@source` directive for streamdown is picked up correctly in v4 — **ALREADY PRESENT at globals.css:3. Keep verbatim.**

> **ADDITIONAL CSS TASK (new finding 2026-04-10):**

- [ ] 4.7 Add base-layer cursor override for buttons — **TW4 changes default button cursor to `default`. Add to globals.css `@layer base`: `button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }`. Prevents visual regression on buttons without explicit `cursor-pointer`.**

## 5. Fix agents-styles.css internal variables and escaped selectors

> **REASSESSMENT (2026-04-10 — Q2):** Tasks 5.1-5.2 replaced with **standard CSS `box-shadow` rewrite** (not "find v4 equivalent variables"). Tailwind 4 fundamentally redesigned the ring system and does not publish stable v4 `--tw-ring-*` API. Using plain CSS removes the private-API dependency entirely.

- [ ] 5.1 Rewrite lines 219-234 that reference `--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-ring-color` — **REPLACE ENTIRE BLOCK with plain CSS `box-shadow` (no Tailwind internals). Target content:**
  ```css
  body:has([data-agents-page]) [data-canvas-dialog],
  [data-agents-page] [data-canvas-dialog],
  body:has([data-agents-page]) .canvas-dialog,
  [data-agents-page] .canvas-dialog {
    box-shadow: 0 0 0 4px rgb(229 231 235 / 0.8) !important;  /* neutral-200/80 */
  }

  .dark body:has([data-agents-page]) [data-canvas-dialog],
  .dark [data-agents-page] [data-canvas-dialog],
  .dark body:has([data-agents-page]) .canvas-dialog,
  .dark [data-agents-page] .canvas-dialog {
    box-shadow: 0 0 0 4px rgb(38 38 38 / 0.8) !important;  /* neutral-800/80 */
  }
  ```
- [ ] 5.2 Use v4's ring utilities or verified v4 internal variable names — **SUPERSEDED by 5.1's rewrite. The rewrite uses zero Tailwind internals.**
- [ ] 5.3 Evaluate escaped hover selectors at lines 191-195 — verify against TW4's native `@media (hover: hover)` wrapping — **LOW RISK: arbitrary opacity class name format unchanged in v4. `@media (hover: hover)` wrapping is desirable for Electron desktop context. Existing override selectors remain valid. No change required; verify in Section 8 visual QA.**
- [ ] 5.4 Verify `.space-y-4` selectors at lines 259-346 still match TW4 class names — **CONFIRMED NON-ISSUE: `.space-y-4` is used as a **class selector** targeting Streamdown-generated wrapper divs, NOT for Tailwind utility behavior. The class name is a string match — Tailwind doesn't generate it for our code, Streamdown does at runtime. Unaffected by TW4's space-between selector change.**
- [ ] 5.5 Test ring styling and hover overrides visually — **DEFERRED to Section 8 visual QA (specifically 8.2 ring-offset-background).**

## 6. Update dependencies

> **REASSESSMENT (2026-04-10):** Exact target versions (latest as of 2026-04-10 per `bun pm view`):
> - `@tailwindcss/vite@4.2.2` (peer: `vite: ^5.2.0 || ^6 || ^7 || ^8`)
> - `tailwindcss@4.2.2`
> - `tw-animate-css@1.4.0`
> - `tailwind-merge@3.5.0`
> - `@tailwindcss/typography@0.5.19` (ALREADY INSTALLED — no update needed, already supports v4)

- [ ] 6.1 Install: `@tailwindcss/vite` (or `@tailwindcss/postcss`), `tw-animate-css`, `tailwindcss@^4.2.2` — **`bun add -D @tailwindcss/vite@^4.2.2 tailwindcss@^4.2.2 tw-animate-css@^1.4.0`. Use Option A (`@tailwindcss/vite`), NOT PostCSS fallback (Q1 resolved).**
- [ ] 6.2 Remove: `autoprefixer`, `@tailwindcss/container-queries`, `tailwindcss-animate` — **`bun remove autoprefixer @tailwindcss/container-queries tailwindcss-animate`. Tailwind 4 bundles autoprefixing + container queries natively. Keep `postcss` (used by other build tools elsewhere; check before removing).**
- [ ] 6.3 Update: `tailwind-merge@^3.5.0`, `@tailwindcss/typography` (v4-compatible) — **`bun add -D tailwind-merge@^3.5.0`. tailwind-merge v3 is zero-deps and drops v3 cleanly. `@tailwindcss/typography@0.5.19` is already v4-compatible — NO update needed.**

## 7. Run quality gates

> **REASSESSMENT (2026-04-10):** Baseline targets based on current main state: ts:check=80 errors, test=58 pass/130 expects, build=~40s, audit=58 pre-existing vulns, docs build=~16s. Any deviation from baseline indicates a Tailwind 4 regression that needs investigation.

- [ ] 7.1 Run `bun run ts:check` — verify no new TS errors from dependency changes — **Target: 80 errors (baseline). Tailwind 4 types MAY differ from v3 (e.g., if `cn()` types tighten), but simple usage should be unaffected.**
- [ ] 7.2 Run `bun run build` — verify esbuild packaging succeeds — **Target: clean build, no Rollup errors or warnings beyond the known gray-matter eval warning. Build time may IMPROVE (TW4 Rust engine is 2-5x faster on CSS processing).**
- [ ] 7.3 Run `bun test` — verify all regression guards pass — **Target: 58 pass / 0 fail / 130 expects. No regression guard tests reference CSS directly, so this should be unaffected.**
- [ ] 7.4 Run `bun audit` — check for new advisories — **Target: 58 pre-existing vulns (same as current baseline). Removing `autoprefixer` may eliminate some transitive advisories.**
- [ ] 7.5 Run `cd docs && bun run build` — verify docs site build — **Target: ✓ built in ~16s. Docs site has isolated Tailwind/Vite versions and should be unaffected by main app's Tailwind upgrade.**

## 8. Visual regression testing

> **REASSESSMENT (2026-04-10):** Section 8 is the **user handoff phase**. I cannot interactively click through the UI. All 10 items require a running dev app and human visual inspection. Surface area is LARGER than proposal estimated for bare `rounded` (82/44 files vs 30+/20+) — expect more QA effort in 8.3. Focus attention on: (a) canvas-dialog ring after the 5.1 rewrite, (b) borderRadius scale shift with custom `--radius-*` theme, (c) dark mode transitions. 8.5 may already be pre-addressed via the new task 4.7 base-layer cursor override.

- [ ] 8.1 Inspect default border styling — verify `@apply border-border` works in `@layer base` — **Current globals.css line 79-81: `@layer base { * { @apply border-border; } ... }`. TW4's default border color changed from gray-200 → currentColor, but our explicit `border-border` should override. Verify no unintended border color changes.**
- [ ] 8.2 Inspect ring styling on focus states (especially `ring-offset-background` 5 occurrences) — **Count updated to 5/4 files. Verify `--color-background` is registered in `@theme` block (Section 4.3) so `ring-offset-background` utility resolves. Also verify Section 5.1 canvas-dialog rewrite renders correctly.**
- [ ] 8.3 Inspect shadow/rounded scale shifts — verify all renamed correctly — **Highest-surface visual QA. 82 bare `rounded` (44 files) + 3 bare `shadow` (3 files) + 28 `rounded-sm` + 16 `shadow-sm` usages need visual verification. Custom `--radius-xs: calc(var(--radius) - 6px)` added in Section 4.3 maintains scale progression. Test buttons, cards, dialogs, popovers.**
- [ ] 8.4 Inspect placeholder color changes — **TW4 changes placeholder from gray-400 to currentColor@50%. Check input/textarea placeholders in: auth modal, new-chat-form, settings tabs, search inputs. If regressed, add `@layer base { input::placeholder, textarea::placeholder { color: var(--color-gray-400); } }`.**
- [ ] 8.5 Inspect button cursor behavior — add base cursor override if regressed — **PRE-ADDRESSED by new task 4.7 (adds base-layer `button:not(:disabled) { cursor: pointer; }`). 119 explicit `cursor-pointer` occurrences still fine. Verify no double-override conflicts.**
- [ ] 8.6 Verify dark mode toggle works correctly — **`@custom-variant dark` from Section 4.2 replaces `darkMode: "class"`. Toggle dark mode in settings and verify all surfaces update. Both `@layer base` `:root` and `.dark` selectors in globals.css remain unchanged.**
- [ ] 8.7 Verify `space-y-*` containers with hidden children — **TW4 changes selector from `:not([hidden]) ~ :not([hidden])` to `:not(:last-child)`. Behavioral change only affects containers where a child has `hidden` attribute. Grep for `space-y` + `hidden` co-occurrence in React components to find affected containers.**
- [ ] 8.8 Verify `@container` responsive behavior in file-viewer sidebar, markdown viewer, image viewer — **TW4 has native container query support. The removal of `@tailwindcss/container-queries` plugin should not affect existing `@container/<name>:` usage. Verify in the 3 file-viewer components.**
- [ ] 8.9 Verify animation classes (dialog, tooltip, select, hover-card transitions) — **27 usages across 15 files (animate-in, fade-*, slide-*, zoom-*). `tw-animate-css@1.4.0` is marketed as identical-class-name replacement. Open each dialog/tooltip/select/hover-card and verify animation plays smoothly.**
- [ ] 8.10 Verify WDYR plugin ordering still works after Tailwind plugin addition — **New plugin order: `[tailwindcss(), react({ jsxImportSource: isDev ? "@welldone-software/why-did-you-render" : undefined })]`. Verify dev-mode console shows WDYR re-render reports and no plugin init errors.**

## 9. Update documentation and pins

> **REASSESSMENT (2026-04-10):** After archival, additional drift surfaces to sync (follow docs-drift-check skill pattern): `.serena/memories/environment_and_gotchas.md`, `.serena/memories/project_overview.md`, `docs/operations/roadmap.md`, `CLAUDE.md` tech stack one-liner, `bun.lock`. The post-archive sweep in this upgrade set is the same pattern as TypeScript 6 and Vite 7 Phase A.

- [ ] 9.1 Update `docs/conventions/pinned-deps.md` — remove Tailwind 3.x pin (no longer needed) — **Tailwind 3.x pin exists in docs/conventions/pinned-deps.md with rationale "tailwind-merge v3 requires TW v4". After upgrade, both are v4/v3 respectively — remove the pin section entirely or note "upgraded to v4 on 2026-04-??".**
- [ ] 9.2 Update `docs/architecture/tech-stack.md` — Tailwind version — **Row for "Styling" / "Tailwind CSS" — current version is `3.x` with pinned note. Update to `4.2.x` and remove the pinned note about tailwind-merge.**
- [ ] 9.3 Update `openspec/config.yaml` context block — Tailwind version — **Current line 5: `Tech stack: Electron 41, React 19, TypeScript 6, Tailwind 3, tRPC, Drizzle ORM, SQLite`. Update `Tailwind 3` → `Tailwind 4`.**

> **ADDITIONAL DOC SYNC TASKS (new 2026-04-10, pattern from TS 6 and Vite 7 archive sweeps):**

- [ ] 9.4 Update `CLAUDE.md` tech stack one-liner — **Current line 74: `Electron 41 / React 19 / TypeScript 6 / Tailwind 3 / Bun`. Update `Tailwind 3` → `Tailwind 4`.**
- [ ] 9.5 Update `.serena/memories/environment_and_gotchas.md` — **Current line 25: `Tailwind 3.x, shiki 3.x, Claude CLI 2.1.96, Codex 0.118.0`. Update `Tailwind 3.x` → `Tailwind 4.2.x`. Update the "Tailwind 4 risk" block in Upgrade Blockers to mark RESOLVED (similar to how TS 6 and Vite 7 risks were marked RESOLVED).**
- [ ] 9.6 Update `.serena/memories/project_overview.md` — **Add new Current State bullet for Tailwind 4. Update Upgrade execution order: `E41 ✅ → TS6 ✅ → Vite7-A ✅ → TW4 ✅ → Vite8-B+Shiki4 (blocked)`.**
- [ ] 9.7 Update `docs/operations/roadmap.md` — **Remove `[Ready] Tailwind CSS 3 → 4 + tailwind-merge 2 → 3` entry from active list. Add row to Recently Completed table.**
