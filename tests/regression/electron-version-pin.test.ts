/**
 * Regression guard for the upgrade-electron-40 OpenSpec change.
 *
 * Asserts that the Electron version in package.json is >= 40 and that
 * electron-vite is >= 5.0.0 (prerequisite for Electron 40 support).
 * Prevents accidental revert to Electron 39 (EOL 2026-05-05) via
 * `bun update` or manual edits.
 *
 * See: openspec/changes/upgrade-electron-40/proposal.md
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8"));

describe("upgrade-electron-40: version pin guard", () => {
  test("Electron major version is >= 40", () => {
    const electronVersion = pkg.devDependencies?.electron;
    expect(electronVersion).toBeDefined();
    // Extract major version from semver range (e.g., "~40.8.5" → 40)
    const major = parseInt(
      electronVersion.replace(/[^0-9]/g, "").slice(0, 2),
      10,
    );
    expect(major).toBeGreaterThanOrEqual(40);
  });

  test("electron-vite major version is >= 5", () => {
    const evVersion = pkg.devDependencies?.["electron-vite"];
    expect(evVersion).toBeDefined();
    const major = parseInt(evVersion.replace(/[^0-9]/g, "")[0], 10);
    expect(major).toBeGreaterThanOrEqual(5);
  });

  test("@types/node major version is >= 24", () => {
    const typesVersion = pkg.devDependencies?.["@types/node"];
    expect(typesVersion).toBeDefined();
    const major = parseInt(typesVersion.replace(/[^0-9]/g, "").slice(0, 2), 10);
    expect(major).toBeGreaterThanOrEqual(24);
  });

  test("node-pty uses lazy import (not eager top-level import)", () => {
    const sessionTs = readFileSync(
      join(REPO_ROOT, "src/main/lib/terminal/session.ts"),
      "utf-8",
    );
    // Should NOT have static `import * as pty from "node-pty"` at top level
    const hasEagerImport = /^import \* as pty from ["']node-pty["']/m.test(
      sessionTs,
    );
    expect(hasEagerImport).toBe(false);
    // Should have the lazy ensurePty function
    expect(sessionTs).toContain("ensurePty");
  });
});
