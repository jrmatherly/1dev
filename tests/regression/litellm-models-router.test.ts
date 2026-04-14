/**
 * Regression guard for Group 8 of `add-dual-mode-llm-routing` — the
 * `litellmModels` tRPC router that proxies `GET /v1/models` on our
 * LiteLLM deployment using a user-supplied virtual key.
 *
 * The router is load-bearing for the Group 9 onboarding wizard's "Fetch
 * Models" button. Shape-based guard per the project convention
 * (bun:test cannot load Electron; runtime behavior is verified by the
 * Group 11 manual smoke against the real proxy at
 * `https://llms.aarons.com`).
 *
 * What this guard catches:
 *   - Router file deleted or its export renamed
 *   - `listUserModels` procedure removed or renamed
 *   - `MAIN_VITE_LITELLM_BASE_URL` env-var read silently replaced with
 *     a hardcoded URL (would break per-deployment portability)
 *   - Authorization header dropped or changed from `Bearer <key>`
 *   - 401/403 → generic 500 collapse (users would lose the actionable
 *     "invalid virtual key" message)
 *   - Router not mounted in `createAppRouter` (would break renderer
 *     `trpc.litellmModels.*` call sites at compile time, but CI's
 *     ts:check is already a belt-and-suspenders — the guard catches
 *     accidental mount removal even if a no-op alias was left behind)
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const ROUTER_PATH = join(
  REPO_ROOT,
  "src/main/lib/trpc/routers/litellm-models.ts",
);
const APP_ROUTER_PATH = join(
  REPO_ROOT,
  "src/main/lib/trpc/routers/index.ts",
);

function readRouter(): string {
  return readFileSync(ROUTER_PATH, "utf8");
}

function readAppRouter(): string {
  return readFileSync(APP_ROUTER_PATH, "utf8");
}

describe("litellmModels router shape", () => {
  test("router file exists and exports litellmModelsRouter", () => {
    const source = readRouter();
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain("export const litellmModelsRouter");
    expect(source).toMatch(/listUserModels:\s*publicProcedure/);
  });

  test("input is validated as non-empty virtualKey", () => {
    const source = readRouter();
    expect(source).toMatch(/\.input\(\s*z\.object\(\{\s*virtualKey:\s*z\.string\(\)\.min\(1\)/);
  });

  test("reads LiteLLM base URL from env (not hardcoded)", () => {
    const source = readRouter();
    expect(source).toContain("process.env.MAIN_VITE_LITELLM_BASE_URL");
    // Guard against a regression where someone hardcodes a specific
    // cluster's URL. Fork is multi-deployment.
    expect(source).not.toMatch(/https:\/\/llms\.aarons\.com/);
  });

  test("hits the /v1/models path on the configured proxy", () => {
    const source = readRouter();
    expect(source).toContain("/v1/models");
    // Trailing-slash normalization — the URL builder must strip any
    // trailing slashes from baseUrl before appending the path.
    expect(source).toMatch(/replace\(\/\\\/\+\$\/,\s*""\)/);
  });

  test("auth header is Bearer <virtualKey>", () => {
    const source = readRouter();
    expect(source).toMatch(/Authorization:\s*`Bearer \$\{input\.virtualKey\}`/);
  });
});

describe("litellmModels router error handling", () => {
  test("throws INTERNAL_SERVER_ERROR when base URL unset", () => {
    const source = readRouter();
    expect(source).toMatch(/code:\s*"INTERNAL_SERVER_ERROR"/);
    expect(source).toMatch(/MAIN_VITE_LITELLM_BASE_URL is not configured/);
  });

  test("distinguishes 401/403 as UNAUTHORIZED (actionable for users)", () => {
    const source = readRouter();
    expect(source).toMatch(/response\.status === 401[\s\S]{0,200}status === 403/);
    expect(source).toMatch(/code:\s*"UNAUTHORIZED"/);
  });

  test("maps network failure + non-ok to BAD_GATEWAY (not INTERNAL)", () => {
    const source = readRouter();
    const bgHits = source.match(/code:\s*"BAD_GATEWAY"/g) ?? [];
    expect(bgHits.length).toBeGreaterThanOrEqual(2);
  });

  test("rejects malformed response body with UNPROCESSABLE_CONTENT", () => {
    const source = readRouter();
    expect(source).toContain("UNPROCESSABLE_CONTENT");
    expect(source).toMatch(/unexpected response shape/);
  });

  test("projects response to { id } only (not the full upstream envelope)", () => {
    const source = readRouter();
    // Output must strip LiteLLM's extra fields (object, created, owned_by)
    // so wizard consumers don't couple to the full contract.
    expect(source).toContain("parseModelsResponse");
    expect(source).toMatch(/models\.push\(\{\s*id:\s*entry\.id\s*\}\)/);
  });
});

describe("litellmModels router mount in createAppRouter", () => {
  test("createAppRouter imports the router", () => {
    const source = readAppRouter();
    expect(source).toContain('from "./litellm-models"');
    expect(source).toContain("litellmModelsRouter");
  });

  test("createAppRouter mounts the router as `litellmModels`", () => {
    const source = readAppRouter();
    expect(source).toMatch(/litellmModels:\s*litellmModelsRouter/);
  });
});
