/**
 * Shared helpers for integration tests (tasks 8.10-8.12).
 *
 * Handles:
 * - DB connection + migration lifecycle
 * - LiteLLM client construction against the harness endpoint
 * - A fake GraphClient that returns a configurable set of group IDs
 *   (real Microsoft Graph cannot be reached from the test harness, and
 *    credentialing it would leak real secrets into the test pipeline)
 * - Unique test-data generation (random emails, oids, team IDs) so
 *   sibling tests don't collide on shared state in Postgres or LiteLLM
 */
import { randomUUID } from "node:crypto";
import { LiteLLMClient } from "../../src/lib/litellm-client.js";
import type { TeamsConfig, TeamConfig } from "../../src/lib/teams-config.js";
import { connectDatabase, closeDatabase, runMigrations, getDb } from "../../src/db/connection.js";
import { users, provisionedKeys, userTeamMemberships, auditLog } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

export const LITELLM_URL = process.env.LITELLM_BASE_URL ?? "http://localhost:54000";
export const LITELLM_KEY = process.env.LITELLM_MASTER_KEY ?? "sk-test-master-integration";

/**
 * Fake GraphClient — implements the shape `provisionUser` / `runDeprovisioningJob`
 * need without touching the real MSAL / fetch code.
 *
 * Tests construct one per user with `new FakeGraphClient({ [oid]: [groupIds] })`.
 */
export class FakeGraphClient {
  private readonly responses: Map<string, string[] | Error>;

  constructor(initial: Record<string, string[] | Error> = {}) {
    this.responses = new Map(Object.entries(initial));
  }

  setUserGroups(oid: string, groupIdsOrError: string[] | Error): void {
    this.responses.set(oid, groupIdsOrError);
  }

  async getUserGroups(oid: string): Promise<string[]> {
    const resp = this.responses.get(oid);
    if (resp === undefined) {
      throw new Error(`FakeGraphClient: no stub for oid=${oid} (set one with setUserGroups)`);
    }
    if (resp instanceof Error) throw resp;
    return resp;
  }
}

/**
 * Construct a LiteLLMClient pointed at the harness.
 */
export function createTestLiteLLMClient(): LiteLLMClient {
  return new LiteLLMClient({ baseUrl: LITELLM_URL, masterKey: LITELLM_KEY });
}

/**
 * Build a minimal TeamsConfig with a single non-default team and a
 * single required_group. Each test gets its own team + group IDs via
 * `randomUUID()` so there's no cross-test collision.
 */
export function buildTeamsConfig(): {
  teamsConfig: TeamsConfig;
  teamGroupId: string;
  requiredGroupId: string;
  team: TeamConfig;
} {
  const teamGroupId = randomUUID();
  const requiredGroupId = randomUUID();
  const team: TeamConfig = {
    entraGroupId: teamGroupId,
    teamAlias: `IntegrationTest-${teamGroupId.slice(0, 8)}`,
    models: ["fake-gpt-4o"],
    maxBudget: 100,
    budgetDuration: "1mo",
    teamMemberBudget: 10,
    litellmRole: "user",
    isDefault: false,
  };
  const teamsConfig: TeamsConfig = {
    teams: [team],
    requiredGroups: [requiredGroupId],
  };
  return { teamsConfig, teamGroupId, requiredGroupId, team };
}

/**
 * Generate a unique test user identity (oid, email, name).
 */
export function makeTestUser(): { oid: string; email: string; name: string } {
  const oid = randomUUID();
  return {
    oid,
    email: `int-test-${oid.slice(0, 8)}@test.invalid`,
    name: `Integration Test User ${oid.slice(0, 8)}`,
  };
}

/**
 * Ensure the DB is connected and migrations are up to date.
 *
 * Called once per test file from `beforeAll`. Subsequent calls are no-ops
 * because `connectDatabase` guards against double-init.
 */
let dbReady = false;
export async function ensureDb(): Promise<void> {
  if (dbReady) return;
  await connectDatabase();
  await runMigrations();
  dbReady = true;
}

/**
 * Best-effort cleanup of a single test user's DB rows + LiteLLM state.
 * Swallows all errors — integration tests should not fail on teardown.
 */
export async function cleanupTestUser(
  oid: string,
  litellmUserId: string | null,
  teamIds: string[],
  litellm: LiteLLMClient,
): Promise<void> {
  const db = getDb();

  try {
    const [user] = await db.select().from(users).where(eq(users.oid, oid));
    if (user) {
      // Fetch all keys and delete them from LiteLLM
      const keys = await db
        .select()
        .from(provisionedKeys)
        .where(eq(provisionedKeys.userId, user.id));

      for (const key of keys) {
        if (key.litellmKeyId) {
          await litellm.deleteKey(key.litellmKeyId).catch(() => undefined);
        }
      }

      // Delete DB rows (FKs cascade)
      await db.delete(provisionedKeys).where(eq(provisionedKeys.userId, user.id));
      await db.delete(userTeamMemberships).where(eq(userTeamMemberships.userId, user.id));
      await db.delete(auditLog).where(eq(auditLog.actorEntraOid, oid));
      await db.delete(users).where(eq(users.id, user.id));
    }
  } catch {
    // swallow — cleanup is best-effort
  }
}

/**
 * Close the DB connection. Call from afterAll in each test file.
 */
export async function teardownDb(): Promise<void> {
  if (!dbReady) return;
  await closeDatabase();
  dbReady = false;
}
