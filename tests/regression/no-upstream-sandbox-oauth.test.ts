/**
 * Regression guard for Phase 0 hard gate #8.
 *
 * The upstream sandbox OAuth procedures were deleted from
 * src/main/lib/trpc/routers/claude-code.ts as part of the enterprise fork's
 * decoupling from the upstream SaaS backend. This guard prevents any of the
 * deleted procedures, their helpers, or their renderer call sites from being
 * reintroduced.
 *
 * The guard uses 11 assertions organized in two layers:
 *
 *   Primary layer (assertions 1-5): covers the 7 original bypass paths
 *   identified by a 4-reviewer independent audit.
 *
 *   Defense-in-depth layer (assertions 7-9): covers 4 additional bypass paths
 *   identified by a second independent review (new-file router move,
 *   new-file renderer caller, direct-fetch bypass, wrong-path harness bug).
 *
 *   Positive controls (assertions 10-11): catch wrong-path readFileSync bugs
 *   before any negative assertion can silently pass on an empty buffer.
 *
 * See: openspec/changes/remove-upstream-sandbox-oauth/design.md §Decision 3
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const SRC_DIR = join(REPO_ROOT, "src");
const MAIN_DIR = join(SRC_DIR, "main");
const RENDERER_DIR = join(SRC_DIR, "renderer");
const CLAUDE_CODE_ROUTER = join(
  MAIN_DIR,
  "lib/trpc/routers/claude-code.ts",
);
const ONBOARDING_PAGE = join(
  RENDERER_DIR,
  "features/onboarding/anthropic-onboarding-page.tsx",
);
const LOGIN_MODAL = join(
  RENDERER_DIR,
  "components/dialogs/claude-login-modal.tsx",
);

/**
 * Recursively walk a directory, yielding absolute paths to .ts/.tsx files.
 * Skips node_modules and dot-dirs.
 */
function* walkTsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      yield full;
    }
  }
}

/** Relative path for human-readable offender reports */
function rel(absPath: string): string {
  return absPath.slice(REPO_ROOT.length + 1);
}

/** Regex for procedure definitions of the deleted procedures (whitespace-tolerant) */
const PROCEDURE_DEF_RE =
  /\b(startAuth|pollStatus|submitCode|openOAuthUrl)\s*:\s*publicProcedure\b/;

/** Substrings that must not appear in any renderer file via tRPC */
const DELETED_TRPC_CALLS = [
  "trpc.claudeCode.startAuth",
  "trpc.claudeCode.submitCode",
  "trpc.claudeCode.pollStatus",
  "trpc.claudeCode.openOAuthUrl",
];

/** Regex for direct-fetch bypass of the deleted upstream endpoint */
const DIRECT_FETCH_RE =
  /fetch\s*\([^)]*\/api\/auth\/[^)]*claude-code/;

