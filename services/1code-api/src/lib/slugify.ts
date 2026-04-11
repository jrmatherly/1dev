/**
 * Convert a string to a URL-safe kebab-case slug.
 *
 * Used for generating `key_alias` values in LiteLLM so keys are identifiable
 * in the LiteLLM dashboard (e.g., "Engineering Services Team" → "engineering-services-team").
 *
 * Transformation steps:
 * 1. Lowercase
 * 2. Replace non-alphanumeric sequences with a single hyphen
 * 3. Strip leading/trailing hyphens
 *
 * ## ReDoS hardening
 *
 * Inputs are capped at {@link MAX_SLUG_INPUT_LENGTH} characters so pathological
 * payloads cannot reach the regex engine (belt-and-suspenders against
 * `js/polynomial-redos`, CWE-1333 / CWE-400). The leading / trailing hyphen
 * strip is also split into two anchored `.replace()` calls instead of a
 * single `/^-+|-+$/g` alternation — CodeQL considers the alternation
 * ambiguous even though the anchors make it linear in practice.
 */
export const MAX_SLUG_INPUT_LENGTH = 256;

export function slugify(input: string): string {
  if (input.length > MAX_SLUG_INPUT_LENGTH) {
    throw new Error(
      `slugify: input exceeds ${MAX_SLUG_INPUT_LENGTH} characters (got ${input.length})`,
    );
  }
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}
