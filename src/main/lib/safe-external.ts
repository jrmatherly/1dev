/**
 * Safe wrapper around shell.openExternal that validates URL schemes.
 *
 * All shell.openExternal() calls in the main process MUST go through this
 * module. Direct calls to shell.openExternal() are forbidden outside this file.
 * Enforced by tests/regression/open-external-scheme.test.ts.
 */

import { shell } from "electron";

const ALLOWED_SCHEMES = new Set(["https:", "http:", "mailto:"]);

/**
 * Open a URL in the default browser, restricted to safe schemes.
 * Throws if the URL uses a disallowed scheme (file:, javascript:, custom protocols, etc.)
 */
export async function safeOpenExternal(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `safeOpenExternal blocked: invalid URL "${url.slice(0, 100)}"`,
    );
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(
      `safeOpenExternal blocked: scheme "${parsed.protocol}" not allowed (only https:, http:, mailto:)`,
    );
  }

  await shell.openExternal(url);
}
