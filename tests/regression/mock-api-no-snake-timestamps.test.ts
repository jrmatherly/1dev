/**
 * Regression guard for the retire-mock-api-translator OpenSpec change (Phase 1).
 *
 * The `mock-api.ts` translator previously converted camelCase Drizzle timestamps
 * (`createdAt`, `updatedAt`) into snake_case (`created_at`, `updated_at`) to
 * match the dead upstream `21st.dev` API shape. Phase 1 removed this translation
 * so consumers read the native Drizzle shape directly, gaining compile-time type
 * safety (`Date | null` instead of `any`).
 *
 * This guard has two test cases:
 *
 * 1. **mock-api.ts clean** — asserts that the timestamp translation lines
 *    (`created_at:` / `updated_at:` as object-key syntax) do not reappear in
 *    `src/renderer/lib/mock-api.ts`. Other snake_case keys (`stream_id:`,
 *    `sandbox_id:`, `meta:`) are intentional F1/upstream-feature fossils and
 *    are NOT checked here.
 *
 * 2. **Consumer-side scan** — asserts that migrated consumer files do not
 *    contain `.created_at`, `.updated_at`, `created_at:`, or `updated_at:`
 *    patterns. An allowlist exempts F1/F2 boundary files that intentionally
 *    retain snake_case to match the dead upstream API contract:
 *      - `agents-sidebar.tsx` (F1 remote chat translation)
 *      - `active-chat.tsx` (F1 chatSourceMode === "sandbox" block)
 *      - `automations-detail-view.tsx` (F2 fossil-by-design)
 *      - `archive-popover.tsx` (F1 remote archived chats)
 *      - `remote-types.ts` (upstream API type contract)
 *
 * See: openspec/changes/retire-mock-api-translator/proposal.md
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");

describe("retire-mock-api-translator: timestamp fossil guard", () => {
  test("mock-api.ts does not contain created_at: or updated_at: timestamp translations", () => {
    const mockApi = readFileSync(
      join(REPO_ROOT, "src/renderer/lib/mock-api.ts"),
      "utf-8",
    );

    // Match object-key syntax: `created_at:` and `updated_at:` (with the colon)
    // This catches both `created_at: sc.createdAt` and `created_at: someValue`
    const createdAtKeys = mockApi.match(/created_at\s*:/g) || [];
    const updatedAtKeys = mockApi.match(/updated_at\s*:/g) || [];

    expect(createdAtKeys).toHaveLength(0);
    expect(updatedAtKeys).toHaveLength(0);
  });

  test("migrated consumer files do not contain snake_case timestamp patterns (F1/F2 allowlist exempted)", () => {
    // Files that were migrated to camelCase — should have ZERO snake_case timestamp references
    const migratedFiles = [
      "src/renderer/features/agents/ui/sub-chat-selector.tsx",
      "src/renderer/features/agents/ui/mobile-chat-header.tsx",
      "src/renderer/features/agents/components/subchats-quick-switch-dialog.tsx",
      "src/renderer/features/agents/components/agents-quick-switch-dialog.tsx",
      "src/renderer/features/sidebar/agents-subchats-sidebar.tsx",
      "src/renderer/features/agents/stores/sub-chat-store.ts",
      "src/renderer/features/agents/ui/agents-content.tsx",
    ];

    // Patterns that indicate un-migrated snake_case timestamp access
    const snakePatterns = [
      /\.created_at/g,
      /\.updated_at/g,
      /created_at\s*:/g,
      /updated_at\s*:/g,
    ];

    for (const relPath of migratedFiles) {
      const content = readFileSync(join(REPO_ROOT, relPath), "utf-8");
      for (const pattern of snakePatterns) {
        const matches = content.match(pattern) || [];
        if (matches.length > 0) {
          throw new Error(
            `${relPath} should not contain ${pattern.source} but found ${matches.length} match(es)`,
          );
        }
      }
    }
  });
});
