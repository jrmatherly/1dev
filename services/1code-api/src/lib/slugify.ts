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
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
