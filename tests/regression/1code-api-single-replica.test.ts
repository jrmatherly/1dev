/**
 * Single-replica regression guard for 1code-api.
 *
 * Per Decision 10 in
 * openspec/changes/add-1code-api-litellm-provisioning/design.md, the
 * deprovisioning + rotation crons are stateless but NOT safe to run
 * concurrently across multiple 1code-api replicas:
 *
 *   A naive scale-up from replicas: 1 to replicas: 3 would cause every
 *   cron run to fire three times in parallel, producing:
 *     (a) triplicate audit rows,
 *     (b) triplicate LiteLLM delete-then-create sequences on the same
 *         expired key (one winner, two failures),
 *     (c) potential uq_user_team collisions during race-y provision calls.
 *
 * This test parses the helmrelease.yaml and asserts that the controllers
 * section pins replicas to exactly 1 until distributed-lock machinery is
 * added (tracked in the roadmap).
 *
 * Source change: add-1code-api-litellm-provisioning task 9.8.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HELMRELEASE_PATH = join(
  __dirname,
  "..",
  "..",
  "deploy",
  "kubernetes",
  "1code-api",
  "app",
  "helmrelease.yaml",
);

/**
 * Minimal regex-based extractor to avoid pulling a YAML parser into the
 * regression-guard dependency surface. The guard is intentionally scoped
 * to exactly the `1code-api:` controller block and its `replicas:` field.
 *
 * Pattern:
 *   1code-api:
 *     replicas: N
 *
 * Whitespace-tolerant but structure-sensitive — looks for `replicas:` as
 * the FIRST property inside the `1code-api:` block. If the helmrelease
 * ever restructures so replicas is no longer the first field, this guard
 * needs to be updated (the updated location is still enforceable as long
 * as the grep pattern is adjusted).
 */
function extractReplicas(yamlText: string): number | null {
  const match = yamlText.match(/^\s*1code-api:\s*\n\s*replicas:\s*(\d+)/m);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

describe("1code-api single-replica enforcement", () => {
  test("helmrelease.yaml pins controllers['1code-api'].replicas = 1", () => {
    const raw = readFileSync(HELMRELEASE_PATH, "utf-8");
    const replicas = extractReplicas(raw);

    if (replicas === null) {
      throw new Error(
        `Could not find 'replicas:' under the '1code-api:' controller block ` +
          `in ${HELMRELEASE_PATH}. The 1code-api-single-replica regression ` +
          `guard expects replicas to be the first field. If you restructured ` +
          `the helmrelease, update this guard to match the new location.`,
      );
    }

    if (replicas !== 1) {
      throw new Error(
        `1code-api replicas must equal 1 per Decision 10 of ` +
          `add-1code-api-litellm-provisioning. The deprovisioning + rotation ` +
          `crons are not safe for concurrent execution and will produce ` +
          `duplicate audit rows / LiteLLM mutations if scaled above 1. ` +
          `Current value: ${replicas}. Until distributed-lock machinery is ` +
          `added, this field must remain pinned to 1.`,
      );
    }

    expect(replicas).toBe(1);
  });
});
