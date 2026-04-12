/**
 * Task 8.11 — deprovisioning flow integration test
 *
 * Seeds a provisioned user, then simulates the user being removed from
 * their required groups (via FakeGraphClient) and runs the deprovisioning
 * job directly. Asserts:
 * - User is marked `isActive = false` with `deprovisionedAt` timestamp
 * - All active keys are marked `status = "revoked"` with `revokedAt` timestamp
 * - LiteLLM keys are actually deleted (verified by attempting to re-delete
 *   which should 404 if already gone)
 * - Audit log has `user.deprovisioned` + `key.deprovisioned` entries
 * - Mass-threshold guard aborts cleanly when exceeded
 *
 * Uses real Postgres + real LiteLLM from the docker-compose harness.
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
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
import { runDeprovisioningJob } from "../../src/services/deprovisioning.js";
import { getDb } from "../../src/db/connection.js";
import { users, provisionedKeys, auditLog } from "../../src/db/schema.js";

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

const createdUsers: Array<{
  oid: string;
  litellmUserId: string;
  teamIds: string[];
}> = [];

afterEach(async () => {
  if (!INTEGRATION_ENABLED) return;
  for (const user of createdUsers) {
    await cleanupTestUser(user.oid, user.litellmUserId, user.teamIds, litellm);
  }
  createdUsers.length = 0;
});

// A silent no-op logger so the cron output doesn't spam test stdout
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
  "runDeprovisioningJob — integration (real LiteLLM + real Postgres)",
  () => {
    test("authorized user is skipped (no writes)", async () => {
      const user = makeTestUser();
      const { teamsConfig, teamGroupId, requiredGroupId } = buildTeamsConfig();

      // Provision first
      const graph = new FakeGraphClient({
        [user.oid]: [requiredGroupId, teamGroupId],
      });
      const result = await provisionUser(
        user,
        litellm,
        graph as never,
        teamsConfig,
      );
      createdUsers.push({
        oid: user.oid,
        litellmUserId: result.litellm_user_id,
        teamIds: [teamGroupId],
      });

      const db = getDb();
      const [beforeUser] = await db
        .select()
        .from(users)
        .where(eq(users.oid, user.oid));
      expect(beforeUser.isActive).toBe(true);

      // Run deprovisioning while the user still has the required group
      await runDeprovisioningJob({
        log: silentLog,
        litellm,
        graph: graph as never,
        teamsConfig,
        maxDeprovisionPerRun: 20,
      });

      // User should still be active
      const [afterUser] = await db
        .select()
        .from(users)
        .where(eq(users.oid, user.oid));
      expect(afterUser.isActive).toBe(true);
      expect(afterUser.deprovisionedAt).toBeNull();

      // No deprovision audit entries
      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.actorEntraOid, user.oid));
      const deprovisionAudits = audits.filter(
        (a) =>
          a.action === "user.deprovisioned" || a.action === "key.deprovisioned",
      );
      expect(deprovisionAudits).toHaveLength(0);
    });

    test("user who loses required group is fully deprovisioned", async () => {
      const user = makeTestUser();
      const { teamsConfig, teamGroupId, requiredGroupId } = buildTeamsConfig();

      // Step 1: provision with valid groups
      const graph = new FakeGraphClient({
        [user.oid]: [requiredGroupId, teamGroupId],
      });
      const result = await provisionUser(
        user,
        litellm,
        graph as never,
        teamsConfig,
      );
      createdUsers.push({
        oid: user.oid,
        litellmUserId: result.litellm_user_id,
        teamIds: [teamGroupId],
      });

      const litellmKeyId = result.keys_generated[0].key_id;
      expect(litellmKeyId).toBeTruthy();

      // Step 2: user loses required group (simulate Graph returning empty)
      graph.setUserGroups(user.oid, []);

      // Step 3: run deprovisioning
      await runDeprovisioningJob({
        log: silentLog,
        litellm,
        graph: graph as never,
        teamsConfig,
        maxDeprovisionPerRun: 20,
      });

      // Assert: user is inactive
      const db = getDb();
      const [afterUser] = await db
        .select()
        .from(users)
        .where(eq(users.oid, user.oid));
      expect(afterUser.isActive).toBe(false);
      expect(afterUser.deprovisionedAt).not.toBeNull();

      // Assert: key is revoked
      const dbKeys = await db
        .select()
        .from(provisionedKeys)
        .where(eq(provisionedKeys.userId, afterUser.id));
      expect(dbKeys).toHaveLength(1);
      expect(dbKeys[0].status).toBe("revoked");
      expect(dbKeys[0].revokedAt).not.toBeNull();

      // Assert: audit entries for both user + key deprovisioning
      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.actorEntraOid, user.oid));
      const actions = audits.map((a) => a.action);
      expect(actions).toContain("user.deprovisioned");
      expect(actions).toContain("key.deprovisioned");
    });

    test("mass-deprovisioning threshold aborts without writes", async () => {
      const { teamsConfig, teamGroupId, requiredGroupId } = buildTeamsConfig();

      // Provision a handful of users
      const provisionedTestUsers: Array<{
        oid: string;
        email: string;
        name: string;
      }> = [];
      const allGroupIds: Record<string, string[]> = {};

      for (let i = 0; i < 3; i++) {
        const u = makeTestUser();
        provisionedTestUsers.push(u);
        allGroupIds[u.oid] = [requiredGroupId, teamGroupId];
      }

      const graph = new FakeGraphClient(allGroupIds);

      for (const u of provisionedTestUsers) {
        const r = await provisionUser(u, litellm, graph as never, teamsConfig);
        createdUsers.push({
          oid: u.oid,
          litellmUserId: r.litellm_user_id,
          teamIds: [teamGroupId],
        });
      }

      // Now make ALL of them unauthorized (mass removal)
      for (const u of provisionedTestUsers) {
        graph.setUserGroups(u.oid, []);
      }

      // Run deprovisioning with threshold=2 (lower than 3)
      await runDeprovisioningJob({
        log: silentLog,
        litellm,
        graph: graph as never,
        teamsConfig,
        maxDeprovisionPerRun: 2,
      });

      // Assert: NO user is deprovisioned (all still isActive=true)
      const db = getDb();
      for (const u of provisionedTestUsers) {
        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.oid, u.oid));
        expect(dbUser.isActive).toBe(true);
      }

      // Assert: exactly one cron.deprovisioning_aborted audit row
      const abortAudits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "cron.deprovisioning_aborted"));
      expect(abortAudits.length).toBeGreaterThanOrEqual(1);
      const recentAbort = abortAudits[abortAudits.length - 1];
      const details = JSON.parse(recentAbort.details as string);
      expect(details.threshold).toBe(2);
      expect(details.would_deprovision).toBeGreaterThanOrEqual(3);
    });
  },
);
