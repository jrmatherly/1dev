import type { FastifyInstance } from "fastify";
import { isDatabaseHealthy } from "../db/connection.js";

export function registerHealthRoute(server: FastifyInstance): void {
  server.get("/health", async (_req, reply) => {
    const dbHealthy = await isDatabaseHealthy();

    if (dbHealthy) {
      return reply.code(200).send({ status: "ok" });
    }

    return reply.code(503).send({ status: "unhealthy", reason: "database" });
  });
}