describe("Phase 0 gate #8: upstream sandbox OAuth removed", () => {
  // ------------------------------------------------------------------
  // Positive controls (assertions 10-11)
  // Fire first to catch wrong-path readFileSync bugs
  // ------------------------------------------------------------------

  test("positive control: claude-code.ts is readable and contains known-persistent symbols", () => {
    const source = readFileSync(CLAUDE_CODE_ROUTER, "utf8");
    expect(source.length).toBeGreaterThan(1000);
    expect(source).toContain("publicProcedure");
    expect(source).toContain("importSystemToken");
  });

  test("positive control: renderer files are readable and non-trivial", () => {
    const onboarding = readFileSync(ONBOARDING_PAGE, "utf8");
    expect(onboarding.length).toBeGreaterThan(1000);

    const modal = readFileSync(LOGIN_MODAL, "utf8");
    expect(modal.length).toBeGreaterThan(1000);
  });

  // ------------------------------------------------------------------
  // Primary layer (assertions 1-5)
  // ------------------------------------------------------------------

  test("assertion 1: no file under src/ contains the upstream endpoint path 'claude-code/start'", () => {
    const offenders: Array<{ file: string; line: number }> = [];
    for (const file of walkTsFiles(SRC_DIR)) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("claude-code/start")) {
          offenders.push({ file: rel(file), line: i + 1 });
        }
      }
    }
    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  - ${o.file}:${o.line}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} reference(s) to upstream endpoint "claude-code/start":\n${report}`,
      );
    }
    expect(offenders.length).toBe(0);
  });

  test("assertion 2: claude-code.ts has no deleted procedure definitions (whitespace-tolerant regex)", () => {
    const source = readFileSync(CLAUDE_CODE_ROUTER, "utf8");
    const lines = source.split("\n");
    const offenders: Array<{ line: number; text: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      if (PROCEDURE_DEF_RE.test(lines[i])) {
        offenders.push({ line: i + 1, text: lines[i].trim() });
      }
    }
    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  - line ${o.line}: ${o.text}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} deleted procedure definition(s) in claude-code.ts:\n${report}`,
      );
    }
    expect(offenders.length).toBe(0);
  });

  test("assertion 3: claude-code.ts does not reference getDesktopToken", () => {
    const source = readFileSync(CLAUDE_CODE_ROUTER, "utf8");
    expect(source).not.toContain("getDesktopToken");
  });

  test("assertion 4: claude-code.ts does not import getApiUrl", () => {
    const source = readFileSync(CLAUDE_CODE_ROUTER, "utf8");
    expect(source).not.toContain('getApiUrl');
  });

  test("assertion 5: no renderer file references deleted tRPC mutations", () => {
    const offenders: Array<{ file: string; line: number; call: string }> = [];
    for (const file of walkTsFiles(RENDERER_DIR)) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        for (const call of DELETED_TRPC_CALLS) {
          if (lines[i].includes(call)) {
            offenders.push({ file: rel(file), line: i + 1, call });
          }
        }
      }
    }
    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  - ${o.file}:${o.line}: ${o.call}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} renderer reference(s) to deleted tRPC mutations:\n${report}`,
      );
    }
    expect(offenders.length).toBe(0);
  });

  // ------------------------------------------------------------------
  // Defense-in-depth layer (assertions 7-9)
  // ------------------------------------------------------------------

  test("assertion 7: no file under src/main/ defines deleted procedures (cross-file router move bypass)", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const file of walkTsFiles(MAIN_DIR)) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (PROCEDURE_DEF_RE.test(lines[i])) {
          offenders.push({
            file: rel(file),
            line: i + 1,
            text: lines[i].trim(),
          });
        }
      }
    }
    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  - ${o.file}:${o.line}: ${o.text}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} deleted procedure definition(s) across src/main/:\n${report}`,
      );
    }
    expect(offenders.length).toBe(0);
  });

  test("assertion 8: no file under src/main/ references getDesktopToken (helper relocation bypass)", () => {
    const offenders: Array<{ file: string; line: number }> = [];
    for (const file of walkTsFiles(MAIN_DIR)) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("getDesktopToken")) {
          offenders.push({ file: rel(file), line: i + 1 });
        }
      }
    }
    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  - ${o.file}:${o.line}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} reference(s) to getDesktopToken across src/main/:\n${report}`,
      );
    }
    expect(offenders.length).toBe(0);
  });

  test("assertion 9: no renderer file contains a direct fetch to the upstream auth endpoint (direct-fetch bypass)", () => {
    const offenders: Array<{ file: string; line: number }> = [];
    for (const file of walkTsFiles(RENDERER_DIR)) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (DIRECT_FETCH_RE.test(lines[i])) {
          offenders.push({ file: rel(file), line: i + 1 });
        }
      }
    }
    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  - ${o.file}:${o.line}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} direct fetch call(s) to upstream auth endpoint in src/renderer/:\n${report}`,
      );
    }
    expect(offenders.length).toBe(0);
  });
});
