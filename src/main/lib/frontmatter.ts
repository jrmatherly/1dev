import fm from "front-matter";

/**
 * Canonical frontmatter parser for main-process code.
 *
 * Thin wrapper around `front-matter` that exposes a `{ data, content }` shape
 * matching the former `gray-matter` API. Replaced `gray-matter@4.0.3` on
 * 2026-04-11 to eliminate the Rollup dynamic-code-evaluation warning from
 * `gray-matter/lib/engines.js`.
 *
 * **Rule**: no main-process code outside this file may import `front-matter`,
 * `gray-matter`, `vfile-matter`, or `js-yaml` directly for frontmatter parsing.
 * Enforced by `tests/regression/no-gray-matter.test.ts`.
 *
 * **Generic default**: `Record<string, unknown>`, not `any`. Consumers must
 * narrow property types before use (e.g., `typeof data.name === "string"`).
 */
export function matter<T extends Record<string, unknown> = Record<string, unknown>>(
  content: string,
): { data: T; content: string } {
  const { attributes, body } = fm<T>(content);
  return { data: attributes, content: body };
}
