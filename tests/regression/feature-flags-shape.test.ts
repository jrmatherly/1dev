/**
 * Regression guard for Phase 0 hard gate #12.
 *
 * The feature flag infrastructure (src/main/lib/feature-flags.ts and the
 * feature_flag_overrides Drizzle table) is the foundation that every
 * subsequent auth migration gate depends on. If the structural pieces
 * disappear — the migration, the helper file, the tRPC mount, or any of
 * the four required default flag keys — this test fails and blocks the
 * merge.
 *
 * This is a STRUCTURAL guard, not a runtime behavior test. Runtime
 * behavior (reads and writes against a real DB) is deferred to future
 * integration tests once a test harness for Electron's better-sqlite3
 * exists. The structural guard catches the most common regressions:
 * someone renaming a flag key, someone removing the router mount during
 * a refactor, or someone forgetting to generate the migration after
 * editing the schema.
 *
 * Spec contract:
 *   openspec/changes/add-feature-flag-infrastructure/specs/feature-flags/spec.md
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const SCHEMA_PATH = join(REPO_ROOT, "src/main/lib/db/schema/index.ts");
const FEATURE_FLAGS_PATH = join(REPO_ROOT, "src/main/lib/feature-flags.ts");
const ROUTER_PATH = join(
  REPO_ROOT,
  "src/main/lib/trpc/routers/feature-flags.ts",
);
const APP_ROUTER_PATH = join(
  REPO_ROOT,
  "src/main/lib/trpc/routers/index.ts",
);
const MIGRATIONS_DIR = join(REPO_ROOT, "drizzle");

// The four required default flag keys. These are load-bearing for Phase 0
// and Phase 1 work — silently renaming one breaks the downstream gates
// that read from it (notably Gate #8 for enterpriseAuthEnabled).
const REQUIRED_FLAG_KEYS = [
  "enterpriseAuthEnabled",
  "voiceViaLiteLLM",
  "changelogSelfHosted",
  "automationsSelfHosted",
] as const;

describe("Phase 0 gate #12: feature flag infrastructure", () => {
  test("Drizzle schema declares the featureFlagOverrides table", () => {
    const source = readFileSync(SCHEMA_PATH, "utf8");
    expect(source).toContain("featureFlagOverrides");
    expect(source).toContain('sqliteTable("feature_flag_overrides"');
    // The three required columns.
    expect(source).toContain('text("key")');
    expect(source).toContain('text("value")');
    expect(source).toContain('integer("updated_at"');
  });

  test("a Drizzle migration exists that creates feature_flag_overrides", () => {
    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.endsWith(".sql"),
    );
    expect(migrationFiles.length).toBeGreaterThan(0);
    // Find the migration that mentions feature_flag_overrides.
    const hasCreateTable = migrationFiles.some((filename) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      return (
        sql.includes("CREATE TABLE") && sql.includes("feature_flag_overrides")
      );
    });
    expect(hasCreateTable).toBe(true);
  });

  test("feature-flags.ts module exposes the public API", () => {
    const source = readFileSync(FEATURE_FLAGS_PATH, "utf8");
    // The source of truth const map.
    expect(source).toContain("FLAG_DEFAULTS");
    expect(source).toContain("as const");
    // The four public helpers.
    expect(source).toContain("export function getFlag");
    expect(source).toContain("export function setFlag");
    expect(source).toContain("export function clearFlag");
    expect(source).toContain("export function getAllFlagsWithSources");
    // The typed key alias.
    expect(source).toContain("export type FeatureFlagKey");
  });

  test("FLAG_DEFAULTS contains all four required keys", () => {
    const source = readFileSync(FEATURE_FLAGS_PATH, "utf8");
    for (const key of REQUIRED_FLAG_KEYS) {
      // Each key must appear followed by a colon (as a map entry),
      // not just somewhere in a comment or docstring.
      const pattern = new RegExp(`\\b${key}\\s*:`);
      expect(source).toMatch(pattern);
    }
  });

  test("tRPC router exposes list/get/set/clear procedures", () => {
    const source = readFileSync(ROUTER_PATH, "utf8");
    expect(source).toContain("featureFlagsRouter");
    expect(source).toContain("list: publicProcedure.query");
    expect(source).toContain("get: publicProcedure");
    expect(source).toContain("set: publicProcedure");
    expect(source).toContain("clear: publicProcedure");
  });

  test("createAppRouter mounts the featureFlags router", () => {
    const source = readFileSync(APP_ROUTER_PATH, "utf8");
    expect(source).toContain("featureFlagsRouter");
    expect(source).toContain("featureFlags: featureFlagsRouter");
  });
});
