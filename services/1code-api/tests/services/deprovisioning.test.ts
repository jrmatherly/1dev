/**
 * Task 8.6 — deprovisioning service tests
 *
 * Covers:
 * - Authorized user is skipped
 * - Unauthorized user is fully deprovisioned
 * - Per-user catch on Graph error (one bad user doesn't kill the run)
 * - Mass-deprovisioning threshold: if would_deprovision > maxDeprovisionPerRun,
 *   abort without ANY writes and emit a cron.deprovisioning_aborted audit row
 */
import { describe, test, expect, beforeEach, mock } from "bun:test";

if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgres://localhost:5432/test";

import * as schema from "../../src/db/schema.js";

// ---- Mock db --------------------------------------------------------------

interface MockUser {
  id: string;
  oid: string;
  email: string;
  isActive: boolean;
  deprovisionedAt: Date | null;
}

let mockActiveUsers: MockUser[] = [];
let mockUserById: Map<string, MockUser> = new Map();
let mockKeysByUser: Map<string, Array<{ id: string; teamId: string; litellmKeyId: string | null; status: string }>> = new Map();

const updates: Array<{ table: string; set: Record<string, unknown> }> = [];
const auditInserts: Array<Record<string, unknown>> = [];

function resolveSelectRows(table: unknown): unknown[] {
  if (table === schema.users) {
    // Return the list of active users when queried for the initial scan
    return mockActiveUsers;
  }
  if (table === schema.provisionedKeys) {
    return [];
  }
  return [];
}

// The deprovisioning flow does these selects in order:
//   1. SELECT users (initial scan — returns all active users)
//   2. For each user that needs deprovisioning, inside _deprovisionUser:
//      a. SELECT users WHERE id = userId (re-fetch)
//      b. SELECT provisionedKeys WHERE userId = userId AND status = 'active'
//
// We use a counter on users-selects: 0 → scan, 1+ → per-user re-fetch.
// Per-user re-fetch pops from `perUserSequence`, and the matching keys
// come from `mockKeysByUser` keyed on the user's id.
let usersSelectCount = 0;
let perUserSequence: MockUser[] = [];
let lastUserSelectedForKeys: MockUser | null = null;

function makeSelectChain() {
  let currentTable: unknown = null;

  const chain: Record<string, unknown> = {
    from(t: unknown) {
      currentTable = t;
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
      let rows: unknown[] = [];
      if (currentTable === schema.users) {
        if (usersSelectCount === 0) {
          rows = mockActiveUsers;
        } else {
          // Per-user re-fetch
          const next = perUserSequence.shift();
          lastUserSelectedForKeys = next ?? null;
          rows = next ? [next] : [];
        }
        usersSelectCount++;
      } else if (currentTable === schema.provisionedKeys) {
        // Return the keys for the most recently re-fetched user
        if (lastUserSelectedForKeys) {
          rows = mockKeysByUser.get(lastUserSelectedForKeys.id) ?? [];
        }
      }
      return Promise.resolve(rows).then(onFulfilled);
    },
  };
  return chain;
}

const mockDb = {
  select: () => makeSelectChain(),
  update: (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        updates.push({
          table: table === schema.users ? "users" : table === schema.provisionedKeys ? "provisioned_keys" : "other",
          set: values,
        });
        return Promise.resolve();
      },
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      if (table === schema.auditLog) {
        auditInserts.push(values);
      }
      return Promise.resolve();
    },
  }),
};

mock.module("../../src/db/connection.js", () => ({
  getDb: () => mockDb,
  connectDatabase: async () => undefined,
  closeDatabase: async () => undefined,
  runMigrations: async () => undefined,
  isDatabaseHealthy: async () => true,
}));

const { runDeprovisioningJob } = await import("../../src/services/deprovisioning.js");

// ---- Helpers --------------------------------------------------------------

function makeLog() {
  return {
    info: mock(() => undefined),
    warn: mock(() => undefined),
    error: mock(() => undefined),
    debug: mock(() => undefined),
    trace: mock(() => undefined),
    fatal: mock(() => undefined),
    child: mock(() => makeLog()),
    level: "info",
    silent: mock(() => undefined),
  };
}

