/**
 * Regression guard for Phase 0 hard gates #5 and #6.
 *
 * Five token-leak log sites were removed in the Phase 0 cleanup preceding the
 * enterprise auth migration:
 *
 *   - src/main/lib/trpc/routers/claude.ts (4 sites: token preview on decrypt,
 *     token preview on legacy decrypt, redactedConfig token preview in SDK log,
 *     Ollama tokenPreview debug block)
 *   - src/main/lib/claude/env.ts (1 site: ANTHROPIC_AUTH_TOKEN presence log)
 *
 * If any of the specific anti-patterns reappears in these files — or in any
 * file under src/main/ — this test fails and blocks the merge.
 *
 * The guard is pattern-based rather than line-number-based so it survives
 * refactors that move code around. Each forbidden substring is chosen because
 * it is unique to a token-logging anti-pattern and unlikely to appear in
 * legitimate code for any other reason.
 *
 * See:
 *   docs/enterprise/auth-strategy.md §6 Phase 0 hard gates #5-6
 *   .full-review/envoy-gateway-review/05-final-report.md §H6
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const MAIN_DIR = join(REPO_ROOT, "src/main");

/**
 * Recursively walk a directory, yielding absolute paths to .ts files.
 * Skips node_modules and dot-dirs.
 */
function* walkTsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (entry.endsWith(".ts")) {
      yield full;
    }
  }
}

/**
 * Anti-patterns that would indicate a regression. Each entry is a literal
 * substring that must NOT appear anywhere under src/main/.
 */
const FORBIDDEN_PATTERNS: Array<{ pattern: string; reason: string }> = [
  {
    pattern: "Token preview:",
    reason:
      "Token preview log at claude.ts — reveals 30 chars, enough to fingerprint",
  },
  {
    pattern: "Token total length:",
    reason: "Token length log at claude.ts — leaks size fingerprint",
  },
  {
    pattern: "tokenPreview:",
    reason: "Ollama tokenPreview debug block at claude.ts",
  },
  {
    pattern: 'ANTHROPIC_AUTH_TOKEN ? "set" : "not set"',
    reason: "Token presence log at env.ts",
  },
  {
    pattern: "finalCustomConfig.token.slice",
    reason: "redactedConfig token preview at claude.ts",
  },
];

describe("Phase 0 gate #5-6: token leak logs removed", () => {
  test("no forbidden token-log patterns appear anywhere under src/main/", () => {
    const offenders: Array<{ file: string; pattern: string; reason: string }> =
      [];
    for (const file of walkTsFiles(MAIN_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
        if (source.includes(pattern)) {
          offenders.push({
            file: file.slice(REPO_ROOT.length + 1),
            pattern,
            reason,
          });
        }
      }
    }
    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  - ${o.file}: "${o.pattern}" (${o.reason})`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} token-leak log regression(s):\n${report}`,
      );
    }
    expect(offenders.length).toBe(0);
  });
});
