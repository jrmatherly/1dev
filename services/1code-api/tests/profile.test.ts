import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock the database module
const mockDb = {
  insert: mock(() => mockDb),
  values: mock(() => mockDb),
  onConflictDoUpdate: mock(() => mockDb),
  returning: mock(() =>
    Promise.resolve([
      {
        oid: "test-oid",
        email: "user@example.com",
        displayName: "New Name",
        createdAt: new Date("2026-04-10T00:00:00Z"),
        updatedAt: new Date("2026-04-10T12:00:00Z"),
      },
    ]),
  ),
};

mock.module("../src/db/connection.js", () => ({
  getDb: () => mockDb,
}));

// Mock drizzle-orm eq function
mock.module("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
}));

const { registerProfileRoute } = await import("../src/routes/profile.js");

function createServerMock() {
  const routes: Record<string, (req: unknown, reply: unknown) => Promise<unknown>> = {};
  return {
    patch: (path: string, handler: (req: unknown, reply: unknown) => Promise<unknown>) => {
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

describe("profile endpoint", () => {
  let server: ReturnType<typeof createServerMock>;

  beforeEach(() => {
    server = createServerMock();
    registerProfileRoute(server as never);
    mockDb.insert.mockClear();
    mockDb.returning.mockClear();
  });

  test("updates display name and returns user object", async () => {
    const reply = createReplyMock();
    await server.routes["/api/user/profile"](
      {
        user: { oid: "test-oid", email: "user@example.com", name: "User" },
        body: { display_name: "New Name" },
      },
      reply,
    );
    expect(reply.body).toEqual({
      oid: "test-oid",
      email: "user@example.com",
      display_name: "New Name",
      created_at: "2026-04-10T00:00:00.000Z",
      updated_at: "2026-04-10T12:00:00.000Z",
    });
  });

  test("returns 400 when display_name missing", async () => {
    const reply = createReplyMock();
    await server.routes["/api/user/profile"](
      {
        user: { oid: "test-oid", email: "user@example.com", name: "User" },
        body: {},
      },
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body).toEqual({ error: "display_name is required" });
  });
});
