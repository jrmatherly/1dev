/**
 * Regression guard for the Graph /me/photo/$value 404/403 fallback path.
 *
 * When a signed-in user has no profile photo (404) or the tenant hides
 * photos via policy (403), `fetchGraphProfile` must degrade the photo
 * to `avatarDataUrl: null` without throwing — the text fields should
 * still populate from the successful /me call.
 *
 * Shape-based per project convention: bun:test cannot load the Electron
 * runtime that fetch-mocking would require, so this guard scans the
 * source for the load-bearing branches that produce the fallback.
 *
 * Motivated by: add-entra-graph-profile, spec scenarios
 *   - "No photo set — 404 response leads to null avatar..."
 *   - "Tenant policy hides photos — 403 response leads to null avatar"
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const GRAPH_PROFILE = join(REPO_ROOT, "src/main/lib/graph-profile.ts");

function readGraphProfile(): string {
  return readFileSync(GRAPH_PROFILE, "utf-8");
}

describe("graph-profile 404/403 fallback shape", () => {
  test("photo endpoint URL is /me/photo/$value on graph.microsoft.com/v1.0", () => {
    const source = readGraphProfile();
    expect(source).toContain("graph.microsoft.com/v1.0");
    expect(source).toContain("/me/photo/$value");
  });

  test("404 and 403 are both short-circuited to null without throwing", () => {
    const source = readGraphProfile();
    // Both status codes must be handled in the photo-fetch branch.
    // Using regex-tolerant checks because formatting/operators may differ,
    // but both literals must be present in the photo fallback code.
    expect(source).toMatch(/response\.status\s*===\s*404/);
    expect(source).toMatch(/response\.status\s*===\s*403/);
    // The helper must return null on either of those branches. No throw.
    expect(source).toMatch(/return null/);
  });

  test("fetchGraphProfile exports the expected GraphProfile shape", () => {
    const source = readGraphProfile();
    expect(source).toContain("export interface GraphProfile");
    expect(source).toContain("avatarDataUrl: string | null");
    expect(source).toContain("export async function fetchGraphProfile");
  });

  test("Promise.all runs profile and photo calls in parallel", () => {
    const source = readGraphProfile();
    expect(source).toContain("Promise.all");
  });

  test("non-404/403 photo errors degrade to null with a console.warn (no throw)", () => {
    const source = readGraphProfile();
    // The "other failure" branch should warn-and-null, NOT throw.
    expect(source).toMatch(/console\.warn\([\s\S]*graph-profile[\s\S]*\)/);
    // Ensure there's no `throw` in the photo-fetch path that would break
    // the "partial success" guarantee (text fields + null avatar).
    // We allow GraphProfileError throws for the /me profile call only;
    // the photo call must NOT throw on any status.
    const photoFnStart = source.indexOf("fetchAvatarDataUrl");
    const photoFnEnd = source.indexOf("\n}\n", photoFnStart);
    const photoFnBody = source.slice(photoFnStart, photoFnEnd);
    expect(photoFnBody).not.toMatch(/throw /);
  });
});