function makeLiteLLM() {
  return {
    checkHealth: mock(async () => ({ status: "ok" })),
    getTeam: mock(async () => null),
    createTeam: mock(async () => ({ team_id: "t1" })),
    getUser: mock(async () => null),
    createUser: mock(async () => ({ user_id: "u1" })),
    addTeamMember: mock(async () => ({})),
    generateKey: mock(async () => ({ key: "sk-new" })),
    deleteKey: mock(async () => undefined),
  };
}

const BASE_TEAMS_CONFIG = {
  teams: [
    {
      entraGroupId: "group-a",
      teamAlias: "Team A",
      models: [],
      maxBudget: 0,
      budgetDuration: "1mo",
      teamMemberBudget: 0,
      litellmRole: "user",
      isDefault: false,
    },
  ],
  requiredGroups: ["gate-group"],
};

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  mockActiveUsers = [];
  mockUserById = new Map();
  mockKeysByUser = new Map();
  updates.length = 0;
  auditInserts.length = 0;
  usersSelectCount = 0;
  perUserSequence = [];
  lastUserSelectedForKeys = null;
});

describe("runDeprovisioningJob — user authorization check", () => {
  test("skips user who is still in a required group", async () => {
    const user: MockUser = {
      id: "11111111-1111-1111-1111-111111111111",
      oid: "oid-1",
      email: "u1@example.com",
      isActive: true,
      deprovisionedAt: null,
    };
    mockActiveUsers = [user];
    mockUserById.set(user.id, user);

    const log = makeLog();
    const litellm = makeLiteLLM();
    const graph = { getUserGroups: mock(async () => ["gate-group", "group-a"]) };

    await runDeprovisioningJob({
      log: log as never,
      litellm: litellm as never,
      graph: graph as never,
      teamsConfig: BASE_TEAMS_CONFIG,
      maxDeprovisionPerRun: 20,
    });

    // No updates or audit inserts — user was skipped
    expect(updates.filter((u) => u.table === "users")).toHaveLength(0);
    expect(auditInserts).toHaveLength(0);
  });

  test("deprovisions user who is no longer in any required group", async () => {
    const user: MockUser = {
      id: "22222222-2222-2222-2222-222222222222",
      oid: "oid-2",
      email: "u2@example.com",
      isActive: true,
      deprovisionedAt: null,
    };
    mockActiveUsers = [user];
    mockUserById.set(user.id, user);
    mockKeysByUser.set(user.id, [
      { id: "key-1", teamId: "group-a", litellmKeyId: "sk-key-1", status: "active" },
    ]);
    // One user will be re-fetched during _deprovisionUser
    perUserSequence = [user];

    const log = makeLog();
    const litellm = makeLiteLLM();
    const graph = { getUserGroups: mock(async () => ["some-other-group"]) };

    await runDeprovisioningJob({
      log: log as never,
      litellm: litellm as never,
      graph: graph as never,
      teamsConfig: BASE_TEAMS_CONFIG,
      maxDeprovisionPerRun: 20,
    });

    // Key revocation: one update on provisioned_keys setting status=revoked
    const keyRevocations = updates.filter(
      (u) => u.table === "provisioned_keys" && u.set.status === "revoked",
    );
    expect(keyRevocations).toHaveLength(1);

    // User deactivation: one update on users setting isActive=false
    const userDeactivations = updates.filter(
      (u) => u.table === "users" && u.set.isActive === false,
    );
    expect(userDeactivations).toHaveLength(1);

    // LiteLLM deleteKey was attempted
    expect(litellm.deleteKey).toHaveBeenCalledWith("sk-key-1");

    // Audit entries for key.deprovisioned + user.deprovisioned
    const actions = auditInserts.map((r) => r.action);
    expect(actions).toContain("key.deprovisioned");
    expect(actions).toContain("user.deprovisioned");
  });
});

