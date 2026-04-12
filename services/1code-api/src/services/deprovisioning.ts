import { eq, and, isNull } from "drizzle-orm";
import {
  users,
  provisionedKeys,
  type PersistedKeyStatus,
} from "../db/schema.js";
import { getDb } from "../db/connection.js";
import { AUDIT_ACTIONS, logAction } from "../lib/audit.js";
import type { LiteLLMClient } from "../lib/litellm-client.js";
import type { GraphClient } from "../lib/graph-client.js";
import type { TeamsConfig } from "../lib/teams-config.js";
import { isUserAuthorized } from "../lib/teams-config.js";
import type { FastifyBaseLogger } from "fastify";

export interface DeprovisioningDeps {
  log: FastifyBaseLogger;
  litellm: LiteLLMClient;
  graph: GraphClient;
  teamsConfig: TeamsConfig;
  maxDeprovisionPerRun: number;
}

/**
 * Deprovision a single user: revoke all active keys in LiteLLM and mark the
 * user inactive. Per-user try/catch so one Graph failure doesn't kill the run.
 */
async function _deprovisionUser(
  userId: string,
  litellm: LiteLLMClient,
  log: FastifyBaseLogger,
): Promise<void> {
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return;

  const activeKeys = await db
    .select()
    .from(provisionedKeys)
    .where(
      and(
        eq(provisionedKeys.userId, userId),
        eq(provisionedKeys.status, "active"),
      ),
    );

  for (const key of activeKeys) {
    if (key.litellmKeyId) {
      await litellm.deleteKey(key.litellmKeyId).catch((err: unknown) => {
        log.warn(
          { err, key_id: key.id, user_id: userId },
          "deprovisioning: best-effort LiteLLM key delete failed (continuing)",
        );
      });
    }

    await db
      .update(provisionedKeys)
      .set({
        status: "revoked" as PersistedKeyStatus,
        revokedAt: new Date(),
      })
      .where(eq(provisionedKeys.id, key.id));

    await logAction({
      tx: db as Parameters<typeof logAction>[0]["tx"],
      actorEmail: "system",
      actorEntraOid: user.oid,
      action: AUDIT_ACTIONS.ACTION_KEY_DEPROVISIONED,
      targetType: "key",
      targetId: key.id,
      details: { team_id: key.teamId, deprovisioned_by: "cron" },
    });
  }

  await db
    .update(users)
    .set({ isActive: false, deprovisionedAt: new Date() })
    .where(eq(users.id, userId));

  await logAction({
    tx: db as Parameters<typeof logAction>[0]["tx"],
    actorEmail: "system",
    actorEntraOid: user.oid,
    action: AUDIT_ACTIONS.ACTION_USER_DEPROVISIONED,
    targetType: "user",
    targetId: userId,
    details: { deprovisioned_by: "cron", keys_revoked: activeKeys.length },
  });
}

/**
 * Main deprovisioning cron job.
 *
 * Steps:
 * 1. Load all active users.
 * 2. Mass-threshold check: if more than `maxDeprovisionPerRun` users would be
 *    deprovisioned, abort without any writes and emit an audit entry.
 * 3. For each user: check Graph group membership, deprovision if unauthorized.
 * 4. Log summary.
 */
export async function runDeprovisioningJob(
  deps: DeprovisioningDeps,
): Promise<void> {
  const { log, litellm, graph, teamsConfig, maxDeprovisionPerRun } = deps;
  const db = getDb();

  const activeUsers = await db
    .select({ id: users.id, oid: users.oid, email: users.email })
    .from(users)
    .where(and(eq(users.isActive, true), isNull(users.deprovisionedAt)));

  log.info(
    { count: activeUsers.length },
    "deprovisioning: checking active users",
  );

  // Determine which users need deprovisioning (pre-scan before any writes)
  const toDeprovision: string[] = [];
  for (const user of activeUsers) {
    try {
      const groupIds = await graph.getUserGroups(user.oid);
      if (!isUserAuthorized(teamsConfig, groupIds)) {
        toDeprovision.push(user.id);
      }
    } catch (err) {
      log.error(
        { err, user_id: user.id, oid: user.oid },
        "deprovisioning: graph.getUserGroups failed for user (skipping)",
      );
    }
  }

  // Mass-deprovisioning threshold guard
  if (toDeprovision.length > maxDeprovisionPerRun) {
    log.error(
      {
        threshold: maxDeprovisionPerRun,
        would_deprovision: toDeprovision.length,
      },
      "deprovisioning: ABORTED — would_deprovision exceeds threshold; no writes performed",
    );

    await logAction({
      tx: db as Parameters<typeof logAction>[0]["tx"],
      actorEmail: "system",
      actorEntraOid: "system",
      action: AUDIT_ACTIONS.ACTION_CRON_DEPROVISIONING_ABORTED,
      targetType: "cron",
      targetId: "deprovisioning",
      details: {
        threshold: maxDeprovisionPerRun,
        would_deprovision: toDeprovision.length,
      },
    });

    return;
  }

  let deprovisioned = 0;
  let errors = 0;

  for (const userId of toDeprovision) {
    try {
      await _deprovisionUser(userId, litellm, log);
      deprovisioned++;
    } catch (err) {
      errors++;
      log.error(
        { err, user_id: userId },
        "deprovisioning: failed to deprovision user (continuing)",
      );
    }
  }

  log.info(
    { deprovisioned, errors, checked: activeUsers.length },
    "deprovisioning: run complete",
  );
}
