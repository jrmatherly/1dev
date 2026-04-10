import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock database health check
let dbHealthy = true;
mock.module("../src/db/connection.js", () => ({
  isDatabaseHealthy: async () => dbHealthy,
}));

const { registerHealthRoute } = await import("../src/routes/health.js");

// Minimal Fastify mock
function createServerMock() {
  const routes: Record<string, (req: unknown, reply: unknown) => Promise<unknown>> = {};
  return {
    get: (path: string, handler: (req: unknown, reply: unknown) => Promise<unknown>) => {
      routes[path] = handler;
    },
    routes,
  };
}

function createReplyMock() {
  const reply = {
    statusCode: 200,
    body: null as unknown,
    code(c: number) {
      reply.statusCode = c;
      return reply;
    },
    send(data: unknown) {
      reply.body = data;
      return reply;
    },
  };
  return reply;
}

describe("health endpoint", () => {
  let server: ReturnType<typeof createServerMock>;

  beforeEach(() => {
    server = createServerMock();
    registerHealthRoute(server as never);
  });

  test("returns ok when database is healthy", async () => {
    dbHealthy = true;
    const reply = createReplyMock();
    await server.routes["/health"]({}, reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ status: "ok" });
  });

  test("returns unhealthy when database is down", async () => {
    dbHealthy = false;
    const reply = createReplyMock();
    await server.routes["/health"]({}, reply);
    expect(reply.statusCode).toBe(503);
    expect(reply.body).toEqual({ status: "unhealthy", reason: "database" });
  });
});
