/**
 * Sanitizer for auth-flow errors before they cross the IPC boundary.
 *
 * The main-process `auth:start-flow` IPC handler catches rejections from
 * `AuthManager.startAuthFlow()` and runs them through this helper before
 * shipping to the renderer via `auth:error`. The sanitizer:
 *
 *   1. Maps known error patterns (config-missing, init-failed, MSAL
 *      error codes) to discriminated `AuthError.kind` values that the
 *      renderer can pattern-match for localization.
 *
 *   2. Strips filesystem paths and correlation IDs from the `message`
 *      field. MSAL Node errors from the cache plugin embed paths like
 *      `/Users/<name>/Library/Application Support/.../msal-cache.json`
 *      which would leak into the toast text otherwise.
 *
 *   3. For packaged builds (`isPackaged === true`), replaces dev-facing
 *      text (env-var names, `.env` instructions) with end-user-appropriate
 *      wording ("Contact your administrator"). End users have no `.env`
 *      to edit and instructing them to set MAIN_VITE_ENTRA_CLIENT_ID is confusing.
 *
 *   4. For unknown errors, falls through to a generic
 *      `{ kind: "msal-error", message: "Sign-in failed. Check logs..." }`
 *      so we never ship raw stack traces.
 *
 * Spec contract:
 *   openspec/specs/enterprise-auth-wiring/spec.md →
 *     "Auth error IPC payload is a typed discriminated union"
 */

import type { AuthError } from "../../shared/auth-error-types";
import type { AuthErrorKind } from "../auth-manager";

/**
 * Replace absolute filesystem paths (Unix `/...` and Windows `C:\...`)
 * with a `<path>` placeholder so they don't leak through error messages.
 * Also collapses long correlation-id-looking GUIDs.
 */
function scrubMessage(msg: string): string {
  return msg
    .replace(/\/[A-Za-z0-9_./~-]{8,}/g, "<path>")
    .replace(/[A-Z]:\\[A-Za-z0-9_.\\-]+/g, "<path>")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "<correlation-id>",
    );
}

/**
 * Dev-facing wording for each kind. Used when `isPackaged === false`.
 * Mirrors the default text in `auth-manager.ts:createAuthError`.
 */
const DEV_WORDING: Record<AuthErrorKind, string> = {
  "flag-off":
    "Enterprise auth is not configured. Set MAIN_VITE_ENTRA_CLIENT_ID, MAIN_VITE_ENTRA_TENANT_ID, and MAIN_VITE_ENTERPRISE_AUTH_ENABLED=true in your .env (or use MAIN_VITE_DEV_BYPASS_AUTH=true to skip auth in dev).",
  "config-missing":
    "Enterprise auth is enabled but MAIN_VITE_ENTRA_CLIENT_ID and/or MAIN_VITE_ENTRA_TENANT_ID environment variables are unset. Check your .env.",
  "init-failed":
    "Enterprise auth (MSAL) initialization failed. See the main-process console for details.",
  "msal-error": "Sign-in failed. See logs for details.",
};

/**
 * End-user-facing wording for each kind. Used when `isPackaged === true`.
 * Avoids env-var names, `.env` references, and any developer-only jargon.
 */
const END_USER_WORDING: Record<AuthErrorKind, string> = {
  "flag-off":
    "Enterprise sign-in isn't configured for this build. Contact your administrator.",
  "config-missing":
    "Enterprise sign-in isn't configured for this build. Contact your administrator.",
  "init-failed":
    "Enterprise sign-in failed to initialize. Try restarting the app, then contact your administrator if the problem persists.",
  "msal-error":
    "Sign-in failed. Try again, then contact your administrator if the problem persists.",
};

/**
 * Convert a thrown error from `AuthManager.startAuthFlow()` into the
 * discriminated `AuthError` object the renderer expects.
 *
 * Read the `authKind` field tagged by `createAuthError` in auth-manager.ts
 * if present. Otherwise infer kind from the message body. Falls back to
 * `"msal-error"` for anything unrecognized.
 */
export function formatAuthError(err: unknown, isPackaged: boolean): AuthError {
  // Tagged errors from createAuthError are the happy path — kind is known.
  let kind: AuthErrorKind = "msal-error";
  let originalMessage = "";

  if (err instanceof Error) {
    originalMessage = err.message;
    const tagged = err as Error & { authKind?: AuthErrorKind };
    if (
      tagged.authKind === "flag-off" ||
      tagged.authKind === "config-missing" ||
      tagged.authKind === "init-failed" ||
      tagged.authKind === "msal-error"
    ) {
      kind = tagged.authKind;
    } else if (
      originalMessage.includes("ENTRA_CLIENT_ID") ||
      originalMessage.includes("ENTRA_TENANT_ID")
    ) {
      kind = "config-missing";
    }
  } else {
    originalMessage = String(err);
  }

  const wording = isPackaged ? END_USER_WORDING : DEV_WORDING;
  // For packaged builds we always show the canned end-user text. For dev
  // builds we prefer the canned dev wording too — the original error is
  // logged separately at the source — so the user-visible string never
  // includes raw cache paths or stack frames.
  const message = wording[kind];

  // Cross-reference the original (scrubbed) message to logs in dev for
  // debuggability — this never crosses the IPC boundary.
  if (!isPackaged && originalMessage) {
    console.debug(
      `[formatAuthError] kind=${kind} original=${scrubMessage(originalMessage)}`,
    );
  }

  return { kind, message };
}