describe("runDeprovisioningJob — per-user Graph error handling", () => {
  test("one Graph failure does not abort the whole run", async () => {
    const goodUser: MockUser = {
      id: "33333333-3333-3333-3333-333333333333",
      oid: "oid-good",
      email: "good@example.com",
      isActive: true,
      deprovisionedAt: null,
    };
    const badUser: MockUser = {
      id: "44444444-4444-4444-4444-444444444444",
      oid: "oid-bad",
      email: "bad@example.com",
      isActive: true,
      deprovisionedAt: null,
    };
    mockActiveUsers = [badUser, goodUser];
    mockUserById.set(goodUser.id, goodUser);
    mockUserById.set(badUser.id, badUser);

    const log = makeLog();
    const litellm = makeLiteLLM();
    const graph = {
      getUserGroups: mock(async (oid: string) => {
        if (oid === "oid-bad") throw new Error("Graph 503");
        return ["gate-group"]; // good user stays authorized
      }),
    };

    await runDeprovisioningJob({
      log: log as never,
      litellm: litellm as never,
      graph: graph as never,
      teamsConfig: BASE_TEAMS_CONFIG,
      maxDeprovisionPerRun: 20,
    });

    // Bad user error was logged
    expect(log.error).toHaveBeenCalled();

    // Neither user was deprovisioned (bad user errored, good user authorized)
    const userDeactivations = updates.filter(
      (u) => u.table === "users" && u.set.isActive === false,
    );
    expect(userDeactivations).toHaveLength(0);
  });
});

describe("runDeprovisioningJob — mass-threshold abort guard", () => {
  test("aborts without writes when would_deprovision exceeds threshold", async () => {
    // 25 users, all unauthorized → would try to deprovision all 25
    const users: MockUser[] = [];
    for (let i = 0; i < 25; i++) {
      const u: MockUser = {
        id: `000000${i.toString().padStart(2, "0")}-0000-0000-0000-000000000000`,
        oid: `oid-${i}`,
        email: `u${i}@example.com`,
        isActive: true,
        deprovisionedAt: null,
      };
      users.push(u);
      mockUserById.set(u.id, u);
    }
    mockActiveUsers = users;

    const log = makeLog();
    const litellm = makeLiteLLM();
    const graph = { getUserGroups: mock(async () => ["some-other-group"]) };

    await runDeprovisioningJob({
      log: log as never,
      litellm: litellm as never,
      graph: graph as never,
      teamsConfig: BASE_TEAMS_CONFIG,
      maxDeprovisionPerRun: 20, // threshold < 25
    });

    // No user or key updates
    expect(updates.filter((u) => u.table === "users")).toHaveLength(0);
    expect(updates.filter((u) => u.table === "provisioned_keys")).toHaveLength(0);

    // Exactly one audit row for the abort
    const abortAudits = auditInserts.filter(
      (r) => r.action === "cron.deprovisioning_aborted",
    );
    expect(abortAudits).toHaveLength(1);

    // Audit row has threshold + would_deprovision in details
    const details = JSON.parse(abortAudits[0].details as string);
    expect(details.threshold).toBe(20);
    expect(details.would_deprovision).toBe(25);

    // Error was logged at level=error
    expect(log.error).toHaveBeenCalled();
  });

  test("proceeds normally when would_deprovision is at or below threshold", async () => {
    // 20 users (equal to threshold) — should all deprovision
    const users: MockUser[] = [];
    for (let i = 0; i < 20; i++) {
      const u: MockUser = {
        id: `000000${i.toString().padStart(2, "0")}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
        oid: `oid-b-${i}`,
        email: `u${i}@example.com`,
        isActive: true,
        deprovisionedAt: null,
      };
      users.push(u);
      mockUserById.set(u.id, u);
      mockKeysByUser.set(u.id, []);
    }
    mockActiveUsers = users;

    const log = makeLog();
    const litellm = makeLiteLLM();
    const graph = { getUserGroups: mock(async () => ["some-other-group"]) };

    await runDeprovisioningJob({
      log: log as never,
      litellm: litellm as never,
      graph: graph as never,
      teamsConfig: BASE_TEAMS_CONFIG,
      maxDeprovisionPerRun: 20,
    });

    // No abort audit row
    const abortAudits = auditInserts.filter(
      (r) => r.action === "cron.deprovisioning_aborted",
    );
    expect(abortAudits).toHaveLength(0);
  });
});
