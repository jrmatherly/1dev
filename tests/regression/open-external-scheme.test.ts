/**
 * Regression guard: shell.openExternal must go through safeOpenExternal
 *
 * All shell.openExternal() calls in src/main/ MUST use the safeOpenExternal()
 * wrapper from src/main/lib/safe-external.ts, which validates URL schemes
 * (only https:, http:, mailto: allowed). Direct calls to shell.openExternal()
 * bypass scheme validation and could open dangerous protocols.
 *
 * If this test fails, you added a direct shell.openExternal() call.
 * Fix: import { safeOpenExternal } from "./safe-external" and use it instead.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const MAIN_DIR = path.join(import.meta.dirname, "../../src/main");
const SAFE_EXTERNAL_FILE = "lib/safe-external.ts";

// Files that are ALLOWED to call shell.openExternal directly
const ALLOWLIST = new Set([SAFE_EXTERNAL_FILE]);

function findTsFiles(dir: string, base: string = ""): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...findTsFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      results.push(rel);
    }
  }
  return results;
}

describe("shell.openExternal scheme validation", () => {
  test("no direct shell.openExternal calls outside safe-external.ts", () => {
    const files = findTsFiles(MAIN_DIR);
    const violations: string[] = [];

    for (const file of files) {
      if (ALLOWLIST.has(file)) continue;

      const content = fs.readFileSync(path.join(MAIN_DIR, file), "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match direct shell.openExternal calls (not in comments or string literals)
        if (
          line.includes("shell.openExternal") &&
          !line.trimStart().startsWith("//") &&
          !line.trimStart().startsWith("*")
        ) {
          violations.push(
            `${file}:${i + 1}: ${line.trim()}\n` +
              `  → Use safeOpenExternal() from lib/safe-external.ts instead`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("safe-external.ts exists and exports safeOpenExternal", () => {
    const safePath = path.join(MAIN_DIR, SAFE_EXTERNAL_FILE);
    expect(fs.existsSync(safePath)).toBe(true);

    const content = fs.readFileSync(safePath, "utf-8");
    expect(content).toContain("export async function safeOpenExternal");
    expect(content).toContain("ALLOWED_SCHEMES");
  });
});
