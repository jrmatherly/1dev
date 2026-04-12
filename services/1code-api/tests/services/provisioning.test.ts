/**
 * Task 8.4 — provisioning service tests
 *
 * Covers the provisioning error paths: unauthorized user (403),
 * deprovisioned user (409), and Graph failure propagation (5xx).
 *
 * The happy path and idempotency scenarios are exercised in the integration
 * tests (task 8.10) where a real Postgres is available. These unit tests
 * mock the db module so they run fast and deterministically.
 */
import { describe, test, expect, beforeEach, mock } from "bun:test";

// Set DATABASE_URL before loading the config module
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgres://localhost:5432/test";

// Import schema tables so we can identity-match them in the query chain
import * as schema from "../../src/db/schema.js";

// Track all db inserts and queries
interface DbCall {
  op: string;
  args: unknown[];
}
const dbCalls: DbCall[] = [];

// Configurable test state
let mockExistingUser: { id: string; oid: string; email: string; displayName: string; isActive: boolean; litellmUserId: string | null; defaultKeyDurationDays: number } | null = null;
let mockExistingMemberships: Array<{ teamId: string }> = [];
let mockExistingKeys: Array<{ id: string; teamId: string; alias: string }> = [];

// Thenable chain — supports .from().where().limit() and is awaitable at any step
function makeSelectChain() {
  let currentTable: "users" | "user_team_memberships" | "provisioned_keys" | null =
    null;

  function resolveRows(): unknown[] {
    if (currentTable === "users") return mockExistingUser ? [mockExistingUser] : [];
    if (currentTable === "user_team_memberships") return mockExistingMemberships;
    if (currentTable === "provisioned_keys") return mockExistingKeys;
    return [];
  }

  const chain: Record<string, unknown> = {
    from(t: unknown) {
      dbCalls.push({ op: "select.from", args: [t] });
      // Identity-compare against the schema exports so the correct mock
      // data is returned for each query
      if (t === schema.users) currentTable = "users";
      else if (t === schema.userTeamMemberships) currentTable = "user_team_memberships";
      else if (t === schema.provisionedKeys) currentTable = "provisioned_keys";
      return chain;
    },
    where() {
      return chain;
    },
    innerJoin() {
      return chain;
    },
    limit() {
      return chain;
    },
    then<T>(onFulfilled: (rows: unknown[]) => T): Promise<T> {
      return Promise.resolve(resolveRows()).then(onFulfilled);
    },
    catch<T>(onRejected: (err: unknown) => T): Promise<unknown[] | T> {
      return Promise.resolve(resolveRows()).catch(onRejected);
    },
  };
  return chain;
}

const mockDb = {
  select: () => makeSelectChain(),
  insert: () => ({
    values: () => ({
      returning: () =>
        Promise.resolve([
          {
            id: "new-user-uuid",
            oid: "test-oid",
            email: "test@example.com",
            displayName: "Test User",
            litellmUserId: "test@example.com",
            isActive: true,
            defaultKeyDurationDays: 90,
          },
        ]),
    }),
  }),
  transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    // Pass the same mockDb as the transaction context
    return fn(mockDb);
  },
};

mock.module("../../src/db/connection.js", () => ({
  getDb: () => mockDb,
  connectDatabase: async () => undefined,
  closeDatabase: async () => undefined,
  runMigrations: async () => undefined,
  isDatabaseHealthy: async () => true,
}));

// Import after mock is in place
const { provisionUser } = await import("../../src/services/provisioning.js");

// ---- Mock collaborators ----------------------------------------------------

function makeLiteLLM(overrides: Record<string, unknown> = {}) {
  return {
    checkHealth: mock(async () => ({ status: "ok" })),
    getTeam: mock(async () => null),
    createTeam: mock(async () => ({ team_id: "t1" })),
    getUser: mock(async () => null),
    createUser: mock(async () => ({ user_id: "u1" })),
    addTeamMember: mock(async () => ({})),
    generateKey: mock(async () => ({
      key: "sk-test-raw-key",
      token_id: "tok-1",
      key_name: "kn-1",
    })),
    deleteKey: mock(async () => undefined),
    ...overrides,
  };
}

