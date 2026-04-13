/**
 * Regression guard: `migrateLegacy` mutation and its callers are deleted.
 *
 * The migration path from `claude_code_credentials` to `anthropic_accounts`
 * resurrected deleted accounts on every render in the settings UI. It is a
 * greenfield project with no legacy data to migrate, so the mutation and
 * its matching renderer useEffect were removed.
 *
 * Re-introducing either would revive the "Account removed" → phantom-account
 * bug. See openspec/changes/add-dual-mode-llm-routing/specs/claude-code-auth-import/spec.md
 * (REMOVED Requirements) for the full rationale.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const ANTHROPIC_ACCOUNTS = path.join(
  import.meta.dir,
  "../../src/main/lib/trpc/routers/anthropic-accounts.ts",
);
const AGENTS_MODELS_TAB = path.join(
  import.meta.dir,
  "../../src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx",
);
const RENDERER_DIR = path.join(import.meta.dir, "../../src/renderer");

function walk(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      files.push(full);
    }
  }
  return files;
}

describe("migrateLegacy mutation is fully removed", () => {
  test("no procedure named migrateLegacy in anthropic-accounts router", () => {
    const content = readFileSync(ANTHROPIC_ACCOUNTS, "utf-8");
    // Disallow both the procedure definition and any re-introduction under
    // a different casing.
    expect(content).not.toMatch(/\bmigrateLegacy:\s*publicProcedure/);
    expect(content).not.toMatch(/\bmigrateLegacy\s*=\s*publicProcedure/);
  });

  test("agents-models-tab has no migrateLegacy useEffect or mutation handle", () => {
    const content = readFileSync(AGENTS_MODELS_TAB, "utf-8");
    expect(content).not.toContain("trpc.anthropicAccounts.migrateLegacy");
    expect(content).not.toMatch(/migrateLegacy\.mutate\b/);
    expect(content).not.toMatch(/migrateLegacy\.useMutation/);
  });

  test("no renderer file references trpc.anthropicAccounts.migrateLegacy", () => {
    const offenders: string[] = [];
    for (const file of walk(RENDERER_DIR)) {
      const content = readFileSync(file, "utf-8");
      if (content.includes("trpc.anthropicAccounts.migrateLegacy")) {
        offenders.push(path.relative(RENDERER_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
