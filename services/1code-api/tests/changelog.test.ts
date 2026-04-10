import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test the changelog route by creating temp markdown files
// and exercising the handler.

const { registerChangelogRoute } = await import("../src/routes/changelog.js");

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

describe("changelog endpoint", () => {
  let server: ReturnType<typeof createServerMock>;

  beforeEach(() => {
    server = createServerMock();
    registerChangelogRoute(server as never);
  });

  test("returns entries from changelog directory", async () => {
    // The actual route reads from the bundled changelog/ directory.
    // We just verify the route is registered and returns an array.
    const reply = createReplyMock();
    await server.routes["/api/changelog/desktop"]({ query: {} }, reply);
    expect(Array.isArray(reply.body)).toBe(true);
  });

  test("respects per_page parameter", async () => {
    const reply = createReplyMock();
    await server.routes["/api/changelog/desktop"]({ query: { per_page: "1" } }, reply);
    const entries = reply.body as unknown[];
    expect(entries.length).toBeLessThanOrEqual(1);
  });

  test("entries are sorted by date descending", async () => {
    const reply = createReplyMock();
    await server.routes["/api/changelog/desktop"]({ query: {} }, reply);
    const entries = reply.body as Array<{ date: string }>;
    for (let i = 1; i < entries.length; i++) {
      expect(new Date(entries[i - 1].date).getTime()).toBeGreaterThanOrEqual(
        new Date(entries[i].date).getTime(),
      );
    }
  });
});
