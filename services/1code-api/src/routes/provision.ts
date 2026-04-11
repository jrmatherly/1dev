import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  getProvisionStatus,
  provisionUser,
} from "../services/provisioning.js";
import type { LiteLLMClient } from "../lib/litellm-client.js";
import type { GraphClient } from "../lib/graph-client.js";
import type { TeamsConfig } from "../lib/teams-config.js";

declare module "fastify" {
  interface FastifyInstance {
    litellm?: LiteLLMClient;
    graph?: GraphClient;
    teamsConfig?: TeamsConfig;
  }
}

const FEATURE_DISABLED_RESPONSE = {
  error: "Provisioning is not enabled on this deployment",
  code: "PROVISIONING_DISABLED",
};

export function registerProvisionRoute(server: FastifyInstance): void {
  /**
   * GET /api/provision/status
   *
   * Returns the current provisioning state for the authenticated user.
   * Rate limit: 60/min per user (enforced by @fastify/rate-limit keyGenerator).
   */
  server.get(
    "/api/provision/status",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      if (!config.PROVISIONING_ENABLED) {
        return reply.code(503).send(FEATURE_DISABLED_RESPONSE);
      }

      const user = req.user!;
      const status = await getProvisionStatus(user);

      if (!status) {
        return reply.code(404).send({ error: "User not provisioned" });
      }

      return reply.send(status);
    },
  );

  /**
   * POST /api/provision
   *
   * Provision the authenticated user: resolve Entra group membership, create
   * LiteLLM user + team memberships + API keys as needed. Idempotent.
   * Rate limit: 5/min per user.
   */
  server.post(
    "/api/provision",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      if (!config.PROVISIONING_ENABLED) {
        return reply.code(503).send(FEATURE_DISABLED_RESPONSE);
      }

      const { litellm, graph, teamsConfig } = server;
      if (!litellm || !graph || !teamsConfig) {
        return reply.code(503).send({ error: "Provisioning services not initialized" });
      }

      const user = req.user!;

      try {
        const result = await provisionUser(user, litellm, graph, teamsConfig);
        return reply.send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        const code = e.statusCode ?? 500;
        return reply.code(code).send({ error: e.message });
      }
    },
  );
}
