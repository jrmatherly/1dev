/**
 * Regression guard for the Graph /me/photo/$value data-URL construction.
 *
 * The photo blob must be converted to a `data:<content-type>;base64,...`
 * URL suitable for direct `<img src>` consumption by the renderer. If
 * the base64 encoding or the data-URL prefix drift, the Account tab's
 * avatar silently breaks.
 *
 * Shape-based per project convention: bun:test cannot load the Electron
 * runtime for runtime fetch-mocking, so this guard scans the source for
 * the load-bearing expressions that produce the data URL. A complementary
 * unit test of `deriveInitials` + `hashOid` lives next to the component.
 *
 * Motivated by: add-entra-graph-profile, spec scenario
 *   "Profile with photo returns full GraphProfile including avatarDataUrl"
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const GRAPH_PROFILE = join(REPO_ROOT, "src/main/lib/graph-profile.ts");
const AVATAR_COMPONENT = join(
  REPO_ROOT,
  "src/renderer/components/ui/avatar-with-initials.tsx",
);

function readGraphProfile(): string {
  return readFileSync(GRAPH_PROFILE, "utf-8");
}
function readAvatarComponent(): string {
  return readFileSync(AVATAR_COMPONENT, "utf-8");
}

describe("graph avatar data-URL shape", () => {
  test("photo blob is base64-encoded via Buffer.from(...).toString('base64')", () => {
    const source = readGraphProfile();
    expect(source).toMatch(
      /Buffer\.from\(\s*arrayBuffer\s*\)\.toString\(\s*["']base64["']\s*\)/,
    );
  });

  test("data URL is built as `data:<content-type>;base64,<base64>`", () => {
    const source = readGraphProfile();
    // Template literal producing the canonical shape.
    expect(source).toMatch(/data:\$\{contentType\};base64,\$\{base64\}/);
  });

  test("content-type falls back to image/jpeg when the header is missing", () => {
    const source = readGraphProfile();
    expect(source).toMatch(
      /response\.headers\.get\(\s*["']content-type["']\s*\)\s*\?\?\s*["']image\/jpeg["']/,
    );
  });

  test("arrayBuffer is read from the fetch response before base64 conversion", () => {
    const source = readGraphProfile();
    expect(source).toContain("response.arrayBuffer()");
  });
});

describe("avatar-with-initials component shape", () => {
  test("exports AvatarWithInitials and AvatarWithInitialsProps", () => {
    const source = readAvatarComponent();
    expect(source).toContain("export interface AvatarWithInitialsProps");
    expect(source).toContain("export function AvatarWithInitials");
  });

  test("props include avatarDataUrl, displayName, email, oid, and size", () => {
    const source = readAvatarComponent();
    expect(source).toMatch(/avatarDataUrl:\s*string\s*\|\s*null/);
    expect(source).toMatch(/displayName:\s*string/);
    expect(source).toMatch(/email:\s*string\s*\|\s*null/);
    expect(source).toMatch(/oid:\s*string/);
    expect(source).toMatch(/size\?:\s*["']sm["']\s*\|\s*["']md["']\s*\|\s*["']lg["']/);
  });

  test("non-null avatarDataUrl renders an <img src={avatarDataUrl}>", () => {
    const source = readAvatarComponent();
    // The <img> tag must use the prop directly — no encoding transform,
    // since the /me/photo/$value helper already produced a data URL.
    expect(source).toMatch(/<img[\s\S]*src=\{avatarDataUrl\}/);
  });

  test("null avatarDataUrl renders initials on a hashed HSL background", () => {
    const source = readAvatarComponent();
    // Initials derivation + deterministic hue are both required.
    expect(source).toContain("deriveInitials");
    expect(source).toContain("hashOid");
    expect(source).toMatch(/hsl\(\$\{hue\}/);
  });

  test("hashOid uses FNV-1a (deterministic, non-randomized)", () => {
    const source = readAvatarComponent();
    // FNV-1a offset basis and prime — verifies the hash stays deterministic
    // across app restarts and machines.
    expect(source).toContain("2166136261");
    expect(source).toContain("16777619");
    // Must NOT use Math.random() — the background color must be stable.
    expect(source).not.toMatch(/Math\.random\(\)/);
  });

  test("empty displayName falls back to email local-part initials, then '?'", () => {
    const source = readAvatarComponent();
    // The fallback chain: displayName tokens → email local-part → "?".
    expect(source).toContain(`return "?"`);
    // Email local-part extraction.
    expect(source).toMatch(/email\.split\(\s*["']@["']\s*\)/);
  });
});
