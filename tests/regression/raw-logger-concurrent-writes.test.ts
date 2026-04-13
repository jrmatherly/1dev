/**
 * Regression guard: raw-logger concurrent-write safety (shape test).
 *
 * Enforces the singleton-promise contract from the observability-logging
 * capability spec (openspec/specs/observability-logging/spec.md) — the
 * module-scoped state that prior to this change would drop first-burst
 * writes (`let logsDir: string | null` + imperative mkdir) has been
 * replaced with a `Promise<string> | null` singleton that concurrent
 * callers share.
 *
 * This is a shape guard (matches the project's grep-based regression-
 * guard convention) rather than a runtime concurrency test: the prior
 * pattern was identifiable as `logsDir = null` / `logsDir = join(...)`
 * source text, so its reintroduction is detectable by pattern-match.
 * The runtime concurrency behavior is verified manually per the
 * manual-smoke tasks in the parent change's tasks.md §18.
 *
 * Part of the remediate-dev-server-findings OpenSpec change (Finding A).
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const RAW_LOGGER_PATH = join(
  REPO_ROOT,
  "src",
  "main",
  "lib",
  "claude",
  "raw-logger.ts",
);

describe("raw-logger singleton-promise shape", () => {
  const source = readFileSync(RAW_LOGGER_PATH, "utf8");

  test("raw-logger.ts exists and exports logRawClaudeMessage", () => {
    expect(source).toContain("export async function logRawClaudeMessage");
  });

  test("uses singleton-promise pattern (logsDirPromise)", () => {
    expect(source).toMatch(/let\s+logsDirPromise\s*:\s*Promise<string>\s*\|\s*null/);
  });

  test("does NOT reintroduce the stale imperative pattern", () => {
    // Prior to this fix: `let logsDir: string | null = null` followed by
    // `if (!logsDir) { logsDir = ...; await mkdir(logsDir, ...); }`.
    // The singleton-promise replacement should not coexist with the old
    // module-scoped `let logsDir` binding (separate from the inner
    // `const dir = join(...)` inside the promise factory).
    expect(source).not.toMatch(/let\s+logsDir\s*:\s*string\s*\|\s*null/);
  });

  test("resets the stored promise to null on rejection", () => {
    // The .catch handler must set logsDirPromise = null so a later call
    // can retry (contract from the observability-logging spec,
    // "Failure recovery resets the cache" scenario).
    expect(source).toMatch(/logsDirPromise\s*=\s*null/);
  });

  test("ensureLogsDir returns the singleton promise", () => {
    expect(source).toMatch(/return\s+logsDirPromise/);
  });
});