function makeGraph(groupIds: string[] | Error) {
  return {
    getUserGroups: mock(async () => {
      if (groupIds instanceof Error) throw groupIds;
      return groupIds;
    }),
  };
}

const TEAMS_CONFIG = {
  teams: [
    {
      entraGroupId: "group-a",
      teamAlias: "Team A",
      models: ["gpt-4o"],
      maxBudget: 500,
      budgetDuration: "1mo",
      teamMemberBudget: 50,
      litellmRole: "user",
      isDefault: false,
    },
  ],
  requiredGroups: ["gate-group"],
};

const REQUEST_USER = {
  oid: "test-oid",
  email: "test@example.com",
  name: "Test User",
};

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  dbCalls.length = 0;
  mockExistingUser = null;
  mockExistingMemberships = [];
  mockExistingKeys = [];
});

describe("provisionUser — authorization errors", () => {
  test("throws 403 when user is not in any required_groups", async () => {
    const litellm = makeLiteLLM();
    const graph = makeGraph(["some-other-group"]); // not in gate-group

    await expect(
      provisionUser(REQUEST_USER, litellm as never, graph as never, TEAMS_CONFIG),
    ).rejects.toMatchObject({ statusCode: 403 });

    // Must NOT have called any LiteLLM mutations
    expect(litellm.createTeam).not.toHaveBeenCalled();
    expect(litellm.createUser).not.toHaveBeenCalled();
    expect(litellm.generateKey).not.toHaveBeenCalled();
  });

  test("throws 409 when user is already deprovisioned (isActive=false)", async () => {
    mockExistingUser = {
      id: "existing-uuid",
      oid: REQUEST_USER.oid,
      email: REQUEST_USER.email,
      displayName: "Test User",
      isActive: false, // deprovisioned
      litellmUserId: REQUEST_USER.email,
      defaultKeyDurationDays: 90,
    };

    const litellm = makeLiteLLM();
    const graph = makeGraph(["gate-group"]);

    await expect(
      provisionUser(REQUEST_USER, litellm as never, graph as never, TEAMS_CONFIG),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(graph.getUserGroups).not.toHaveBeenCalled();
  });
});

describe("provisionUser — Graph failure propagation", () => {
  test("propagates Graph errors (5xx) without provisioning anything", async () => {
    const litellm = makeLiteLLM();
    const graph = makeGraph(new Error("Graph API unavailable: 503"));

    await expect(
      provisionUser(REQUEST_USER, litellm as never, graph as never, TEAMS_CONFIG),
    ).rejects.toThrow(/Graph API unavailable/);

    expect(litellm.createTeam).not.toHaveBeenCalled();
  });
});

describe("provisionUser — idempotency (already-provisioned)", () => {
  test("skips LiteLLM writes when user already has team + membership + active key", async () => {
    mockExistingUser = {
      id: "existing-uuid",
      oid: REQUEST_USER.oid,
      email: REQUEST_USER.email,
      displayName: "Test User",
      isActive: true,
      litellmUserId: REQUEST_USER.email,
      defaultKeyDurationDays: 90,
    };
    mockExistingMemberships = [{ teamId: "group-a" }];
    mockExistingKeys = [{ id: "key-1", teamId: "group-a", alias: "test-team-a" }];

    const litellm = makeLiteLLM({
      // Pretend LiteLLM already has the team + user
      getTeam: mock(async () => ({ team_id: "group-a", team_alias: "Team A" })),
      getUser: mock(async () => ({ user_id: REQUEST_USER.email })),
    });
    const graph = makeGraph(["gate-group", "group-a"]);

    const result = await provisionUser(
      REQUEST_USER,
      litellm as never,
      graph as never,
      TEAMS_CONFIG,
    );

    // Team is echoed in the response
    expect(result.teams_provisioned).toHaveLength(1);
    expect(result.teams_provisioned[0].team_id).toBe("group-a");

    // But no new keys were generated
    expect(result.keys_generated).toHaveLength(0);

    // And no LiteLLM mutations happened
    expect(litellm.createTeam).not.toHaveBeenCalled();
    expect(litellm.createUser).not.toHaveBeenCalled();
    expect(litellm.addTeamMember).not.toHaveBeenCalled();
    expect(litellm.generateKey).not.toHaveBeenCalled();
  });
});
