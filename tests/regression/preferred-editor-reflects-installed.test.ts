/**
 * Regression guard: the Preferred Editor dropdown shows only editors that
 * the main process has detected as installed on the user's machine.
 *
 * Three invariants are asserted:
 *
 * 1. `isAppInstalled()` in `src/main/lib/trpc/routers/external.ts` uses
 *    `which` for PATH-based detection against an editor's `cliBinary`.
 *    (Shape check — confirms the rewrite landed and is not reverted.)
 * 2. `preferredEditorAtom` in `src/renderer/lib/atoms/index.ts` defaults to
 *    `null` with type `ExternalApp | null`, NOT to the upstream-authored
 *    literal `"cursor"`. Rejects any non-null string literal default so a
 *    future refactor that hardcodes "vscode" or similar still fails this
 *    guard.
 * 3. The filter expressions in `agents-preferences-tab.tsx` are fail-closed
 *    (`: []`), NOT fail-open (`: EDITORS` / `: TERMINALS` / `: VSCODE` /
 *    `: JETBRAINS`). Fail-open was the upstream bug that made uninstalled
 *    editors appear in the dropdown during the loading state.
 *
 * Part of the fix-preferred-editor-detection OpenSpec change.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import path from "path";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");
const EXTERNAL_ROUTER = path.join(
  REPO_ROOT,
  "src/main/lib/trpc/routers/external.ts",
);
const ATOMS_INDEX = path.join(REPO_ROOT, "src/renderer/lib/atoms/index.ts");
const PREFERENCES_TAB = path.join(
  REPO_ROOT,
  "src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx",
);

describe("preferred editor reflects installed editors", () => {
  test("isAppInstalled uses `which` for PATH-based detection against cliBinary", () => {
    const source = readFileSync(EXTERNAL_ROUTER, "utf-8");

    // The `which` package must be imported at the top of the file.
    expect(source).toMatch(/^\s*import\s+which\s+from\s+["']which["'];?\s*$/m);

    // `isAppInstalled` must consult `meta.cliBinary` and `which()`.
    expect(source).toMatch(/meta\.cliBinary/);
    expect(source).toMatch(/which\s*\(\s*meta\.cliBinary/);
    expect(source).toMatch(/nothrow:\s*true/);
  });

  test("preferredEditorAtom defaults to null with nullable type", () => {
    const source = readFileSync(ATOMS_INDEX, "utf-8");

    // Locate the atom declaration block.
    const blockMatch = source.match(
      /preferredEditorAtom\s*=\s*atomWithStorage<([^>]+)>\s*\(\s*["']preferences:preferred-editor["']\s*,\s*([^,]+),/,
    );
    expect(blockMatch).not.toBeNull();
    if (!blockMatch) return;

    const [, typeParam, defaultExpr] = blockMatch;

    // Type parameter must be the nullable form.
    expect(typeParam.replace(/\s+/g, "")).toBe("ExternalApp|null");

    // Default value must be the literal `null`, not `"cursor"` or any other
    // string literal pointing at a non-installed editor.
    expect(defaultExpr.trim()).toBe("null");
  });

  test("agents-preferences-tab filters are fail-closed, not fail-open", () => {
    const source = readFileSync(PREFERENCES_TAB, "utf-8");

    // Scan line-by-line for the characteristic filter ternary. The source
    // uses a multi-line form where the ternary colon sits on its own line,
    // so we collapse whitespace for the scan.
    const normalized = source.replace(/\s+/g, " ");

    // None of the fail-open arms should remain. The pre-fix shape was
    // `installedEditors ? X.filter(...) : X` where X was the unfiltered list.
    // The post-fix shape is `installedEditors ? X.filter(...) : []`.
    // We anchor by searching for `: <ARM>` immediately after a `.filter(...)`
    // whose preceding list name is the same ARM.
    for (const arm of ["EDITORS", "TERMINALS", "VSCODE", "JETBRAINS"]) {
      const failOpenShape = new RegExp(
        `${arm}\\.filter\\(.+?\\)\\s*:\\s*${arm}\\b`,
      );
      expect(normalized).not.toMatch(failOpenShape);
    }

    // At least one filter expression must terminate in `: []` — the
    // fail-closed shape. We check for the presence of the fail-closed
    // construction against any of the four lists.
    const failClosedShape =
      /(EDITORS|TERMINALS|VSCODE|JETBRAINS)\.filter\(.+?\)\s*:\s*\[\s*\]/;
    expect(normalized).toMatch(failClosedShape);
  });
});
