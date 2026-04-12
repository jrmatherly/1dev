import { eq, and, lte } from "drizzle-orm";
import {
  users,
  provisionedKeys,
  type PersistedKeyStatus,
} from "../db/schema.js";
import { getDb } from "../db/connection.js";
import { AUDIT_ACTIONS, logAction } from "../lib/audit.js";
import { slugify } from "../lib/slugify.js";
import { _makeKeyPreview } from "./key-service.js";
import type { LiteLLMClient } from "../lib/litellm-client.js";
import type { FastifyBaseLogger } from "fastify";

export interface RotationDeps {
  log: FastifyBaseLogger;
  litellm: LiteLLMClient;
  maxDeprovisionPerRun: number; // unused by rotation but matches SchedulerDeps
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Auto-rotate a single expired key.
 *
 * Steps (per design §Rotation cron):
 * a. Fetch fresh key + user rows
 * b. Best-effort delete old LiteLLM key
 * c. Mark old key `rotated`
 * d. Generate new alias with collision guard
 * e. Call litellm.generateKey
 * f. Insert new provisionedKeys row with `rotated_from_id`
 * g. Write audit entry
 */
async function _autoRotateKey(
  keyId: string,
  defaultKeyDurationDays: number,
  litellm: LiteLLMClient,
  log: FastifyBaseLogger,
): Promise<void> {
  const db = getDb();

  const [key] = await db
    .select()
    .from(provisionedKeys)
    .where(eq(provisionedKeys.id, keyId))
    .limit(1);

  if (!key) return;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, key.userId))
    .limit(1);

  if (!user?.isActive) return;

  // Best-effort delete old LiteLLM key
  if (key.litellmKeyId) {
    await litellm.deleteKey(key.litellmKeyId).catch((err: unknown) => {
      log.warn(
        { err, key_id: key.id },
        "rotation: best-effort LiteLLM key delete failed (continuing)",
      );
    });
  }

  // Mark old key as rotated
  await db
    .update(provisionedKeys)
    .set({ status: "rotated" as PersistedKeyStatus, revokedAt: new Date() })
    .where(eq(provisionedKeys.id, keyId));

  // Build new alias with simple collision guard
  const baseAlias = slugify(key.teamAlias);
  const existing = await db
    .select({ alias: provisionedKeys.litellmKeyAlias })
    .from(provisionedKeys)
    .where(eq(provisionedKeys.userId, key.userId));
  const aliasSet = new Set(existing.map((k) => k.alias));

  let newAlias = baseAlias;
  let suffix = 1;
  while (aliasSet.has(newAlias)) {
    newAlias = `${baseAlias}-${suffix}`;
    suffix++;
  }

  const expiresAt = new Date(Date.now() + defaultKeyDurationDays * MS_PER_DAY);

  const keyResp = await litellm.generateKey({
    user_id: user.litellmUserId ?? user.email,
    team_id: key.teamId,
    models: [],
    key_alias: newAlias,
    duration: `${defaultKeyDurationDays}d`,
  });

  const rawKey = keyResp.key;

  const [newKey] = await db
    .insert(provisionedKeys)
    .values({
      userId: key.userId,
      litellmKeyId: keyResp.token_id ?? keyResp.key_name ?? rawKey,
      litellmKeyAlias: newAlias,
      keyPreview: _makeKeyPreview(rawKey),
      teamId: key.teamId,
      teamAlias: key.teamAlias,
      status: "active" as PersistedKeyStatus,
      portalExpiresAt: expiresAt,
      rotatedFromId: keyId,
    })
    .returning();

  await logAction({
    tx: db as Parameters<typeof logAction>[0]["tx"],
    actorEmail: "system",
    actorEntraOid: user.oid,
    action: AUDIT_ACTIONS.ACTION_KEY_AUTO_ROTATED,
    targetType: "key",
    targetId: newKey.id,
    details: { rotated_from_id: keyId, team_id: key.teamId },
  });
}

/**
 * Main rotation cron job.
 *
 * Finds all active keys that have expired (`portal_expires_at <= now`) for
 * active users, then auto-rotates each one.
 */
export async function runRotationJob(deps: RotationDeps): Promise<void> {
  const { log, litellm } = deps;
  const db = getDb();
  const now = new Date();

  // Find expired active keys belonging to active users
  const expiredKeys = await db
    .select({
      keyId: provisionedKeys.id,
      userId: provisionedKeys.userId,
      defaultKeyDurationDays: users.defaultKeyDurationDays,
    })
    .from(provisionedKeys)
    .innerJoin(users, eq(provisionedKeys.userId, users.id))
    .where(
      and(
        eq(provisionedKeys.status, "active"),
        eq(users.isActive, true),
        lte(provisionedKeys.portalExpiresAt, now),
      ),
    );

  log.info(
    { count: expiredKeys.length },
    "rotation: found expired keys to rotate",
  );

  let rotated = 0;
  let failed = 0;

  for (const row of expiredKeys) {
    try {
      await _autoRotateKey(row.keyId, row.defaultKeyDurationDays, litellm, log);
      rotated++;
    } catch (err) {
      failed++;
      log.error(
        { err, key_id: row.keyId },
        "rotation: failed to auto-rotate key (continuing)",
      );
    }
  }

  log.info({ rotated, failed }, "rotation: run complete");
}
