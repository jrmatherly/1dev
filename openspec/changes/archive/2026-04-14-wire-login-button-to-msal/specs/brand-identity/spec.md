## ADDED Requirements

### Requirement: Login window SVG uses canonical 1Code geometry with full a11y compliance

The login window's logo SVG geometry SHALL match the canonical 1Code mark defined in `src/renderer/components/ui/logo.tsx`. Concretely, `src/renderer/login.html` SHALL contain:

- `viewBox="0 0 400 400"` on the `<svg>` element
- An SVG path `d` attribute beginning with `"M358.333"`
- `aria-label="1Code logo"` on the `<svg>` element (matches the canonical Logo component)
- `role="img"` on the `<svg>` element (so assistive tech treats it as an image with the aria-label as accessible name)
- `class="logo-path"` on the inner `<path>` element (so the existing CSS rule `.logo .logo-path { fill: var(--text-logo); }` continues to apply across dark/light themes)

`src/renderer/login.html` SHALL NOT contain `viewBox="0 0 560 560"` or a path `d` beginning `"M560 560H0V0"` (the legacy 21st.dev mark).

This is a **visual brand assertion**, complementing the textual brand assertions already enforced by `tests/regression/brand-sweep-complete.test.ts`. The text-based guard does not detect SVG path-geometry drift because the legacy upstream geometry contains no Tier A textual identifier. This requirement closes that gap for `login.html`, the highest-visibility pre-app-load surface.

This requirement also brings `login.html` into compliance with the existing `accessibility-labels-reflect-current-brand` requirement in this same baseline spec — `login.html` previously had neither `aria-label` nor `role="img"` on its logo SVG.

#### Scenario: login.html uses canonical 1Code geometry

- **WHEN** `tests/regression/login-flow-uses-msal.test.ts` reads `src/renderer/login.html`
- **THEN** the file SHALL contain the literal substring `viewBox="0 0 400 400"`
- **AND** SHALL contain a path whose `d` attribute begins with `"M358.333"`
- **AND** SHALL contain `aria-label="1Code logo"`
- **AND** SHALL contain `class="logo-path"`
- **AND** SHALL NOT contain `viewBox="0 0 560 560"`
- **AND** SHALL NOT contain a path beginning with `"M560 560H0V0"`

#### Scenario: Reintroduction of legacy geometry is blocked

- **WHEN** a contributor edits `src/renderer/login.html` to reintroduce `viewBox="0 0 560 560"` or a path beginning `"M560 560H0V0"`
- **THEN** `bun test tests/regression/login-flow-uses-msal.test.ts` SHALL fail
- **AND** the failure message SHALL name `src/renderer/login.html` and the offending substring

#### Scenario: Logo accessible name announces 1Code

- **WHEN** a screen-reader user focuses the login window's logo
- **THEN** the announcement SHALL contain "1Code logo" via the `aria-label`
- **AND** SHALL NOT contain "21st" or any Tier A identifier
