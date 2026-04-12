/**
 * Task 8.8 — provision route tests
 *
 * Covers the route-layer behavior that does NOT depend on the provisioning
 * service: feature flag gating (503 when PROVISIONING_ENABLED=false).
 *
 * Happy-path and service-layer error propagation are covered by
 * tests/services/provisioning.test.ts at the service layer. Mocking
 * `provisioning.js` here would collide with that file's db mock (Bun's
 * `mock.module` is process-global and first-write-wins for duplicate
 * module paths).
 */
import { describe, test, expect, mock } from "bun:test";

if (!process.env.DATABASE_URL)
  process.env.DATABASE_URL = "postgres://localhost:5432/test";

// ---- Mock config so we can flip PROVISIONING_ENABLED per test -------------
const mockConfig = {
  PORT: 8000,
  DATABASE_URL: "postgres://localhost:5432/test",
  DEV_BYPASS_AUTH: false,
  LOG_LEVEL: "silent" as const,
  PROVISIONING_ENABLED: false,
  LITELLM_BASE_URL: "https://litellm.test.invalid",
  LITELLM_MASTER_KEY: "sk-test",
  AZURE_TENANT_ID: "00000000-0000-4000-8000-000000000001",
  AZURE_GRAPH_CLIENT_ID: "00000000-0000-4000-8000-000000000002",
  AZURE_GRAPH_CLIENT_SECRET: "fake-secret",
  TEAMS_CONFIG_PATH: "/tmp/teams.yaml",
  DEPROVISIONING_MAX_PER_RUN: 20,
};

// Preserve the real config module so parseConfig and friends still resolve
// for tests/config.test.ts.
const realConfigModule = await import("../../src/config.js");
mock.module("../../src/config.js", () => ({
  ...realConfigModule,
  config: mockConfig,
}));

const { registerProvisionRoute } =
  await import("../../src/routes/provision.js");
import Fastify from "fastify";

// ---- Helper: build a fresh server per test -------------------------------

async function buildServer() {
  const server = Fastify({ logger: false });

  // Inject auth context directly (bypass the real auth hook for tests)
  server.addHook("onRequest", async (req) => {
    req.user = {
      oid: "00000000-0000-4000-8000-000000000123",
      email: "test@example.com",
      name: "Test User",
    };
  });

  // DI decorators — empty stubs; the feature-flag tests never reach the
  // service layer so these are never called.
  server.decorate("litellm", {} as never);
  server.decorate("graph", {} as never);
  server.decorate("teamsConfig", {} as never);

  registerProvisionRoute(server);
  await server.ready();
  return server;
}

// ---- Tests -----------------------------------------------------------------

describe("GET /api/provision/status — feature flag gating", () => {
  test("returns 503 when PROVISIONING_ENABLED=false", async () => {
    mockConfig.PROVISIONING_ENABLED = false;
    const server = await buildServer();

    const res = await server.inject({
      method: "GET",
      url: "/api/provision/status",
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("PROVISIONING_DISABLED");
    expect(body.error).toContain("Provisioning is not enabled");

    await server.close();
  });
});

describe("POST /api/provision — feature flag gating", () => {
  test("returns 503 when PROVISIONING_ENABLED=false", async () => {
    mockConfig.PROVISIONING_ENABLED = false;
    const server = await buildServer();

    const res = await server.inject({
      method: "POST",
      url: "/api/provision",
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("PROVISIONING_DISABLED");

    await server.close();
  });

  test("returns 503 with PROVISIONING_DISABLED code even with auth headers", async () => {
    mockConfig.PROVISIONING_ENABLED = false;
    const server = await buildServer();

    const res = await server.inject({
      method: "POST",
      url: "/api/provision",
      headers: {
        "x-user-oid": "00000000-0000-4000-8000-000000000123",
        "x-user-email": "test@example.com",
      },
    });

    expect(res.statusCode).toBe(503);

    await server.close();
  });
});
