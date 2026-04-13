/**
 * Regression guard against a regression of the aux-AI upstream cutover
 * (Group 14 of remediate-dev-server-findings).
 *
 * The two upstream call sites at chats.ts:1340 and chats.ts:1445 used
 * to fetch apollosai.dev/api/agents/generate-commit-message and
 * apollosai.dev/api/agents/sub-chat/generate-name. These were removed
 * by Group 11 in favor of aux-ai.ts delegation. This guard fails if a
 * future refactor reintroduces the upstream fetch in either chats.ts
 * or aux-ai.ts (the latter must NEVER fetch upstream — it talks to the
 * Anthropic SDK directly, possibly via LiteLLM).
 *
 * Positive control: aux-ai.ts must exist with the expected exports.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const CHATS_PATH = join(REPO_ROOT, "src/main/lib/trpc/routers/chats.ts");
const AUX_AI_PATH = join(REPO_ROOT, "src/main/lib/aux-ai.ts");

// The two endpoints that used to back chats.ts. If either string
// reappears anywhere in chats.ts or aux-ai.ts, this guard fails.
const FORBIDDEN_PATTERNS = [
  /apollosai\.dev\/api\/agents\/generate-commit-message/,
  /apollosai\.dev\/api\/agents\/sub-chat\/generate-name/,
  /api\/agents\/generate-commit-message/,
  /api\/agents\/sub-chat\/generate-name/,
] as const;

describe("no upstream fetch in aux-AI surfaces", () => {
  test("aux-ai.ts exists (positive control)", () => {
    expect(existsSync(AUX_AI_PATH)).toBe(true);
  });

  test("aux-ai.ts has the expected production-binding exports", () => {
    const source = readFileSync(AUX_AI_PATH, "utf8");
    // These are what chats.ts depends on. If they vanish the cutover
    // has been silently undone.
    expect(source).toContain("export const generateChatTitle");
    expect(source).toContain("export const generateCommitMessage");
    expect(source).toContain("export function setOllamaNameGenerator");
  });

  test("chats.ts contains zero references to the upstream agent endpoints", () => {
    const source = readFileSync(CHATS_PATH, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });

  test("aux-ai.ts contains zero references to the upstream agent endpoints", () => {
    const source = readFileSync(AUX_AI_PATH, "utf8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });

  test("aux-ai.ts never fetches an apollosai.dev origin (any path)", () => {
    const source = readFileSync(AUX_AI_PATH, "utf8");
    // Match raw fetch calls and string literals containing the origin.
    expect(source).not.toMatch(/fetch\([^)]*apollosai\.dev/);
    expect(source).not.toMatch(/"https?:\/\/[^"]*apollosai\.dev/);
  });

  test("chats.ts delegates to aux-AI (positive control)", () => {
    const source = readFileSync(CHATS_PATH, "utf8");
    expect(source).toContain('from "../../aux-ai"');
    expect(source).toContain("generateChatTitle");
    // generateCommitMessage is renamed at import to avoid name shadow with the procedure.
    expect(source).toContain("generateCommitMessageViaAuxAi");
  });
});
