import { describe, expect, test } from "bun:test";
import { parseConfig } from "../src/config.js";

/**
 * Config unit tests for task 2.5.
 *
 * Hits `parseConfig` directly with mocked env objects so they don't
 * rely on the module-load-time `process.env` snapshot — the config
 * module caches its first parse at import time; these tests bypass
 * that cache.
 *
 * Fixture UUIDs are **deliberately fake but structurally valid**:
 * all zeros with `4xxx-8xxx` in positions 13-17 to satisfy RFC 4122
 * version-4 variant-2 constraints (what `z.string().uuid()` requires).
 * Trailing digit varies just enough to keep them distinct. Never use
 * real tenant/client IDs in tests.
 */

const FAKE_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const FAKE_CLIENT_ID = "00000000-0000-4000-8000-000000000002";
const FAKE_SECRET = "test-secret-not-real";
const FAKE_LITELLM_URL = "https://litellm.test.invalid";
const FAKE_MASTER_KEY = "sk-test-master-key";

const BASE_ENV = {
  DATABASE_URL: "postgres://localhost:5432/test",
};

const FULL_PROVISIONING_ENV = {
  ...BASE_ENV,
  PROVISIONING_ENABLED: "true",
  LITELLM_BASE_URL: FAKE_LITELLM_URL,
  LITELLM_MASTER_KEY: FAKE_MASTER_KEY,
  AZURE_TENANT_ID: FAKE_TENANT_ID,
  AZURE_GRAPH_CLIENT_ID: FAKE_CLIENT_ID,
  AZURE_GRAPH_CLIENT_SECRET: FAKE_SECRET,
} as const;

describe("config — PROVISIONING_ENABLED=false (default)", () => {
  test("parses successfully with no Azure/LiteLLM env vars set", () => {
    const cfg = parseConfig({
      ...BASE_ENV,
      PROVISIONING_ENABLED: "false",
    });

    expect(cfg.PROVISIONING_ENABLED).toBe(false);
    expect(cfg.LITELLM_BASE_URL).toBeUndefined();
    expect(cfg.LITELLM_MASTER_KEY).toBeUndefined();
    expect(cfg.AZURE_TENANT_ID).toBeUndefined();
    expect(cfg.AZURE_GRAPH_CLIENT_ID).toBeUndefined();
    expect(cfg.AZURE_GRAPH_CLIENT_SECRET).toBeUndefined();
    expect(cfg.TEAMS_CONFIG_PATH).toBe("/app/config/teams.yaml");
    expect(cfg.DEPROVISIONING_MAX_PER_RUN).toBe(20);
  });

  test("parses successfully with unset PROVISIONING_ENABLED (default false)", () => {
    const cfg = parseConfig(BASE_ENV);
    expect(cfg.PROVISIONING_ENABLED).toBe(false);
  });
});

describe("config — PROVISIONING_ENABLED=true, missing required vars", () => {
  test("throws with a message listing the missing field", () => {
    const { AZURE_GRAPH_CLIENT_ID: _omitted, ...envMissingClientId } =
      FULL_PROVISIONING_ENV;

    expect(() => parseConfig(envMissingClientId)).toThrow(
      /AZURE_GRAPH_CLIENT_ID/,
    );
  });

  test("reports all missing required vars, not just the first", () => {
    try {
      parseConfig({
        ...BASE_ENV,
        PROVISIONING_ENABLED: "true",
        // all 5 required provisioning vars missing
      });
      throw new Error("parseConfig should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("LITELLM_BASE_URL");
      expect(msg).toContain("LITELLM_MASTER_KEY");
      expect(msg).toContain("AZURE_TENANT_ID");
      expect(msg).toContain("AZURE_GRAPH_CLIENT_ID");
      expect(msg).toContain("AZURE_GRAPH_CLIENT_SECRET");
    }
  });
});

describe("config — PROVISIONING_ENABLED=true, all required vars set", () => {
  test("parses successfully and exposes all provisioning values", () => {
    const cfg = parseConfig({
      ...FULL_PROVISIONING_ENV,
      TEAMS_CONFIG_PATH: "/custom/path/teams.yaml",
      DEPROVISIONING_MAX_PER_RUN: "30",
    });

    expect(cfg.PROVISIONING_ENABLED).toBe(true);
    expect(cfg.LITELLM_BASE_URL).toBe(FAKE_LITELLM_URL);
    expect(cfg.LITELLM_MASTER_KEY).toBe(FAKE_MASTER_KEY);
    expect(cfg.AZURE_TENANT_ID).toBe(FAKE_TENANT_ID);
    expect(cfg.AZURE_GRAPH_CLIENT_ID).toBe(FAKE_CLIENT_ID);
    expect(cfg.AZURE_GRAPH_CLIENT_SECRET).toBe(FAKE_SECRET);
    expect(cfg.TEAMS_CONFIG_PATH).toBe("/custom/path/teams.yaml");
    expect(cfg.DEPROVISIONING_MAX_PER_RUN).toBe(30);
  });

  test("accepts PROVISIONING_ENABLED=1 as true", () => {
    const cfg = parseConfig({
      ...FULL_PROVISIONING_ENV,
      PROVISIONING_ENABLED: "1",
    });
    expect(cfg.PROVISIONING_ENABLED).toBe(true);
  });

  test("rejects invalid LITELLM_BASE_URL (not a URL)", () => {
    expect(() =>
      parseConfig({
        ...FULL_PROVISIONING_ENV,
        LITELLM_BASE_URL: "not-a-url",
      }),
    ).toThrow(/LITELLM_BASE_URL/);
  });

  test("rejects non-uuid AZURE_TENANT_ID", () => {
    expect(() =>
      parseConfig({
        ...FULL_PROVISIONING_ENV,
        AZURE_TENANT_ID: "not-a-uuid",
      }),
    ).toThrow(/AZURE_TENANT_ID/);
  });
});
