import Fastify from "fastify";
import { config } from "./config.js";
import { connectDatabase, closeDatabase, runMigrations } from "./db/connection.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerChangelogRoute } from "./routes/changelog.js";
import { registerPlanRoute } from "./routes/plan.js";
import { registerProfileRoute } from "./routes/profile.js";
import { authHook } from "./auth.js";

const server = Fastify({
  logger: {
    level: config.LOG_LEVEL,
  },
});

// Auth hook for all routes except health
server.addHook("onRequest", authHook);

// Register routes
registerHealthRoute(server);
registerChangelogRoute(server);
registerPlanRoute(server);
registerProfileRoute(server);

async function start(): Promise<void> {
  try {
    // Connect to database and run migrations
    await connectDatabase();
    await runMigrations();

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
  await server.close();
  await closeDatabase();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
