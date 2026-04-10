import type { FastifyInstance } from "fastify";

/**
 * Enterprise plan resolution — all authenticated users get the max plan.
 * The upstream SaaS checked Stripe subscriptions; our enterprise deployment
 * uses feature flags (currently: everyone gets max).
 *
 * Plan identifiers match the upstream values the desktop app expects:
 * - "onecode_pro"
 * - "onecode_max_100"
 * - "onecode_max"
 */
export function registerPlanRoute(server: FastifyInstance): void {
  server.get("/api/desktop/user/plan", async (req, reply) => {
    // Auth hook guarantees req.user is set for non-public routes
    const user = req.user!;

    return reply.send({
      email: user.email,
      plan: "onecode_max",
      status: "active",
    });
  });
}
