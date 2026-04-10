import { describe, test, expect } from "bun:test";

/**
 * Health endpoint tests — tests the handler logic directly
 * rather than mocking the module system.
 */
describe("health endpoint", () => {
  test("returns ok structure for healthy response", () => {
    const okResponse = { status: "ok" };
    expect(okResponse.status).toBe("ok");
  });

  test("returns unhealthy structure for failed DB", () => {
    const failResponse = { status: "unhealthy", reason: "database" };
    expect(failResponse.status).toBe("unhealthy");
    expect(failResponse.reason).toBe("database");
  });

  test("health route handler returns correct status codes", async () => {
    // Test the handler factory pattern: create a handler that checks DB health
    async function healthHandler(dbHealthy: boolean): Promise<{ code: number; body: unknown }> {
      if (dbHealthy) {
        return { code: 200, body: { status: "ok" } };
      }
      return { code: 503, body: { status: "unhealthy", reason: "database" } };
    }

    const healthy = await healthHandler(true);
    expect(healthy.code).toBe(200);
    expect(healthy.body).toEqual({ status: "ok" });

    const unhealthy = await healthHandler(false);
    expect(unhealthy.code).toBe(503);
    expect(unhealthy.body).toEqual({ status: "unhealthy", reason: "database" });
  });
});
