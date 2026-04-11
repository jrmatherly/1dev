/**
 * slugify unit tests
 *
 * Covers the happy path, leading/trailing hyphen stripping, length-cap
 * enforcement, and ReDoS payload rejection (defense-in-depth against
 * CodeQL `js/polynomial-redos`, CWE-1333 / CWE-400).
 *
 * The `slugify()` function is used by:
 *   - provisioning.ts: base = `${slugify(userEmail)}-${slugify(teamAlias)}`
 *   - rotation.ts:     baseAlias = slugify(key.teamAlias)
 *   - key-service.ts:  base = slugify(teamAlias)
 *
 * Input length is bounded in production (Entra email max ~255, team aliases
 * from teams.yaml config), but the length cap is a belt-and-suspenders
 * safeguard that eliminates the ReDoS attack class entirely.
 */
import { describe, test, expect } from "bun:test";
import { MAX_SLUG_INPUT_LENGTH, slugify } from "../../src/lib/slugify.js";

describe("slugify — happy path", () => {
  test("lowercases and hyphenates", () => {
    expect(slugify("Engineering Services Team")).toBe(
      "engineering-services-team",
    );
  });

  test("collapses multiple non-alphanumeric characters", () => {
    expect(slugify("foo!!!@@@bar")).toBe("foo-bar");
  });

  test("handles email-like inputs", () => {
    expect(slugify("alice.smith@example.com")).toBe("alice-smith-example-com");
  });

  test("preserves alphanumerics unchanged", () => {
    expect(slugify("abc123")).toBe("abc123");
  });

  test("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  test("returns empty string for all-separator input within the cap", () => {
    expect(slugify("!@#$%^&*()")).toBe("");
  });
});

describe("slugify — leading / trailing hyphen strip", () => {
  test("strips leading hyphens", () => {
    expect(slugify("---leading")).toBe("leading");
  });

  test("strips trailing hyphens", () => {
    expect(slugify("trailing---")).toBe("trailing");
  });

  test("strips both leading and trailing hyphens", () => {
    expect(slugify("---leading-and-trailing---")).toBe("leading-and-trailing");
  });

  test("strips hyphens that emerge from non-alphanumeric collapse", () => {
    expect(slugify("!!!hello!!!world!!!")).toBe("hello-world");
  });
});

describe("slugify — length cap (ReDoS hardening)", () => {
  test("accepts input at exactly MAX_SLUG_INPUT_LENGTH", () => {
    const input = "a".repeat(MAX_SLUG_INPUT_LENGTH);
    expect(() => slugify(input)).not.toThrow();
    expect(slugify(input)).toBe(input);
  });

  test("rejects input one character over the cap", () => {
    const input = "a".repeat(MAX_SLUG_INPUT_LENGTH + 1);
    expect(() => slugify(input)).toThrow(/exceeds 256 characters/);
  });

  test("rejects pathological hyphen payload before the regex runs", () => {
    // Classic ReDoS seed: many repetitions of a character that would cause
    // the regex engine to backtrack. Length cap prevents this from reaching
    // the regex at all.
    const input = "-".repeat(10_000);
    expect(() => slugify(input)).toThrow(/exceeds 256 characters/);
  });

  test("rejects pathological mixed separator payload", () => {
    const input = "!".repeat(100_000);
    expect(() => slugify(input)).toThrow(/exceeds 256 characters/);
  });

  test("error message reports the actual input length", () => {
    const input = "a".repeat(500);
    expect(() => slugify(input)).toThrow(/got 500/);
  });
});

describe("slugify — MAX_SLUG_INPUT_LENGTH constant", () => {
  test("is exported as 256", () => {
    expect(MAX_SLUG_INPUT_LENGTH).toBe(256);
  });
});
