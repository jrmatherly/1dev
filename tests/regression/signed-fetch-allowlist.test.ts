/**
 * Regression guard: signedFetch/streamFetch must validate URL origin
 *
 * The api:signed-fetch and api:stream-fetch IPC handlers in
 * src/main/windows/main.ts attach auth tokens to outgoing requests.
 * They MUST validate the URL origin against the configured API base URL
 * before attaching tokens — otherwise a compromised renderer could
 * exfiltrate tokens via SSRF to an attacker-controlled domain.
 *
 * If this test fails, the URL origin validation was removed or bypassed.
 * Fix: re-add origin validation before the fetch() call in both handlers.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const MAIN_TS = path.join(
  import.meta.dirname,
  "../../src/main/windows/main.ts",
);

describe("signedFetch/streamFetch URL allowlist", () => {
  const content = fs.readFileSync(MAIN_TS, "utf-8");

  test("api:signed-fetch handler validates URL origin", () => {
    // Find the signed-fetch handler section
    const signedFetchIdx = content.indexOf('"api:signed-fetch"');
    expect(signedFetchIdx).toBeGreaterThan(-1);

    // Look for origin validation between the handler start and the fetch() call
    const handlerSection = content.slice(
      signedFetchIdx,
      content.indexOf("await fetch(url", signedFetchIdx),
    );

    expect(handlerSection).toContain("new URL(url).origin");
    expect(handlerSection).toContain("not in allowlist");
  });

  test("api:stream-fetch handler validates URL origin", () => {
    const streamFetchIdx = content.indexOf('"api:stream-fetch"');
    expect(streamFetchIdx).toBeGreaterThan(-1);

    const handlerSection = content.slice(
      streamFetchIdx,
      content.indexOf("await fetch(url", streamFetchIdx),
    );

    expect(handlerSection).toContain("new URL(url).origin");
    expect(handlerSection).toContain("not in allowlist");
  });
});
