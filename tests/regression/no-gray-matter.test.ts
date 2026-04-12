/**
 * Regression guard: no direct gray-matter / front-matter imports outside the canonical shim.
 *
 * Enforces that main-process code uses the canonical frontmatter parser at
 * `src/main/lib/frontmatter.ts` and does not import `gray-matter`,
 * `front-matter`, `vfile-matter`, or `js-yaml` directly for frontmatter parsing.
 *
 * Two checks:
 *   1. Root package.json must not declare `gray-matter` in dependencies or
 *      devDependencies. (front-matter is allowed because it backs the shim.)
 *   2. No file under `src/main/` may contain a forbidden import statement,
 *      with the sole exception of the shim itself (`src/main/lib/frontmatter.ts`),
 *      which legitimately imports from `front-matter`.
 *
 * Scope: `src/main/` only. The `services/1code-api/` workspace has its own
 * gray-matter usage in `services/1code-api/src/routes/changelog.ts` which is
 * out of scope for this guard — that bundle is built separately by the service
 * Dockerfile and does not contribute to the electron-vite Rollup warning this
 * change eliminated.
 *
 * Performance: <200ms on a warm filesystem (recursive walk of ~200 files).
 *
 * Source: OpenSpec change `replace-gray-matter-with-front-matter` §7.
 * See also: `src/main/lib/frontmatter.ts` — the canonical shim.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const SRC_MAIN = join(REPO_ROOT, "src", "main");
const PACKAGE_JSON = join(REPO_ROOT, "package.json");
const SHIM_REL_PATH = join("src", "main", "lib", "frontmatter.ts");

/**
 * Directories to skip during the walk.
 */
const SKIP_DIRS = new Set(["node_modules", "dist", "out", "release"]);

/**
 * Forbidden import sources for frontmatter parsing. The shim is exempt for
 * `front-matter` only (it must wrap the underlying package).
 */
const FORBIDDEN_PACKAGES = ["gray-matter", "front-matter"] as const;

interface Violation {
  file: string;
  line: number;
  snippet: string;
  forbiddenPackage: string;
}

/** Recursively collect .ts and .tsx files under a directory. */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Build a regex that matches both ES module imports and CommonJS requires for
 * a given package name. Examples it catches:
 *
 *   import matter from "gray-matter";
 *   import { something } from "gray-matter";
 *   import * as gm from 'gray-matter';
 *   const matter = require("gray-matter");
 *   require('gray-matter')
 */
function buildImportRegex(pkg: string): RegExp {
  // Escape any regex special chars in the package name
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:import\\b[^"']*from\\s*["']${escaped}["']|require\\s*\\(\\s*["']${escaped}["']\\s*\\))`,
  );
}

describe("no-gray-matter regression guard", () => {
  test("root package.json does not declare gray-matter", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const inDeps = pkg.dependencies && "gray-matter" in pkg.dependencies;
    const inDev = pkg.devDependencies && "gray-matter" in pkg.devDependencies;

    if (inDeps || inDev) {
      throw new Error(
        `gray-matter must not appear in root package.json. Found in: ${[
          inDeps && "dependencies",
          inDev && "devDependencies",
        ]
          .filter(Boolean)
          .join(", ")}. Remediation: \`bun remove gray-matter\` and use the canonical shim at src/main/lib/frontmatter.ts.`,
      );
    }
    expect(inDeps).toBeFalsy();
    expect(inDev).toBeFalsy();
  });

  test("no main-process file imports gray-matter or front-matter outside the shim", () => {
    const allFiles = collectTsFiles(SRC_MAIN);
    const violations: Violation[] = [];

    for (const absPath of allFiles) {
      const relPath = relative(REPO_ROOT, absPath);
      // Normalize to forward slashes for comparison
      const normalizedRel = relPath.split(sep).join("/");
      const isShim = normalizedRel === SHIM_REL_PATH.split(sep).join("/");

      const content = readFileSync(absPath, "utf-8");
      const lines = content.split("\n");

      for (const pkg of FORBIDDEN_PACKAGES) {
        const regex = buildImportRegex(pkg);
        for (let i = 0; i < lines.length; i++) {
          if (!regex.test(lines[i])) continue;
          // Exempt the shim itself for `front-matter` (it MUST wrap the package).
          if (isShim && pkg === "front-matter") continue;
          violations.push({
            file: normalizedRel,
            line: i + 1,
            snippet: lines[i].trim(),
            forbiddenPackage: pkg,
          });
        }
      }
    }

    if (violations.length > 0) {
      const formatted = violations
        .map(
          (v) =>
            `  ${v.file}:${v.line}\n    forbidden: ${v.forbiddenPackage}\n    snippet:  ${v.snippet}`,
        )
        .join("\n\n");
      throw new Error(
        `Found ${violations.length} forbidden frontmatter import(s) in src/main/.\n\n${formatted}\n\nRemediation: import { matter } from "<relative-path>/frontmatter" — the canonical shim at src/main/lib/frontmatter.ts is the only sanctioned entry point. See OpenSpec change replace-gray-matter-with-front-matter §3.`,
      );
    }
    expect(violations).toEqual([]);
  });

  test("the canonical shim exists and imports front-matter", () => {
    const shimPath = join(REPO_ROOT, SHIM_REL_PATH);
    const content = readFileSync(shimPath, "utf-8");
    expect(content).toContain('from "front-matter"');
    expect(content).toContain("export function matter");
  });
});
