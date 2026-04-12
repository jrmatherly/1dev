/**
 * Task 6.6 — Rate-limit keyGenerator smoke test
 *
 * Asserts that two requests with different x-user-oid values do NOT share a
 * rate-limit bucket, even when they appear to originate from the same source IP.
 *
 * Why: the @fastify/rate-limit keyGenerator is set to req.headers["x-user-oid"]
 * so that the global rate limit is per-user, not per-Envoy-Gateway-IP. Without
 * this override, all users behind the same Envoy Gateway pod would share one
 * bucket and trip each other's limits.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

let server: ReturnType<typeof Fastify>;

beforeAll(async () => {
  server = Fastify({ logger: false });

  await server.register(rateLimit, {
    global: true,
    max: 2, // very low max so the test can trip it quickly
    timeWindow: "1 minute",
    keyGenerator: (req: import("fastify").FastifyRequest) => {
      const oid = req.headers["x-user-oid"];
      if (typeof oid === "string" && oid.length > 0) return oid;
      return req.ip;
    },
  });

  server.get("/test", async (_req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
    return reply.send({ ok: true });
  });

  await server.listen({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  await server.close();
});

describe("rate-limit keyGenerator", () => {
  test("two different OIDs do not share a rate-limit bucket", async () => {
    const address = server.addresses()[0];
    const base = `http://${address.address}:${address.port}`;

    // Exhaust the limit for user A (send 2 requests — at max)
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${base}/test`, {
        headers: { "x-user-oid": "user-a-oid" },
      });
      expect(res.status).toBe(200);
    }

    // A 3rd request for user A should now be rate-limited (429)
    const blockedA = await fetch(`${base}/test`, {
      headers: { "x-user-oid": "user-a-oid" },
    });
    expect(blockedA.status).toBe(429);

    // user B has a fresh bucket — should still get 200
    const okB = await fetch(`${base}/test`, {
      headers: { "x-user-oid": "user-b-oid" },
    });
    expect(okB.status).toBe(200);
  });
});
