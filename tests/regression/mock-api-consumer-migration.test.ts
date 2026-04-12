/**
 * Regression guard for the migrate-mock-api-consumers OpenSpec change (Phase 2).
 *
 * Phase 2 removed the `api.agents.*` wrapper layer from `mock-api.ts` and ported
 * 6 consumer files to call `trpc.chats.*` directly. The JSON message-parsing
 * pipeline was extracted into `src/renderer/lib/message-parser.ts`.
 *
 * This guard has three checks:
 *
 * 1. **Migrated consumer files do not import from mock-api.ts** — verifies the
 *    migration actually happened. The 6 consumer files must NOT have any
 *    `from .*mock-api` imports.
 *
 * 2. **Migrated consumer files do not use api.agents.* or api.useUtils** —
 *    catches regressions where someone re-introduces the wrapper.
 *
 * 3. **mock-api.ts does not contain the agents: block or useUtils method** —
 *    ensures Phase 2 cleanup is preserved. These were removed; only F-entry
 *    stubs remain.
 *
 * See: openspec/changes/migrate-mock-api-consumers/proposal.md
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");

/**
 * The 6 consumer files that were migrated in Phase 2.
 */
const MIGRATED_CONSUMERS = [
  "src/renderer/features/agents/main/active-chat.tsx",
  "src/renderer/features/agents/ui/sub-chat-selector.tsx",
  "src/renderer/features/agents/ui/agents-content.tsx",
  "src/renderer/features/agents/mentions/agents-file-mention.tsx",
  "src/renderer/features/agents/ui/agent-diff-view.tsx",
  "src/renderer/features/sidebar/agents-subchats-sidebar.tsx",
];

describe("migrate-mock-api-consumers: Phase 2 migration guard", () => {
  test("migrated consumer files do not import from mock-api.ts", () => {
    for (const relPath of MIGRATED_CONSUMERS) {
      const content = readFileSync(join(REPO_ROOT, relPath), "utf-8");
      // Match: import { ... } from "../path/mock-api" or './mock-api' etc.
      const importMatches =
        content.match(/from\s+["'][^"']*mock-api["']/g) || [];
      if (importMatches.length > 0) {
        throw new Error(
          `${relPath} must not import from mock-api.ts but found: ${importMatches.join(", ")}`,
        );
      }
      expect(importMatches).toHaveLength(0);
    }
  });

  test("migrated consumer files do not use api.agents.* or api.useUtils", () => {
    // Patterns that indicate un-migrated mock-api consumption.
    // These would be caught by TS, but the regression guard ensures they
    // do not silently re-appear even if the file were to re-import mock-api.
    const forbiddenPatterns = [
      /\bapi\.agents\./g,
      /\bapi\.useUtils\b/g,
      /\butils\.agents\./g,
    ];

    for (const relPath of MIGRATED_CONSUMERS) {
      const content = readFileSync(join(REPO_ROOT, relPath), "utf-8");
      for (const pattern of forbiddenPatterns) {
        const matches = content.match(pattern) || [];
        if (matches.length > 0) {
          throw new Error(
            `${relPath} must not contain ${pattern.source} but found ${matches.length} match(es)`,
          );
        }
      }
    }
  });

  test("mock-api.ts does not contain the agents: block or useUtils method", () => {
    const mockApi = readFileSync(
      join(REPO_ROOT, "src/renderer/lib/mock-api.ts"),
      "utf-8",
    );

    // The migrated blocks should be gone. F-entry stubs (teams, stripe, etc.)
    // are allowed and intentionally preserved.
    const forbiddenKeys = [
      /^\s{2}agents:\s*\{/m, // top-level `  agents: {` (exactly 2-space indent = root property)
      /^\s{2}useUtils:/m, // top-level `  useUtils:` method
      /^\s{2}usage:\s*\{/m, // top-level `  usage: {` — also migrated
    ];

    for (const pattern of forbiddenKeys) {
      const matches = mockApi.match(pattern) || [];
      if (matches.length > 0) {
        throw new Error(
          `mock-api.ts must not contain ${pattern.source} but found: ${matches.join(", ")}`,
        );
      }
    }
  });

  test("mock-api.ts does not import from codex-tool-normalizer", () => {
    const mockApi = readFileSync(
      join(REPO_ROOT, "src/renderer/lib/mock-api.ts"),
      "utf-8",
    );

    // normalizeCodexToolPart moved to message-parser.ts in Phase 2.
    // mock-api.ts should no longer import it.
    const importMatch = mockApi.match(/normalizeCodexToolPart/);
    expect(importMatch).toBeNull();
  });

  test("message-parser.ts exports the migrated helpers", () => {
    const messageParser = readFileSync(
      join(REPO_ROOT, "src/renderer/lib/message-parser.ts"),
      "utf-8",
    );

    // Verify the helper exports exist.
    expect(messageParser).toMatch(/export function parseSubChatMessages/);
    expect(messageParser).toMatch(/export function normalizeMessageParts/);
    expect(messageParser).toMatch(
      /export function parseAndNormalizeSubChatMessages/,
    );
    expect(messageParser).toMatch(/export function parseAndNormalizeChat/);
  });
});
