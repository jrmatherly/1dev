/**
 * Regression guard for the signed-fetch upstream-disabled gate +
 * negative cache (Group 15 of remediate-dev-server-findings).
 *
 * The api:signed-fetch and api:stream-fetch handlers in
 * src/main/windows/main.ts gained two protections that this guard
 * pins via SHAPE checks against the source:
 *
 *   1. `checkUpstreamGate(url, rawApiUrl)` — rejects when
 *      MAIN_VITE_API_URL is unset or matches apollosai.dev. Without
 *      this, every renderer mount hits a dead upstream and floods logs.
 *
 *   2. `unreachableCache` Map with 60s TTL — after ECONNREFUSED or
 *      ENOTFOUND, subsequent calls return the cached error instead of
 *      retrying. Stops the per-render fan-out from amplifying transient
 *      DNS failures.
 *
 * Shape-based per the project convention (cannot import Electron in
 * bun:test). Runtime behavior is verified by the manual smoke (Group
 * 18.9 of remediate-dev-server-findings).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const MAIN_TS = join(REPO_ROOT, "src/main/windows/main.ts");

function readMain(): string {
  return readFileSync(MAIN_TS, "utf8");
}

describe("signed-fetch upstream-disabled gate", () => {
  test("checkUpstreamGate helper exists", () => {
    const source = readMain();
    expect(source).toContain("function checkUpstreamGate");
    expect(source).toContain("UpstreamGateResult");
  });

  test("isUpstreamDisabled flags missing env var", () => {
    const source = readMain();
    expect(source).toContain("function isUpstreamDisabled");
    expect(source).toMatch(/!rawApiUrl\s*\|\|\s*rawApiUrl\.length === 0/);
  });

  test("isUpstreamDisabled flags apollosai.dev hostname matches", () => {
    const source = readMain();
    expect(source).toContain('host === "apollosai.dev"');
    expect(source).toContain('host.endsWith(".apollosai.dev")');
  });

  test("upstream-disabled gate logs once per origin per process lifetime", () => {
    const source = readMain();
    expect(source).toContain("upstreamLogged");
    expect(source).toContain("function logUpstreamOnce");
    // The Set membership check guards the warn() call.
    expect(source).toMatch(/upstreamLogged\.has\(origin\)/);
    expect(source).toMatch(/upstreamLogged\.add\(origin\)/);
  });

  test("both signed-fetch handlers consult the gate before fetch()", () => {
    const source = readMain();
    // Both handlers must call checkUpstreamGate(url, ...) and bail on blocked.
    const calls = source.match(/checkUpstreamGate\(url,\s*\w+\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  test("signed-fetch handlers no longer fall back to apollosai.dev default", () => {
    const source = readMain();
    // The literal `|| "https://apollosai.dev"` fallback must be gone
    // from both handler bodies — that was the silent-leak default.
    expect(source).not.toMatch(
      /MAIN_VITE_API_URL\s*\|\|\s*"https:\/\/apollosai\.dev"/,
    );
  });
});

describe("signed-fetch negative cache", () => {
  test("unreachableCache Map exists at module scope", () => {
    const source = readMain();
    expect(source).toContain("unreachableCache");
    expect(source).toMatch(/unreachableCache\s*=\s*new Map/);
  });

  test("cache TTL is 60s (matches the design target)", () => {
    const source = readMain();
    expect(source).toContain("UNREACHABLE_TTL_MS");
    expect(source).toMatch(/UNREACHABLE_TTL_MS\s*=\s*60_?000/);
  });

  test("cache hit short-circuits the gate (no retry within TTL)", () => {
    const source = readMain();
    expect(source).toContain("unreachableCache.get(requestOrigin)");
    expect(source).toMatch(/Date\.now\(\)\s*-\s*cached\.checkedAt\s*<\s*UNREACHABLE_TTL_MS/);
  });

  test("recordUnreachable populates the cache on ECONNREFUSED/ENOTFOUND/ETIMEDOUT or fetch-failed", () => {
    const source = readMain();
    expect(source).toContain("function recordUnreachable");
    expect(source).toContain('"ECONNREFUSED"');
    expect(source).toContain('"ENOTFOUND"');
    expect(source).toContain('"ETIMEDOUT"');
  });

  test("recordUnreachable unwraps undici's error.cause.code (fetch failed TypeError)", () => {
    const source = readMain();
    // Undici wraps native fetch errors as TypeError('fetch failed') with
    // the real code on error.cause.code. Without the unwrap, the cache
    // never populates during dev smoke.
    expect(source).toMatch(/cause\?\.code/);
    expect(source).toMatch(/message === "fetch failed"/);
  });

  test("both fetch error handlers call recordUnreachable", () => {
    const source = readMain();
    // signed-fetch + stream-fetch each have a catch block that records.
    const calls = source.match(/recordUnreachable\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3); // 1 def + 2 call sites
  });
});
