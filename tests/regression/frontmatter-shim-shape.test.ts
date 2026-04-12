/**
 * Unit test: canonical frontmatter shim shape and behavior.
 *
 * Verifies that `src/main/lib/frontmatter.ts` (the canonical wrapper around
 * `front-matter`) returns a `{ data, content }` shape compatible with the
 * former `gray-matter` API across the input variations the consumers in
 * `src/main/lib/trpc/routers/{commands,plugins,skills,agent-utils}.ts`
 * actually pass.
 *
 * Cases:
 *   1. Standard YAML frontmatter — `--- key: value --- body`
 *   2. Empty-frontmatter input — body without delimiters
 *   3. Empty-string input — must not throw
 *   4. BOM-prefixed input — front-matter must handle the UTF-8 BOM
 *   5. Sample agent fixture — exercises the parseAgentMd consumer shape
 *
 * Source: OpenSpec change `replace-gray-matter-with-front-matter` §8.
 * Shim: `src/main/lib/frontmatter.ts`
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { matter } from "../../src/main/lib/frontmatter";

const FIXTURE_PATH = join(
  import.meta.dir,
  "..",
  "fixtures",
  "sample-agent.md",
);

describe("frontmatter shim shape", () => {
  test("standard YAML frontmatter parses to { data, content }", () => {
    const input = `---
key: value
count: 42
---
body content`;
    const result = matter(input);
    expect(result.data).toEqual({ key: "value", count: 42 });
    // front-matter strips the delimiters and the leading newline of the body
    expect(result.content.trim()).toBe("body content");
  });

  test("input without frontmatter delimiters returns empty data and the full body", () => {
    const input = "just a plain body, no frontmatter";
    const result = matter(input);
    expect(result.data).toEqual({});
    expect(result.content).toBe("just a plain body, no frontmatter");
  });

  test("empty string input does not throw and returns a valid shape", () => {
    const result = matter("");
    expect(result).toBeDefined();
    expect(result.data).toEqual({});
    expect(typeof result.content).toBe("string");
  });

  test("BOM-prefixed input parses correctly", () => {
    const input = `\uFEFF---
key: value
---
body`;
    const result = matter(input);
    expect(result.data).toEqual({ key: "value" });
    expect(result.content.trim()).toBe("body");
  });

  test("sample-agent.md fixture parses into the parseAgentMd consumer shape", () => {
    const content = readFileSync(FIXTURE_PATH, "utf-8");
    const result = matter<{
      name?: string;
      description?: string;
      tools?: string;
      disallowedTools?: string;
      model?: string;
    }>(content);

    // Frontmatter fields parseAgentMd reads
    expect(typeof result.data.name).toBe("string");
    expect(result.data.name).toBe("sample-agent");
    expect(typeof result.data.description).toBe("string");
    expect(result.data.description).toContain("sample agent fixture");
    expect(typeof result.data.tools).toBe("string");
    expect(result.data.tools).toBe("Read, Edit, Bash");
    expect(typeof result.data.disallowedTools).toBe("string");
    expect(result.data.disallowedTools).toBe("WebFetch");
    expect(typeof result.data.model).toBe("string");
    expect(result.data.model).toBe("sonnet");

    // Body becomes the prompt after trim
    const prompt = result.content.trim();
    expect(prompt).toContain("You are a sample agent");
    expect(prompt).toContain("multiple paragraphs");
  });
});
