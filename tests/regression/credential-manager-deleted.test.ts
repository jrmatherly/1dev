/**
 * Regression guard for ts:check remediation Phase A.
 *
 * `src/main/lib/credential-manager.ts` was deleted on 2026-04-08 as part of
 * the TypeScript error remediation plan. The file was a 890-line orphaned
 * skeleton of a `SourceCredentialManager` class (Google/Slack/Microsoft MCP
 * OAuth credential layer) that was added in the initial commit and never
 * wired up. It had:
 *   - Zero importers anywhere in `src/`
 *   - 9 imports of modules that do not exist in this repo
 *     (../credentials/, ../auth/oauth.ts, ../auth/google-oauth.ts,
 *      ../auth/slack-oauth.ts, ../auth/microsoft-oauth.ts, ../utils/debug.ts,
 *      ./types.ts, ./storage.ts, ../credentials/index.ts)
 *   - 11 TypeScript errors contributing 11/103 to the tscheck baseline
 *
 * Deletion dropped the tscheck count from 103 to 92 with zero runtime risk.
 *
 * If someone re-adds the file (e.g. via a merge from upstream, or as a
 * speculative scaffolding attempt for a credential layer), this test fails
 * and blocks the merge. If a real credential manager is needed later, it
 * should be designed, reviewed, and named differently so this guard stays
 * narrow.
 *
 * A backup of the deleted file is preserved at
 * the project backup directory for reference during any
 * future credential-layer design work.
 *
 * Note: this is a structural / source-level guard, not a runtime check.
 * There is no legitimate code path that exercises this file at runtime, so
 * asserting on its absence at the filesystem level is the only signal
 * available and matches what the gate defends against (re-introduction of
 * the orphaned skeleton).
 *
 * See:
 *   docs/conventions/tscheck-baseline.md §2 R1 (Root Cause 1)
 *   backup copy preserved locally (not tracked)
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const ORPHAN_PATH = join(REPO_ROOT, "src/main/lib/credential-manager.ts");

describe("ts:check remediation Phase A: credential-manager.ts deletion", () => {
  test("src/main/lib/credential-manager.ts does not exist", () => {
    expect(existsSync(ORPHAN_PATH)).toBe(false);
  });
});
