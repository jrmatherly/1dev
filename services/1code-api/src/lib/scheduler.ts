import { schedule, type ScheduledTask } from "node-cron";
import type { FastifyBaseLogger } from "fastify";
import type { LiteLLMClient } from "./litellm-client.js";
import type { GraphClient } from "./graph-client.js";
import type { TeamsConfig } from "./teams-config.js";

export interface SchedulerDeps {
  log: FastifyBaseLogger;
  litellm: LiteLLMClient;
  graph: GraphClient;
  teamsConfig: TeamsConfig;
  maxDeprovisionPerRun: number;
}

export interface SchedulerHandle {
  stop(): void;
}

/**
 * Register background cron jobs for deprovisioning and key rotation.
 *
 * Jobs only start when `PROVISIONING_ENABLED=true` (enforced by the caller
 * in `src/index.ts`). Call `handle.stop()` on graceful shutdown to prevent
 * jobs from firing after the process starts closing.
 *
 * Schedules:
 * - Deprovisioning: daily at 02:00 UTC
 * - Key rotation:   daily at 03:00 UTC
 */
export function setupScheduler(deps: SchedulerDeps): SchedulerHandle {
  const { log } = deps;

  const deprovisionTask: ScheduledTask = schedule(
    "0 2 * * *",
    async () => {
      log.info("scheduler: starting deprovisioning run");
      try {
        // Lazy import to avoid circular dependency during bootstrap
        const { runDeprovisioningJob } = await import(
          "../services/deprovisioning.js"
        );
        await runDeprovisioningJob(deps);
      } catch (err) {
        log.error({ err }, "scheduler: deprovisioning run failed");
      }
    },
    { timezone: "UTC", runOnInit: false },
  );

  const rotationTask: ScheduledTask = schedule(
    "0 3 * * *",
    async () => {
      log.info("scheduler: starting key rotation run");
      try {
        const { runRotationJob } = await import("../services/rotation.js");
        await runRotationJob(deps);
      } catch (err) {
        log.error({ err }, "scheduler: rotation run failed");
      }
    },
    { timezone: "UTC", runOnInit: false },
  );

  log.info(
    "scheduler: deprovisioning (02:00 UTC) and rotation (03:00 UTC) jobs registered",
  );

  return {
    stop() {
      deprovisionTask.stop();
      rotationTask.stop();
      log.info("scheduler: all jobs stopped");
    },
  };
}
