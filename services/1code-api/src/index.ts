import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import {
  connectDatabase,
  closeDatabase,
  runMigrations,
} from "./db/connection.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerChangelogRoute } from "./routes/changelog.js";
import { registerPlanRoute } from "./routes/plan.js";
import { registerProfileRoute } from "./routes/profile.js";
import { registerProvisionRoute } from "./routes/provision.js";
import { registerKeysRoute } from "./routes/keys.js";
import { authHook } from "./auth.js";
import { LiteLLMClient } from "./lib/litellm-client.js";
import { GraphClient } from "./lib/graph-client.js";
import { loadTeamsConfig } from "./lib/teams-config.js";
import { setupScheduler, type SchedulerHandle } from "./lib/scheduler.js";

const server = Fastify({
  logger: {
    level: config.LOG_LEVEL,
  },
});

// ---- Rate limiting --------------------------------------------------------
// keyGenerator uses x-user-oid so rate limits are per-user, not per-pod-IP.
// Without this, every request from behind the Envoy Gateway would share the
// same source IP and the global rate limiter would throttle the entire fleet.
// Falls back to source IP for public routes (e.g., /health) where the header
// is absent.
await server.register(rateLimit, {
  global: true,
  keyGenerator: (req) => {
    const oid = req.headers["x-user-oid"];
    if (typeof oid === "string" && oid.length > 0) return oid;
    return req.ip;
  },
});

// Auth hook for all routes except health
server.addHook("onRequest", authHook);

// Register base routes
registerHealthRoute(server);
registerChangelogRoute(server);
registerPlanRoute(server);
registerProfileRoute(server);

// Register provisioning routes (feature-flagged inside handlers)
registerProvisionRoute(server);
registerKeysRoute(server);

// ---- Provisioning service initialization ----------------------------------
let schedulerHandle: SchedulerHandle | null = null;

async function initProvisioningServices(): Promise<void> {
  if (!config.PROVISIONING_ENABLED) {
    server.log.info(
      "provisioning: PROVISIONING_ENABLED=false — skipping service init and scheduler",
    );
    return;
  }

  const litellm = new LiteLLMClient({
    baseUrl: config.LITELLM_BASE_URL!,
    masterKey: config.LITELLM_MASTER_KEY!,
  });

  const graph = new GraphClient({
    tenantId: config.AZURE_TENANT_ID!,
    clientId: config.AZURE_GRAPH_CLIENT_ID!,
    clientSecret: config.AZURE_GRAPH_CLIENT_SECRET!,
  });

  const teamsConfig = loadTeamsConfig(config.TEAMS_CONFIG_PATH);

  // Decorate server for DI into route handlers
  server.decorate("litellm", litellm);
  server.decorate("graph", graph);
  server.decorate("teamsConfig", teamsConfig);

  schedulerHandle = setupScheduler({
    log: server.log,
    litellm,
    graph,
    teamsConfig,
    maxDeprovisionPerRun: config.DEPROVISIONING_MAX_PER_RUN,
  });

  server.log.info("provisioning: services initialized and scheduler started");
}

async function start(): Promise<void> {
  try {
    await connectDatabase();
    await runMigrations();
    await initProvisioningServices();

    await server.listen({ port: config.PORT, host: "0.0.0.0" });
    server.log.info(`1code-api listening on port ${config.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  server.log.info(`Received ${signal}, shutting down gracefully...`);

  if (schedulerHandle) {
    schedulerHandle.stop();
  }

  await server.close();
  await closeDatabase();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await start();
