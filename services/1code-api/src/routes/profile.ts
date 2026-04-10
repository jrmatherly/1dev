import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { users } from "../db/schema.js";

export function registerProfileRoute(server: FastifyInstance): void {
  server.patch("/api/user/profile", async (req, reply) => {
    const user = req.user!;
    const body = req.body as { display_name?: string };

    if (!body || typeof body.display_name !== "string") {
      return reply.code(400).send({ error: "display_name is required" });
    }

    const db = getDb();

    // Upsert: create on first request, update on subsequent
    const [updated] = await db
      .insert(users)
      .values({
        oid: user.oid,
        email: user.email,
        displayName: body.display_name,
      })
      .onConflictDoUpdate({
        target: users.oid,
        set: {
          displayName: body.display_name,
          email: user.email,
          updatedAt: new Date(),
        },
      })
      .returning();

    return reply.send({
      oid: updated.oid,
      email: updated.email,
      display_name: updated.displayName,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString(),
    });
  });
}
