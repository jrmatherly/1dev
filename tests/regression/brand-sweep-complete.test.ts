/**
 * Regression guard for the rebrand-residual-sweep change.
 *
 * After commit 9b6d525 rebranded 21st.dev → apollosai.dev, a follow-up audit
 * found 17 residual hits across 14 files. The rebrand-residual-sweep openspec
 * change (now archived at openspec/changes/archive/2026-04-09-rebrand-residual-sweep/)
 * landed the final sweep — this guard prevents regression.
 *
 * The enterprise fork uses a three-tier brand taxonomy (defined in the
 * brand-identity capability spec):
 *
 *   Tier A (upstream brand — MUST NOT appear): 21st, twentyfirst, 1code.dev,
 *     cdn.21st, dev.21st, github.com/21st-dev (except allowlisted attribution),
 *     @21st-dev npm scope, 21st-desktop user-agent strings, etc.
 *
 *   Tier B (product name — ALLOWED): "1Code" (product name), "1code-desktop"
 *     (package name), "1code" (CLI launcher script name), ".1code/" (hidden
 *     filesystem directory for worktrees/repos).
 *
 *   Tier C (attribution — PRESERVED AS HISTORICAL): the upstream PR link
 *     comment at src/main/lib/cli.ts:6, the README.md attribution paragraph
 *     and the "Looking for the upstream OSS product?" pointer on README.md.
 *
 * This guard scans src/main/, src/renderer/, scripts/, plus package.json and
 * README.md for the case-insensitive Tier A patterns `21st`, `twentyfirst`,
 * and `1code.dev`. Any hit outside the Tier C allowlist fails the test.
 *
 * The test does NOT walk docs/, .full-review/, openspec/, .claude/,
 * .serena/, CLAUDE.md, AGENTS.md, CONTRIBUTING.md — those are documentation
 * and historical surfaces that legitimately reference the upstream brand.
 *
 * See:
 *   openspec/specs/brand-identity/spec.md
 *   openspec/changes/archive/2026-04-09-rebrand-residual-sweep/
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");

/**
 * Directories to walk recursively. These contain runtime code, scripts,
 * or top-level metadata that must not leak upstream brand identifiers.
 */
const SCAN_DIRS: string[] = ["src/main", "src/renderer", "scripts"];

/**
 * Individual files (not directories) to scan. These are top-level metadata
 * files where brand identifiers would be user-visible.
 */
const SCAN_FILES: string[] = ["package.json", "README.md"];

/**
 * File extensions to scan within SCAN_DIRS.
 */
const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".json",
  ".sh",
  ".md",
]);

/**
 * Case-insensitive Tier A patterns that must NOT appear in scanned files
 * (except at allowlisted file:line positions).
 */
const FORBIDDEN_PATTERNS: RegExp[] = [/21st/i, /twentyfirst/i, /1code\.dev/i];

/**
 * Allowlist of repo-relative file paths where Tier C (attribution/historical)
 * occurrences are permitted. For each entry, the ENTIRE file is exempt from
 * the scan. Keep this list minimal — each addition is an explicit policy
 * decision documented in the brand-identity capability spec.
 */
const ALLOWLIST_FILES = new Set<string>([
  // Upstream PR attribution comment at line 6 — preserved per
  // Apache License 2.0 §4(c) as historical attribution to the original
  // contributor (@caffeinum, Aleksey Bykhun). See the openspec proposal
  // §Scope (Tier C section) and the brand-identity spec Requirement 1.
  "src/main/lib/cli.ts",

  // README.md contains THREE legitimate upstream references:
  //   1. Line 5 attribution paragraph: "enterprise fork of 1Code by 21st-dev"
  //      with a link to github.com/21st-dev/1code
  //   2. Line 33 feature-inventory description: "The following features
  //      depend on the 1code.dev hosted backend" (historical context)
  //   3. Line 134 "Looking for the upstream OSS product?" pointer with a
  //      link to https://1code.dev (practical routing for users who want
  //      upstream, not attribution per se)
  // All three are Tier C per the brand-identity spec.
  "README.md",
]);

/**
 * Recursively walk a directory, yielding absolute paths to files matching
 * SCAN_EXTENSIONS. Skips node_modules and dot-prefixed directories.
 */
function* walkFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // directory does not exist (e.g., scripts/ after a checkout quirk)
  }
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkFiles(full);
    } else {
      const dotIdx = entry.lastIndexOf(".");
      if (dotIdx === -1) continue;
      const ext = entry.slice(dotIdx);
      if (SCAN_EXTENSIONS.has(ext)) {
        yield full;
      }
    }
  }
}

/**
 * Collect every file to scan: SCAN_DIRS walked recursively, plus SCAN_FILES.
 */
function collectScanTargets(): string[] {
  const targets: string[] = [];
  for (const dir of SCAN_DIRS) {
    targets.push(...walkFiles(join(REPO_ROOT, dir)));
  }
  for (const file of SCAN_FILES) {
    targets.push(join(REPO_ROOT, file));
  }
  return targets;
}

describe("rebrand-residual-sweep: Tier A brand identifiers removed", () => {
  test("no 21st / twentyfirst / 1code.dev substrings in runtime code, scripts, or top-level metadata", () => {
    const offenders: Array<{
      file: string;
      line: number;
      snippet: string;
      pattern: string;
    }> = [];

    for (const absPath of collectScanTargets()) {
      const relPath = relative(REPO_ROOT, absPath);
      if (ALLOWLIST_FILES.has(relPath)) continue;

      let source: string;
      try {
        source = readFileSync(absPath, "utf8");
      } catch {
        continue; // file disappeared mid-scan (race), ignore
      }

      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            offenders.push({
              file: relPath,
              line: i + 1,
              snippet: line.trim().slice(0, 120),
              pattern: pattern.source,
            });
            break; // one offense per line is enough to report
          }
        }
      }
    }

    if (offenders.length > 0) {
      const report = offenders
        .map(
          (o) => `  - ${o.file}:${o.line} matched /${o.pattern}/: ${o.snippet}`,
        )
        .join("\n");
      throw new Error(
        `Found ${offenders.length} Tier A brand regression(s) outside the allowlist:\n${report}\n\n` +
          `If the occurrence is a legitimate Tier C attribution, add the FILE to ALLOWLIST_FILES ` +
          `in tests/regression/brand-sweep-complete.test.ts with a comment justifying the addition. ` +
          `Otherwise, remove or rebrand the identifier.`,
      );
    }

    expect(offenders.length).toBe(0);
  });
});
