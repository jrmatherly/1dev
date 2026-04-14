Validates that build/ icon and logo assets match the canonical logo source.

The canonical logo source is `src/renderer/assets/1code-logo.png` (the circuit-board "1" mark).

## Checks

1. **build/icon.png** — Must be 1024x1024 PNG. Verify with `sips -g pixelWidth -g pixelHeight build/icon.png`.

2. **build/icon.icns** — Must exist and be >100KB (a valid multi-resolution icns). Verify with `file build/icon.icns`.

3. **build/icon.ico** — Must exist and contain multiple sizes. Verify with `file build/icon.ico` (should report "MS Windows icon resource").

4. **build/trayTemplate.svg** — Must NOT contain `viewBox="0 0 560 560"` (legacy geometry). Must NOT contain the legacy path `M560 560H0V0`.

5. **build/trayTemplate.png** — Must be 22x22. Verify with `sips -g pixelWidth -g pixelHeight build/trayTemplate.png`.

6. **build/trayTemplate@2x.png** — Must be 44x44.

7. **src/renderer/login.html** — Must contain `data:image/png;base64,` (inline logo). Must NOT contain `viewBox="0 0 400 400"` or `M358.333` (old SVG path). Must contain `alt="1Code logo"`.

8. **src/renderer/index.html** — Must contain `data:image/png;base64,` (inline loading logo). Must NOT contain `viewBox="0 0 400 400"` or `M358.333`.

9. **src/renderer/components/ui/logo.tsx** — Must import from `assets/1code-logo.png`. Must NOT contain `<svg` or `viewBox`.

10. **No old SVG path in src/** — `grep -r "M358.333" src/` must return 0 matches.

11. **No legacy 560x560 geometry** — `grep -r 'viewBox="0 0 560 560"' src/ build/` must return 0 matches.

## When to Run

- After any edit to files in `build/` directory
- After any edit to logo.tsx, login.html, or index.html
- Before a release that includes branding changes
- When the brand-identity spec is modified

## Output

Report as a checklist: pass/fail per check, with the specific file and line for any failure.
Read-only — proposes fixes but does not apply them.
