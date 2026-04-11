/**
 * Task 8.10 — provision flow integration test
 *
 * Exercises the full POST /api/provision happy path against:
 * - Real Postgres (from the docker-compose harness)
 * - Real LiteLLM admin API (from the docker-compose harness)
 * - Stubbed Graph client (can't reach real Microsoft Graph from a
 *   test harness without leaking credentials)
 *
 * Runs the `provisionUser` service function directly rather than going
 * through the Fastify route layer — the route layer is already covered
 * by tests/routes/provision.test.ts with mocked services. The value
 * here is catching wire-format drift between our `LiteLLMClient` and
 * the real LiteLLM admin API.
 *
 * Prereq: the docker-compose harness in ./docker-compose.yml must be up.
 * Run via: cd services/1code-api && ./tests/integration/run.sh
 *
 * If you run `bun test` directly without starting the harness, the tests
 * skip themselves (INTEGRATION_TEST env var gate).
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { eq, and } from "drizzle-orm";
import {
  FakeGraphClient,
  createTestLiteLLMClient,
  buildTeamsConfig,
  makeTestUser,
  ensureDb,
  teardownDb,
  cleanupTestUser,
} from "./helpers.js";
import { provisionUser, getProvisionStatus } from "../../src/services/provisioning.js";
import { getDb } from "../../src/db/connection.js";
import { users, provisionedKeys, userTeamMemberships, auditLog } from "../../src/db/schema.js";

const INTEGRATION_ENABLED = process.env.INTEGRATION_TEST === "1";

// ---- Lifecycle -------------------------------------------------------------

const litellm = createTestLiteLLMClient();

beforeAll(async () => {
  if (!INTEGRATION_ENABLED) return;
  await ensureDb();
});

afterAll(async () => {
  if (!INTEGRATION_ENABLED) return;
  await teardownDb();
});

// Track cleanup state per test
const createdUsers: Array<{ oid: string; litellmUserId: string; teamIds: string[] }> = [];

afterEach(async () => {
  if (!INTEGRATION_ENABLED) return;
  for (const user of createdUsers) {
    await cleanupTestUser(user.oid, user.litellmUserId, user.teamIds, litellm);
  }
  createdUsers.length = 0;
});

// ---- Tests -----------------------------------------------------------------

describe.skipIf(!INTEGRATION_ENABLED)("provisionUser — integration (real LiteLLM + real Postgres)", () => {
  test("happy path: first-time provision creates user + team + membership + key", async () => {
    const user = makeTestUser();
    const { teamsConfig, teamGroupId, requiredGroupId, team } = buildTeamsConfig();

    const graph = new FakeGraphClient({
      [user.oid]: [requiredGroupId, teamGroupId], // authorized + qualifies for team
    });

    // Execute
    const result = await provisionUser(user, litellm, graph as never, teamsConfig);
    createdUsers.push({
      oid: user.oid,
      litellmUserId: result.litellm_user_id,
      teamIds: [teamGroupId],
    });

    // Assert response shape
    expect(result.user_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.litellm_user_id).toBe(user.email);
    expect(result.teams_provisioned).toHaveLength(1);
    expect(result.teams_provisioned[0].team_id).toBe(teamGroupId);
    expect(result.keys_generated).toHaveLength(1);

    const key = result.keys_generated[0];
    expect(key.key).toMatch(/^sk-/); // real LiteLLM key
    expect(key.team_alias).toBe(team.teamAlias);
    expect(key.portal_expires_at).toBeInstanceOf(Date);

    // Assert DB state
    const db = getDb();
    const [dbUser] = await db.select().from(users).where(eq(users.oid, user.oid));
    expect(dbUser.isActive).toBe(true);
    expect(dbUser.email).toBe(user.email);
    expect(dbUser.litellmUserId).toBe(user.email);

    const memberships = await db
      .select()
      .from(userTeamMemberships)
      .where(eq(userTeamMemberships.userId, dbUser.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].teamId).toBe(teamGroupId);

    const dbKeys = await db
      .select()
      .from(provisionedKeys)
      .where(eq(provisionedKeys.userId, dbUser.id));
    expect(dbKeys).toHaveLength(1);
    expect(dbKeys[0].status).toBe("active");
    expect(dbKeys[0].keyPreview).toMatch(/\.\.\./); // masked preview
    expect(dbKeys[0].portalExpiresAt.getTime()).toBeGreaterThan(Date.now());

    // Assert audit trail
    const audits = await db.select().from(auditLog).where(eq(auditLog.actorEntraOid, user.oid));
    const actions = audits.map((a) => a.action).sort();
    expect(actions).toContain("user.provisioned");
    expect(actions).toContain("team.synced");
    expect(actions).toContain("membership.added");
    expect(actions).toContain("key.generated");

    // Assert LiteLLM state (round-trip to prove wire format works both directions)
    const ltUser = await litellm.getUser(user.email);
    expect(ltUser?.user_id).toBe(user.email);

    const ltTeam = await litellm.getTeam(teamGroupId);
    expect(ltTeam?.team_id).toBe(teamGroupId);
  });

  test("idempotency: second provision call is a no-op (no new writes, same teams echoed)", async () => {
    const user = makeTestUser();
    const { teamsConfig, teamGroupId, requiredGroupId } = buildTeamsConfig();

    const graph = new FakeGraphClient({
      [user.oid]: [requiredGroupId, teamGroupId],
    });

    // First call — creates everything
    const first = await provisionUser(user, litellm, graph as never, teamsConfig);
    createdUsers.push({
      oid: user.oid,
      litellmUserId: first.litellm_user_id,
      teamIds: [teamGroupId],
    });
    expect(first.keys_generated).toHaveLength(1);

    // Second call — same input, should return {keys_generated: []} because
    // the pre-flight read phase finds an existing active key for this team
    const second = await provisionUser(user, litellm, graph as never, teamsConfig);
    expect(second.user_id).toBe(first.user_id);
    expect(second.teams_provisioned).toHaveLength(1);
    expect(second.teams_provisioned[0].team_id).toBe(teamGroupId);
    expect(second.keys_generated).toHaveLength(0);

    // DB should still have exactly one key row
    const db = getDb();
    const [dbUser] = await db.select().from(users).where(eq(users.oid, user.oid));
    const dbKeys = await db
      .select()
      .from(provisionedKeys)
      .where(
        and(
          eq(provisionedKeys.userId, dbUser.id),
          eq(provisionedKeys.status, "active"),
        ),
      );
    expect(dbKeys).toHaveLength(1);
  });

  test("403 when user is not in any required group", async () => {
    const user = makeTestUser();
    const { teamsConfig, teamGroupId } = buildTeamsConfig();

    // User has the team group but NOT the required group — fails the gate
    const graph = new FakeGraphClient({
      [user.oid]: [teamGroupId],
    });

    await expect(
      provisionUser(user, litellm, graph as never, teamsConfig),
    ).rejects.toMatchObject({ statusCode: 403 });

    // Should have written NOTHING to the DB
    const db = getDb();
    const dbUsers = await db.select().from(users).where(eq(users.oid, user.oid));
    expect(dbUsers).toHaveLength(0);
  });

  test("getProvisionStatus returns the persisted state after a successful provision", async () => {
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

    const status = await getProvisionStatus(user);
    expect(status).not.toBeNull();
    expect(status!.user_id).toBe(result.user_id);
    expect(status!.is_active).toBe(true);
    expect(status!.teams).toHaveLength(1);
    expect(status!.teams[0].team_id).toBe(teamGroupId);
    expect(status!.active_key_count).toBe(1);
  });
});
