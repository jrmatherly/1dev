import { describe, test, expect, beforeEach } from "bun:test";

const { registerPlanRoute } = await import("../src/routes/plan.js");

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
    body: null as unknown,
    send(data: unknown) {
      reply.body = data;
      return reply;
    },
  };
  return reply;
}

describe("plan endpoint", () => {
  let server: ReturnType<typeof createServerMock>;

  beforeEach(() => {
    server = createServerMock();
    registerPlanRoute(server as never);
  });

  test("enterprise user gets max plan", async () => {
    const reply = createReplyMock();
    await server.routes["/api/desktop/user/plan"](
      { user: { oid: "abc", email: "user@corp.com", name: "User" } },
      reply,
    );
    expect(reply.body).toEqual({
      email: "user@corp.com",
      plan: "onecode_max",
      status: "active",
    });
  });

  test("plan identifier matches desktop app expectations", async () => {
    const reply = createReplyMock();
    await server.routes["/api/desktop/user/plan"](
      { user: { oid: "abc", email: "user@corp.com", name: "User" } },
      reply,
    );
    const body = reply.body as { plan: string };
    const validPlans = ["onecode_pro", "onecode_max_100", "onecode_max"];
    expect(validPlans).toContain(body.plan);
  });
});
