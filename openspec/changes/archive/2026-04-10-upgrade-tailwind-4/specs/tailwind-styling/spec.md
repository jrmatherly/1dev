## ADDED Requirements

### Requirement: CSS-first configuration replaces JS config

Tailwind CSS v4 SHALL use CSS-first configuration via `@theme`, `@plugin`, and `@custom-variant` directives, replacing the `tailwind.config.js` file.

#### Scenario: Theme is configured in CSS

- **GIVEN** Tailwind CSS v4 is installed
- **WHEN** the app is built
- **THEN** the theme, plugins, and dark mode are configured via CSS directives in `globals.css`
- **AND** `tailwind.config.js` is either deleted or referenced via `@config` bridge

### Requirement: Vite plugin processes Tailwind

The build SHALL use `@tailwindcss/vite` (preferred) or `@tailwindcss/postcss` instead of the old PostCSS plugin. The separate `autoprefixer` package is no longer needed.

#### Scenario: Build uses Tailwind Vite plugin

- **GIVEN** the project uses electron-vite for builds
- **WHEN** the renderer process is built
- **THEN** Tailwind CSS is processed via `@tailwindcss/vite` or `@tailwindcss/postcss`
- **AND** `postcss.config.js` is deleted

### Requirement: Dark mode works via CSS custom variant

Dark mode SHALL be configured via CSS `@custom-variant` directive instead of `darkMode: "class"` in JS config.

#### Scenario: Dark mode toggle renders correctly

- **GIVEN** the app uses class-based dark mode
- **WHEN** the `.dark` class is applied to the HTML element
- **THEN** dark mode styles render correctly

### Requirement: All utility classes are migrated to v4 names

All deprecated and renamed utility classes SHALL be migrated to their v4 equivalents. The `@tailwindcss/upgrade` tool handles most renames.

#### Scenario: No deprecated class warnings

- **GIVEN** all deprecated/renamed utility classes have been updated
- **WHEN** `bun run build` is executed
- **THEN** no Tailwind warnings about unknown classes appear
- **AND** visual appearance is preserved

### Requirement: Plugins are compatible with v4

All Tailwind plugins SHALL be loaded via CSS directives. `tailwindcss-animate` SHALL be replaced by `tw-animate-css`. Container queries are now built-in.

#### Scenario: Typography and animation plugins work

- **GIVEN** `@tailwindcss/typography` is loaded via `@plugin` and `tw-animate-css` is imported
- **WHEN** prose content and animated components render
- **THEN** typography and animation styles work correctly

### Requirement: Internal CSS variable references are v4-compatible

The `agents-styles.css` file references Tailwind internal CSS variables (`--tw-ring-*`) that may change in v4. These SHALL be rewritten for v4 compatibility.

#### Scenario: Ring styling renders correctly

- **GIVEN** `agents-styles.css` previously referenced `--tw-ring-*` internal variables
- **WHEN** the component renders
- **THEN** ring styling works correctly using v4-compatible approaches
