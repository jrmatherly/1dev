/**
 * Regression guard for Phase 0 hard gate #1-4.
 *
 * The `auth:get-token` IPC handler (CVSS 9.0, C5 finding) was deleted in the
 * Phase 0 cleanup that preceded the enterprise auth migration. If any of the
 * deleted symbols reappear — the IPC handler, the preload bridge, or the
 * renderer-visible type — this test fails and blocks the merge.
 *
 * See:
 *   .scratchpad/auth-strategy-envoy-gateway.md §6 Phase 0 hard gates #1-4
 *   .full-review/envoy-gateway-review/05-final-report.md §C5
 *
 * Note: this is a structural / source-level guard, not a runtime check. The
 * `desktopApi` object only exists inside the Electron renderer process at
 * runtime; we cannot evaluate `window.desktopApi.getAuthToken === undefined`
 * from a plain `bun test`. Asserting on the source text is the correct
 * surrogate and matches what the gate is actually defending against
 * (re-introduction of the dead IPC path by a future refactor or merge).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const MAIN_WINDOWS = join(REPO_ROOT, "src/main/windows/main.ts");
const PRELOAD = join(REPO_ROOT, "src/preload/index.ts");

describe("Phase 0 gate #1-4: auth:get-token deletion", () => {
  test("main process does not register the auth:get-token IPC handler", () => {
    const source = readFileSync(MAIN_WINDOWS, "utf8");
    expect(source).not.toContain("auth:get-token");
  });

  test("preload bridge does not expose getAuthToken on desktopApi", () => {
    const source = readFileSync(PRELOAD, "utf8");
    // The implementation was: getAuthToken: () => ipcRenderer.invoke("auth:get-token")
    expect(source).not.toContain("auth:get-token");
    // The whole symbol should be gone from both the implementation object
    // and the DesktopApi type declaration.
    expect(source).not.toContain("getAuthToken");
  });
});
