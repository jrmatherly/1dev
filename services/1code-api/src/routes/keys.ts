import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  listUserKeys,
  createKey,
  rotateKey,
  revokeKey,
} from "../services/key-service.js";
import type { LiteLLMClient } from "../lib/litellm-client.js";

declare module "fastify" {
  interface FastifyInstance {
    litellm?: LiteLLMClient;
  }
}

const FEATURE_DISABLED_RESPONSE = {
  error: "Provisioning is not enabled on this deployment",
  code: "PROVISIONING_DISABLED",
};

export function registerKeysRoute(server: FastifyInstance): void {
  /**
   * GET /api/keys
   *
   * List active and revoked keys for the authenticated user.
   * Rate limit: 60/min per user.
   */
  server.get(
    "/api/keys",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      if (!config.PROVISIONING_ENABLED) {
        return reply.code(503).send(FEATURE_DISABLED_RESPONSE);
      }

      const user = req.user!;
      const db = getDb();

      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.oid, user.oid))
        .limit(1);

      if (!dbUser) {
        return reply.code(404).send({ error: "User not provisioned" });
      }

      const result = await listUserKeys(dbUser.id);
      return reply.send(result);
    },
  );

  /**
   * POST /api/keys/new
   *
   * Create a new key for the authenticated user in the specified team.
   * Rate limit: 10/min per user.
   */
  server.post(
    "/api/keys/new",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      if (!config.PROVISIONING_ENABLED) {
        return reply.code(503).send(FEATURE_DISABLED_RESPONSE);
      }

      const { litellm } = server;
      if (!litellm) {
        return reply.code(503).send({ error: "Provisioning services not initialized" });
      }

      const user = req.user!;
      const db = getDb();

      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.oid, user.oid))
        .limit(1);

      if (!dbUser) {
        return reply.code(404).send({ error: "User not provisioned" });
      }

      const body = req.body as { team_id?: string };
      if (!body?.team_id) {
        return reply.code(400).send({ error: "team_id is required" });
      }

      try {
        const result = await createKey(
          dbUser.id,
          dbUser.email,
          dbUser.oid,
          dbUser.litellmUserId ?? dbUser.email,
          body.team_id,
          body.team_id, // teamAlias — will be resolved by createKey from DB
          [],
          "user",
          dbUser.defaultKeyDurationDays,
          litellm,
        );
        return reply.send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        const code = e.statusCode ?? 500;
        return reply.code(code).send({ error: e.message });
      }
    },
  );

  /**
   * POST /api/keys/:keyId/rotate
   *
   * Rotate an existing key owned by the authenticated user.
   * Rate limit: 5/min per user.
   */
  server.post(
    "/api/keys/:keyId/rotate",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      if (!config.PROVISIONING_ENABLED) {
        return reply.code(503).send(FEATURE_DISABLED_RESPONSE);
      }

      const { litellm } = server;
      if (!litellm) {
        return reply.code(503).send({ error: "Provisioning services not initialized" });
      }

      const user = req.user!;
      const { keyId } = req.params as { keyId: string };
      const db = getDb();

      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.oid, user.oid))
        .limit(1);

      if (!dbUser) {
        return reply.code(404).send({ error: "User not provisioned" });
      }

      try {
        const result = await rotateKey(
          dbUser.id,
          dbUser.email,
          dbUser.oid,
          dbUser.litellmUserId ?? dbUser.email,
          keyId,
          dbUser.defaultKeyDurationDays,
          litellm,
        );
        return reply.send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        const code = e.statusCode ?? 500;
        return reply.code(code).send({ error: e.message });
      }
    },
  );

  /**
   * POST /api/keys/:keyId/revoke
   *
   * Revoke a key owned by the authenticated user.
   * Rate limit: 5/min per user.
   */
  server.post(
    "/api/keys/:keyId/revoke",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      if (!config.PROVISIONING_ENABLED) {
        return reply.code(503).send(FEATURE_DISABLED_RESPONSE);
      }

      const { litellm } = server;
      if (!litellm) {
        return reply.code(503).send({ error: "Provisioning services not initialized" });
      }

      const user = req.user!;
      const { keyId } = req.params as { keyId: string };
      const db = getDb();

      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.oid, user.oid))
        .limit(1);

      if (!dbUser) {
        return reply.code(404).send({ error: "User not provisioned" });
      }

      try {
        await revokeKey(dbUser.id, dbUser.email, dbUser.oid, keyId, litellm);
        return reply.send({ revoked: true, key_id: keyId });
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        const code = e.statusCode ?? 500;
        return reply.code(code).send({ error: e.message });
      }
    },
  );
}
