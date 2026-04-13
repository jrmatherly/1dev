/**
 * Regression guard: getClaudeCodeToken returns null for BYOK active account.
 *
 * Enforces openspec/specs/claude-code-auth-import/spec.md — "Requirement:
 * getClaudeCodeToken returns null when active account is BYOK". Without
 * the early-return branch, a user who switches from a Claude subscription
 * to BYOK (creating a new anthropicAccounts row with accountType='byok'
 * and NULL oauthToken) would have getClaudeCodeToken() fall through to
 * the legacy `claudeCodeCredentials` table and inject stale OAuth into
 * their BYOK spawn.
 *
 * This is a shape guard matching the project's grep-based regression
 * convention. The runtime fixture scenario (active BYOK row + populated
 * legacy row) is validated manually per the parent change's §18 smoke.
 *
 * Part of the remediate-dev-server-findings OpenSpec change (Finding A-I1).
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const CLAUDE_ROUTER_PATH = join(
  REPO_ROOT,
  "src",
  "main",
  "lib",
  "trpc",
  "routers",
  "claude.ts",
);

describe("getClaudeCodeToken BYOK null-return shape", () => {
  const source = readFileSync(CLAUDE_ROUTER_PATH, "utf8");

  test("claude.ts exists and defines getClaudeCodeToken", () => {
    expect(source).toContain("function getClaudeCodeToken");
  });

  test("has an early-return branch for accountType === 'byok'", () => {
    // The branch must compare against the literal string "byok" (not a
    // broader pattern like `accountType !== 'claude-subscription'` which
    // would have different semantics if a third account type is added).
    expect(source).toMatch(/account\.accountType\s*===\s*["']byok["']/);
  });

  test("the BYOK branch returns null unconditionally", () => {
    // Confirm that the `if (account && account.accountType === "byok")`
    // block's body contains a `return null` statement — the branch
    // must not fall through to any other path.
    const byokBranchRegex =
      /if\s*\(\s*account\s*&&\s*account\.accountType\s*===\s*["']byok["']\s*\)\s*\{[^}]*return\s+null/s;
    expect(source).toMatch(byokBranchRegex);
  });

  test("the BYOK branch runs BEFORE the legacy claudeCodeCredentials fallback in getClaudeCodeToken", () => {
    const byokIdx = source.search(
      /account\.accountType\s*===\s*["']byok["']/,
    );
    // Find the fallback site specifically — the `.from(claudeCodeCredentials)`
    // in the legacy-table SELECT that getClaudeCodeToken falls through to.
    // indexOf would land on the import; using the `.from(...)` call-site
    // narrows to the fallback query.
    const fallbackIdx = source.indexOf(".from(claudeCodeCredentials)");
    expect(byokIdx).toBeGreaterThan(0);
    expect(fallbackIdx).toBeGreaterThan(0);
    // The BYOK branch must source-order BEFORE the legacy fallback query.
    expect(byokIdx).toBeLessThan(fallbackIdx);
  });
});
