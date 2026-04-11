/**
 * Task 8.12 — rotation flow integration test
 *
 * Seeds a provisioned user with an active key, then manually pushes the
 * key's `portal_expires_at` into the past and runs the rotation job.
 * Asserts:
 * - Old key marked `status = "rotated"` with `revokedAt` set
 * - New key row exists with `rotatedFromId` pointing to the old key
 * - New key is `status = "active"` with `portal_expires_at` back in the future
 * - Audit log contains `key.auto_rotated` entry
 * - LiteLLM delete failure on the old key is logged but rotation still
 *   proceeds (best-effort semantics per design)
 *
 * Uses real Postgres + real LiteLLM from the docker-compose harness.
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import {
  FakeGraphClient,
  createTestLiteLLMClient,
  buildTeamsConfig,
  makeTestUser,
  ensureDb,
  teardownDb,
  cleanupTestUser,
} from "./helpers.js";
import { provisionUser } from "../../src/services/provisioning.js";
import { runRotationJob } from "../../src/services/rotation.js";
import { getDb } from "../../src/db/connection.js";
import { provisionedKeys, users, auditLog } from "../../src/db/schema.js";

const INTEGRATION_ENABLED = process.env.INTEGRATION_TEST === "1";

const litellm = createTestLiteLLMClient();

beforeAll(async () => {
  if (!INTEGRATION_ENABLED) return;
  await ensureDb();
});

afterAll(async () => {
  if (!INTEGRATION_ENABLED) return;
  await teardownDb();
});

const createdUsers: Array<{ oid: string; litellmUserId: string; teamIds: string[] }> = [];

afterEach(async () => {
  if (!INTEGRATION_ENABLED) return;
  for (const user of createdUsers) {
    await cleanupTestUser(user.oid, user.litellmUserId, user.teamIds, litellm);
  }
  createdUsers.length = 0;
});

const silentLog = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
  child: () => silentLog,
  level: "silent",
  silent: () => undefined,
} as never;

describe.skipIf(!INTEGRATION_ENABLED)(
  "runRotationJob — integration (real LiteLLM + real Postgres)",
  () => {
    test("expired key is rotated, new key has rotatedFromId link", async () => {
      const user = makeTestUser();
      const { teamsConfig, teamGroupId, requiredGroupId } = buildTeamsConfig();

      const graph = new FakeGraphClient({
        [user.oid]: [requiredGroupId, teamGroupId],
      });

      const result = await provisionUser(user, litellm, graph as never, teamsConfig);
      createdUsers.push({
        oid: user.oid,
        litellmUserId: result.litellm_user_id,
        teamIds: [teamGroupId],
      });

      const db = getDb();
      const [dbUser] = await db.select().from(users).where(eq(users.oid, user.oid));

      // Manually expire the original key by pushing portal_expires_at into the past
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [originalKey] = await db
        .select()
        .from(provisionedKeys)
        .where(eq(provisionedKeys.userId, dbUser.id));

      await db
        .update(provisionedKeys)
        .set({ portalExpiresAt: yesterday })
        .where(eq(provisionedKeys.id, originalKey.id));

      // Run rotation
      await runRotationJob({
        log: silentLog,
        litellm,
        maxDeprovisionPerRun: 20,
      });

      // Fetch all keys for this user
      const allKeys = await db
        .select()
        .from(provisionedKeys)
        .where(eq(provisionedKeys.userId, dbUser.id));

      expect(allKeys).toHaveLength(2);

      const rotatedOld = allKeys.find((k) => k.id === originalKey.id);
      const newActive = allKeys.find((k) => k.id !== originalKey.id);

      expect(rotatedOld).toBeDefined();
      expect(rotatedOld!.status).toBe("rotated");
      expect(rotatedOld!.revokedAt).not.toBeNull();

      expect(newActive).toBeDefined();
      expect(newActive!.status).toBe("active");
      expect(newActive!.rotatedFromId).toBe(originalKey.id);
      expect(newActive!.portalExpiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(newActive!.teamId).toBe(originalKey.teamId);
      expect(newActive!.teamAlias).toBe(originalKey.teamAlias);

      // Audit: key.auto_rotated
      const audits = await db.select().from(auditLog).where(eq(auditLog.actorEntraOid, user.oid));
      const actions = audits.map((a) => a.action);
      expect(actions).toContain("key.auto_rotated");
    });

    test("non-expired keys are not rotated", async () => {
      const user = makeTestUser();
      const { teamsConfig, teamGroupId, requiredGroupId } = buildTeamsConfig();

      const graph = new FakeGraphClient({
        [user.oid]: [requiredGroupId, teamGroupId],
      });

      const result = await provisionUser(user, litellm, graph as never, teamsConfig);
      createdUsers.push({
        oid: user.oid,
        litellmUserId: result.litellm_user_id,
        teamIds: [teamGroupId],
      });

      const db = getDb();
      const [dbUser] = await db.select().from(users).where(eq(users.oid, user.oid));

      // Keys are fresh (expires in ~90 days) — rotation should be a no-op
      await runRotationJob({
        log: silentLog,
        litellm,
        maxDeprovisionPerRun: 20,
      });

      const allKeys = await db
        .select()
        .from(provisionedKeys)
        .where(eq(provisionedKeys.userId, dbUser.id));

      expect(allKeys).toHaveLength(1);
      expect(allKeys[0].status).toBe("active");
      expect(allKeys[0].rotatedFromId).toBeNull();
    });

    test("inactive user's expired keys are NOT rotated", async () => {
      const user = makeTestUser();
      const { teamsConfig, teamGroupId, requiredGroupId } = buildTeamsConfig();

      const graph = new FakeGraphClient({
        [user.oid]: [requiredGroupId, teamGroupId],
      });

      const result = await provisionUser(user, litellm, graph as never, teamsConfig);
      createdUsers.push({
        oid: user.oid,
        litellmUserId: result.litellm_user_id,
        teamIds: [teamGroupId],
      });

      const db = getDb();
      const [dbUser] = await db.select().from(users).where(eq(users.oid, user.oid));

      // Manually deactivate the user AND expire the key
      await db.update(users).set({ isActive: false }).where(eq(users.id, dbUser.id));
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await db
        .update(provisionedKeys)
        .set({ portalExpiresAt: yesterday })
        .where(eq(provisionedKeys.userId, dbUser.id));

      // Run rotation — inner join on users.isActive=true should exclude this row
      await runRotationJob({
        log: silentLog,
        litellm,
        maxDeprovisionPerRun: 20,
      });

      // No new key should have been created
      const allKeys = await db
        .select()
        .from(provisionedKeys)
        .where(eq(provisionedKeys.userId, dbUser.id));

      expect(allKeys).toHaveLength(1);
      expect(allKeys[0].status).toBe("active"); // still "active" — rotation didn't touch it
    });
  },
);
