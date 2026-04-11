import { eq, and } from "drizzle-orm";
import { provisionedKeys, type PersistedKeyStatus, type KeyStatus } from "../db/schema.js";
import { getDb } from "../db/connection.js";
import { AUDIT_ACTIONS, logAction } from "../lib/audit.js";
import { slugify } from "../lib/slugify.js";
import type { LiteLLMClient } from "../lib/litellm-client.js";

// ---- Status helpers --------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXPIRING_SOON_DAYS = 14;

/**
 * Compute the number of whole days until `expiresAt` (can be negative).
 */
export function _daysUntilExpiry(expiresAt: Date, now: Date = new Date()): number {
  return Math.floor((expiresAt.getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * Derive the display status of a key per Decision 9.
 *
 * Persisted `revoked` and `rotated` always override.
 * For `active` rows:
 *   - `days <= 0`             → `expired`
 *   - `0 < days <= 14`        → `expiring_soon`
 *   - `days > 14`             → `active`
 */
export function _computeStatus(
  persistedStatus: PersistedKeyStatus,
  portalExpiresAt: Date,
  now: Date = new Date(),
): KeyStatus {
  if (persistedStatus === "revoked") return "revoked";
  if (persistedStatus === "rotated") return "rotated";

  const days = _daysUntilExpiry(portalExpiresAt, now);
  if (days <= 0) return "expired";
  if (days <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return "active";
}

/**
 * Mask a raw LiteLLM key to a safe preview: first 4 chars + "..." + last 4 chars.
 */
export function _makeKeyPreview(rawKey: string): string {
  if (rawKey.length <= 8) return rawKey;
  return `${rawKey.slice(0, 4)}...${rawKey.slice(-4)}`;
}

// ---- Key alias collision guard --------------------------------------------

async function buildKeyAlias(
  userId: string,
  teamAlias: string,
): Promise<string> {
  const db = getDb();
  const base = slugify(teamAlias);

  // Fetch all existing aliases for this user to guard against collisions
  const existing = await db
    .select({ alias: provisionedKeys.litellmKeyAlias })
    .from(provisionedKeys)
    .where(eq(provisionedKeys.userId, userId));
  const aliasSet = new Set(existing.map((k) => k.alias));

  let alias = base;
  let suffix = 1;
  while (aliasSet.has(alias)) {
    alias = `${base}-${suffix}`;
    suffix++;
  }
  return alias;
}

// ---- Key list item --------------------------------------------------------

export interface KeyListItem {
  key_id: string;
  key_preview: string | null;
  key_alias: string;
  team_id: string;
  team_alias: string;
  status: KeyStatus;
  days_until_expiry: number;
  portal_expires_at: Date;
  rotated_from_id: string | null;
  created_at: Date;
}

// ---- listUserKeys ---------------------------------------------------------

export async function listUserKeys(userId: string): Promise<{
  active: KeyListItem[];
  revoked: KeyListItem[];
}> {
  const db = getDb();
  const now = new Date();

  // We only select by userId and filter status in memory. The valid statuses
  // (`active`, `revoked`, `rotated`) are the only persisted values anyway —
  // `expired` and `expiring_soon` are derived, never stored (Decision 9).
  // Filtering in memory avoids a Bun-specific ESM star-reexport issue with
  // drizzle-orm's `inArray` when multiple test files load the module graph.
  const rows = await db
    .select()
    .from(provisionedKeys)
    .where(eq(provisionedKeys.userId, userId));

  const active: KeyListItem[] = [];
  const revoked: KeyListItem[] = [];

  for (const row of rows) {
    const status = _computeStatus(
      row.status as PersistedKeyStatus,
      row.portalExpiresAt,
      now,
    );
    const item: KeyListItem = {
      key_id: row.id,
      key_preview: row.keyPreview,
      key_alias: row.litellmKeyAlias,
      team_id: row.teamId,
      team_alias: row.teamAlias,
      status,
      days_until_expiry: _daysUntilExpiry(row.portalExpiresAt, now),
      portal_expires_at: row.portalExpiresAt,
      rotated_from_id: row.rotatedFromId ?? null,
      created_at: row.createdAt,
    };

    if (status === "revoked" || status === "rotated") {
      revoked.push(item);
    } else {
      active.push(item);
    }
  }

  return { active, revoked };
}

// ---- createKey -----------------------------------------------------------

export interface CreateKeyResult {
  key_id: string;
  key: string;
  key_alias: string;
  team_alias: string;
  portal_expires_at: Date;
}

export async function createKey(
  userId: string,
  userEmail: string,
  userOid: string,
  litellmUserId: string,
  teamId: string,
  teamAlias: string,
  models: string[],
  litellmRole: string,
  defaultKeyDurationDays: number,
  litellm: LiteLLMClient,
): Promise<CreateKeyResult> {
  const db = getDb();

  // Verify user is a member of the team
  const [membership] = await db
    .select()
    .from(provisionedKeys)
    .where(
      and(
        eq(provisionedKeys.userId, userId),
        eq(provisionedKeys.teamId, teamId),
      ),
    )
    .limit(1);

  if (!membership) {
    const err = new Error("Not a member of this team") as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  const keyAlias = await buildKeyAlias(userId, teamAlias);
  const expiresAt = new Date(Date.now() + defaultKeyDurationDays * MS_PER_DAY);

  const keyResp = await litellm.generateKey({
    user_id: litellmUserId,
    team_id: teamId,
    models,
    key_alias: keyAlias,
    duration: `${defaultKeyDurationDays}d`,
  });

  const rawKey = keyResp.key;

  const [inserted] = await db
    .insert(provisionedKeys)
    .values({
      userId,
      litellmKeyId: keyResp.token_id ?? keyResp.key_name ?? rawKey,
      litellmKeyAlias: keyAlias,
      keyPreview: _makeKeyPreview(rawKey),
      teamId,
      teamAlias,
      status: "active" as PersistedKeyStatus,
      portalExpiresAt: expiresAt,
    })
    .returning();

  await logAction({
    tx: db as Parameters<typeof logAction>[0]["tx"],
    actorEmail: userEmail,
    actorEntraOid: userOid,
    action: AUDIT_ACTIONS.ACTION_KEY_GENERATED,
    targetType: "key",
    targetId: inserted.id,
    details: { team_id: teamId, manually_created: true },
  });

  return {
    key_id: inserted.id,
    key: rawKey,
    key_alias: keyAlias,
    team_alias: teamAlias,
    portal_expires_at: expiresAt,
  };
}

// ---- rotateKey -----------------------------------------------------------

export interface RotateKeyResult {
  new_key_id: string;
  key: string;
  key_alias: string;
  old_key_id: string;
}

export async function rotateKey(
  userId: string,
  userEmail: string,
  userOid: string,
  litellmUserId: string,
  keyId: string,
  defaultKeyDurationDays: number,
  litellm: LiteLLMClient,
): Promise<RotateKeyResult> {
  const db = getDb();

  // Ownership check — 404 (not 403) per spec
  const [oldKey] = await db
    .select()
    .from(provisionedKeys)
    .where(
      and(
        eq(provisionedKeys.id, keyId),
        eq(provisionedKeys.userId, userId),
      ),
    )
    .limit(1);

  if (!oldKey) {
    const err = new Error("Key not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const keyAlias = await buildKeyAlias(userId, oldKey.teamAlias);
  const expiresAt = new Date(Date.now() + defaultKeyDurationDays * MS_PER_DAY);

  // Best-effort delete of the old LiteLLM key
  if (oldKey.litellmKeyId) {
    await litellm.deleteKey(oldKey.litellmKeyId).catch((err: unknown) => {
      console.error({ err, key_id: oldKey.id }, "key-service: failed to delete old LiteLLM key during rotation");
    });
  }

  // Mark old key as rotated
  await db
    .update(provisionedKeys)
    .set({ status: "rotated" as PersistedKeyStatus })
    .where(eq(provisionedKeys.id, keyId));

  const keyResp = await litellm.generateKey({
    user_id: litellmUserId,
    team_id: oldKey.teamId,
    models: [],
    key_alias: keyAlias,
    duration: `${defaultKeyDurationDays}d`,
  });

  const rawKey = keyResp.key;

  const [newKey] = await db
    .insert(provisionedKeys)
    .values({
      userId,
      litellmKeyId: keyResp.token_id ?? keyResp.key_name ?? rawKey,
      litellmKeyAlias: keyAlias,
      keyPreview: _makeKeyPreview(rawKey),
      teamId: oldKey.teamId,
      teamAlias: oldKey.teamAlias,
      status: "active" as PersistedKeyStatus,
      portalExpiresAt: expiresAt,
      rotatedFromId: keyId,
    })
    .returning();

  await logAction({
    tx: db as Parameters<typeof logAction>[0]["tx"],
    actorEmail: userEmail,
    actorEntraOid: userOid,
    action: AUDIT_ACTIONS.ACTION_KEY_ROTATED,
    targetType: "key",
    targetId: newKey.id,
    details: { rotated_from_id: keyId, team_id: oldKey.teamId },
  });

  return {
    new_key_id: newKey.id,
    key: rawKey,
    key_alias: keyAlias,
    old_key_id: keyId,
  };
}

// ---- revokeKey -----------------------------------------------------------

export async function revokeKey(
  userId: string,
  userEmail: string,
  userOid: string,
  keyId: string,
  litellm: LiteLLMClient,
): Promise<void> {
  const db = getDb();

  // Ownership check — 404 per spec
  const [key] = await db
    .select()
    .from(provisionedKeys)
    .where(
      and(
        eq(provisionedKeys.id, keyId),
        eq(provisionedKeys.userId, userId),
      ),
    )
    .limit(1);

  if (!key) {
    const err = new Error("Key not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (key.litellmKeyId) {
    await litellm.deleteKey(key.litellmKeyId).catch((err: unknown) => {
      console.error({ err, key_id: key.id }, "key-service: failed to delete LiteLLM key during revocation");
    });
  }

  await db
    .update(provisionedKeys)
    .set({
      status: "revoked" as PersistedKeyStatus,
      revokedAt: new Date(),
    })
    .where(eq(provisionedKeys.id, keyId));

  await logAction({
    tx: db as Parameters<typeof logAction>[0]["tx"],
    actorEmail: userEmail,
    actorEntraOid: userOid,
    action: AUDIT_ACTIONS.ACTION_KEY_REVOKED,
    targetType: "key",
    targetId: keyId,
    details: { team_id: key.teamId },
  });
}
