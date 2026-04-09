/**
 * Regression guard for the documentation-site capability.
 *
 * Tracked files must not contain literal references to paths under
 * .scratchpad/ because that directory is gitignored. References to it
 * from tracked files create dangling pointers for any clone, contributor,
 * or CI run that does not have the original author's local state.
 *
 * See:
 *   docs/conventions/no-scratchpad-references.md
 *   openspec/specs/documentation-site/spec.md (after archive)
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");

/**
 * Files that are allowed to contain `.scratchpad/` references.
 * Each entry has a comment explaining why.
 */
const ALLOWLIST = new Set([
  ".gitignore", // contains the gitignore rule itself
  "CLAUDE.md", // describes .scratchpad/ as a concept in "Working Directories"
  ".claude/PROJECT_INDEX.md", // describes .scratchpad/ directory in the repo navigation map
  ".claude/skills/docs-drift-check/SKILL.md", // audits .scratchpad/ content for drift
  ".serena/memories/codebase_structure.md", // describes .scratchpad/ in the directory tree
  "openspec/specs/documentation-site/spec.md", // defines the no-scratchpad-references rule itself
  "tests/regression/no-scratchpad-references.test.ts", // this file — contains the detection pattern
]);

/**
 * Path prefixes that are allowlisted (matched with startsWith).
 * Archived OpenSpec changes are immutable history.
 */
const ALLOWLIST_PREFIXES = [
  "openspec/changes/", // OpenSpec proposals describe past and current state, legitimately reference .scratchpad/
];

/**
 * Directories to skip entirely (dot-prefixed dirs are auto-skipped
 * by the walker, plus these explicit skips).
 */
const SKIP_DIRS = new Set([
  "node_modules",
  "release",
  "out",
  "dist",
  "docs", // docs/ pages may legitimately reference .scratchpad/ in DEPRECATED banners
  "cache", // .serena/cache/ contains binary serialized files
]);

/** Binary/lockfile extensions to skip */
const SKIP_EXTENSIONS = new Set([
  ".lock",
  ".lockb",
  ".png",
  ".ico",
  ".icns",
  ".woff",
  ".woff2",
  ".ttf",
  ".svg",
  ".jpg",
  ".jpeg",
  ".gif",
  ".mp3",
  ".mp4",
  ".zip",
  ".gz",
  ".tar",
  ".dmg",
]);

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkFiles(fullPath);
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (SKIP_EXTENSIONS.has(ext)) continue;
      yield fullPath;
    }
  }
}

describe("no-scratchpad-references", () => {
  test("tracked files must not reference .scratchpad/ paths", () => {
    const violations: { file: string; line: number; snippet: string }[] = [];

    for (const fullPath of walkFiles(REPO_ROOT)) {
      const relPath = relative(REPO_ROOT, fullPath);

      // Skip allowlisted files
      if (ALLOWLIST.has(relPath)) continue;

      // Skip allowlisted prefixes
      if (ALLOWLIST_PREFIXES.some((prefix) => relPath.startsWith(prefix)))
        continue;

      let content: string;
      try {
        content = readFileSync(fullPath, "utf-8");
      } catch {
        continue;
      }

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(".scratchpad/")) {
          violations.push({
            file: relPath,
            line: i + 1,
            snippet: lines[i].trim().slice(0, 80),
          });
        }
      }
    }

    if (violations.length > 0) {
      const listing = violations
        .slice(0, 20)
        .map((v) => `  ${v.file}:${v.line}  ${v.snippet}`)
        .join("\n");
      const extra =
        violations.length > 20
          ? `\n  ... and ${violations.length - 20} more`
          : "";

      expect(violations).toHaveLength(
        0,
        // @ts-expect-error - bun:test supports message as second arg
        `Found ${violations.length} .scratchpad/ reference(s) in tracked files:\n${listing}${extra}\n\n` +
          `Fix: relink to the corresponding docs/ page, or remove the reference.\n` +
          `Rule: docs/conventions/no-scratchpad-references.md\n` +
          `Allowlist: update ALLOWLIST in this test if a new exemption is justified.`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});
