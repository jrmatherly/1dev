/**
 * Task 8.7 — rotation service tests
 *
 * Covers:
 * - Expired key rotated with rotatedFromId link populated
 * - LiteLLM delete failure logged but rotation proceeds
 */
import { describe, test, expect, beforeEach, mock } from "bun:test";

if (!process.env.DATABASE_URL)
  process.env.DATABASE_URL = "postgres://localhost:5432/test";

import * as schema from "../../src/db/schema.js";

// ---- Mock db --------------------------------------------------------------

interface MockKey {
  id: string;
  userId: string;
  litellmKeyId: string | null;
  litellmKeyAlias: string;
  teamId: string;
  teamAlias: string;
  status: "active" | "revoked" | "rotated";
  portalExpiresAt: Date;
}

interface MockUser {
  id: string;
  oid: string;
  email: string;
  isActive: boolean;
  litellmUserId: string | null;
  defaultKeyDurationDays: number;
}

let mockExpiredKeys: Array<{
  keyId: string;
  userId: string;
  defaultKeyDurationDays: number;
}> = [];
let mockKeyById: Map<string, MockKey> = new Map();
let mockUserById: Map<string, MockUser> = new Map();
let mockAliasesByUser: Map<string, Array<{ alias: string }>> = new Map();

const updates: Array<{
  table: string;
  set: Record<string, unknown>;
  whereKeyId?: string;
}> = [];
const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
const auditInserts: Array<Record<string, unknown>> = [];

// Sequence-based state shared across all select chains in a single test run.
//
// The rotation flow calls:
//   1. SELECT ... FROM provisioned_keys INNER JOIN users WHERE ...
//      → returns all expired active keys
//   2. For each expired key, inside _autoRotateKey:
//      a. SELECT ... FROM provisioned_keys WHERE id = keyId
//         → returns the key row
//      b. SELECT ... FROM users WHERE id = key.userId
//         → returns the user row
//      c. SELECT ... FROM provisioned_keys WHERE userId = ... (alias scan)
//         → returns existing aliases
//
// Step 1 happens exactly once. Steps 2a–2c repeat per key in order.
let provKeysSelectCount = 0;
let usersSelectCount = 0;
let lastKeyFetched: MockKey | null = null;

function makeSelectChain() {
  let currentTable: unknown = null;
  let isJoin = false;

  const chain: Record<string, unknown> = {
    from(t: unknown) {
      currentTable = t;
      return chain;
    },
    innerJoin() {
      isJoin = true;
      return chain;
    },
    where() {
      return chain;
    },
    limit() {
      return chain;
    },
    then<T>(onFulfilled: (rows: unknown[]) => T): Promise<T> {
      let rows: unknown[] = [];

      if (currentTable === schema.provisionedKeys) {
        if (isJoin) {
          // Initial expired-keys scan
          rows = mockExpiredKeys;
        } else {
          provKeysSelectCount++;
          // Odd calls (1, 3, 5, ...) are "fetch key by id" — return next key
          // Even calls (2, 4, ...) are "alias scan" for that key's user
          if (provKeysSelectCount % 2 === 1) {
            const next = expiredKeyQueue.shift();
            if (next) {
              const key = mockKeyById.get(next.keyId);
              lastKeyFetched = key ?? null;
              rows = key ? [key] : [];
            }
          } else {
            // Alias scan for the last-fetched key's user
            if (lastKeyFetched) {
              rows = mockAliasesByUser.get(lastKeyFetched.userId) ?? [];
            }
          }
        }
      } else if (currentTable === schema.users) {
        usersSelectCount++;
        if (lastKeyFetched) {
          const user = mockUserById.get(lastKeyFetched.userId);
          rows = user ? [user] : [];
        }
      }

      return Promise.resolve(rows).then(onFulfilled);
    },
  };
  return chain;
}

// Separate state for sequencing the key re-fetches
let expiredKeyQueue: Array<{
  keyId: string;
  userId: string;
  defaultKeyDurationDays: number;
}> = [];

const mockDb = {
  select: () => makeSelectChain(),
  update: (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        updates.push({
          table:
            table === schema.provisionedKeys
              ? "provisioned_keys"
              : table === schema.users
                ? "users"
                : "other",
          set: values,
        });
        return Promise.resolve();
      },
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => ({
      returning: () => {
        const tableName =
          table === schema.provisionedKeys
            ? "provisioned_keys"
            : table === schema.auditLog
              ? "audit_log"
              : "other";
        inserts.push({ table: tableName, values });
        if (table === schema.auditLog) auditInserts.push(values);
        return Promise.resolve([{ id: "new-key-uuid", ...values }]);
      },
    }),
  }),
};

// Override insert for tables that don't need .returning()
mockDb.insert = (table: unknown) => {
  const base = {
    values(values: Record<string, unknown>) {
      const tableName =
        table === schema.provisionedKeys
          ? "provisioned_keys"
          : table === schema.auditLog
            ? "audit_log"
            : "other";
      inserts.push({ table: tableName, values });
      if (table === schema.auditLog) {
        auditInserts.push(values);
        return Promise.resolve();
      }
      return {
        returning: () => Promise.resolve([{ id: "new-key-uuid", ...values }]),
      };
    },
  };
  return base as never;
};

mock.module("../../src/db/connection.js", () => ({
  getDb: () => mockDb,
  connectDatabase: async () => undefined,
  closeDatabase: async () => undefined,
  runMigrations: async () => undefined,
  isDatabaseHealthy: async () => true,
}));

const { runRotationJob } = await import("../../src/services/rotation.js");

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
  };
}

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  mockExpiredKeys = [];
  mockKeyById = new Map();
  mockUserById = new Map();
  mockAliasesByUser = new Map();
  expiredKeyQueue = [];
  provKeysSelectCount = 0;
  usersSelectCount = 0;
  lastKeyFetched = null;
  updates.length = 0;
  inserts.length = 0;
  auditInserts.length = 0;
});

describe("runRotationJob — happy path", () => {
  test("rotates an expired key and links rotatedFromId", async () => {
    const user: MockUser = {
      id: "11111111-1111-1111-1111-111111111111",
      oid: "oid-1",
      email: "u1@example.com",
      isActive: true,
      litellmUserId: "u1@example.com",
      defaultKeyDurationDays: 90,
    };
    mockUserById.set(user.id, user);

    const expiredKey: MockKey = {
      id: "key-old-1",
      userId: user.id,
      litellmKeyId: "sk-old-litellm-id",
      litellmKeyAlias: "team-a",
      teamId: "group-a",
      teamAlias: "Team A",
      status: "active",
      portalExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    };
    mockKeyById.set(expiredKey.id, expiredKey);

    mockExpiredKeys = [
      { keyId: expiredKey.id, userId: user.id, defaultKeyDurationDays: 90 },
    ];
    expiredKeyQueue = [...mockExpiredKeys];

    const litellm = {
      checkHealth: mock(async () => ({ status: "ok" })),
      getTeam: mock(async () => null),
      createTeam: mock(async () => ({})),
      getUser: mock(async () => null),
      createUser: mock(async () => ({})),
      addTeamMember: mock(async () => ({})),
      generateKey: mock(async () => ({
        key: "sk-new-raw",
        token_id: "tok-new",
      })),
      deleteKey: mock(async () => undefined),
    };

    const log = makeLog();

    await runRotationJob({
      log: log as never,
      litellm: litellm as never,
      maxDeprovisionPerRun: 20,
    });

    // Old LiteLLM key was deleted
    expect(litellm.deleteKey).toHaveBeenCalledWith("sk-old-litellm-id");

    // Old key marked rotated
    const rotatedUpdate = updates.find(
      (u) => u.table === "provisioned_keys" && u.set.status === "rotated",
    );
    expect(rotatedUpdate).toBeDefined();

    // New key was generated
    expect(litellm.generateKey).toHaveBeenCalled();

    // New row inserted in provisioned_keys with rotatedFromId link
    const newKeyInsert = inserts.find(
      (i) => i.table === "provisioned_keys" && i.values.rotatedFromId,
    );
    expect(newKeyInsert).toBeDefined();
    expect(newKeyInsert?.values.rotatedFromId).toBe("key-old-1");

    // Audit entry for key.auto_rotated
    const auditActions = auditInserts.map((r) => r.action);
    expect(auditActions).toContain("key.auto_rotated");
  });
});

describe("runRotationJob — LiteLLM delete failure", () => {
  test("logs delete failure but still proceeds with rotation", async () => {
    const user: MockUser = {
      id: "22222222-2222-2222-2222-222222222222",
      oid: "oid-2",
      email: "u2@example.com",
      isActive: true,
      litellmUserId: "u2@example.com",
      defaultKeyDurationDays: 90,
    };
    mockUserById.set(user.id, user);

    const expiredKey: MockKey = {
      id: "key-old-2",
      userId: user.id,
      litellmKeyId: "sk-old-2",
      litellmKeyAlias: "team-a",
      teamId: "group-a",
      teamAlias: "Team A",
      status: "active",
      portalExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    };
    mockKeyById.set(expiredKey.id, expiredKey);

    mockExpiredKeys = [
      { keyId: expiredKey.id, userId: user.id, defaultKeyDurationDays: 90 },
    ];
    expiredKeyQueue = [...mockExpiredKeys];

    const litellm = {
      checkHealth: mock(async () => ({ status: "ok" })),
      getTeam: mock(async () => null),
      createTeam: mock(async () => ({})),
      getUser: mock(async () => null),
      createUser: mock(async () => ({})),
      addTeamMember: mock(async () => ({})),
      generateKey: mock(async () => ({
        key: "sk-new-raw-2",
        token_id: "tok-2",
      })),
      // Delete fails
      deleteKey: mock(async () => {
        throw new Error("LiteLLM temporarily unavailable");
      }),
    };

    const log = makeLog();

    // Should NOT throw — delete failure is swallowed and logged
    await runRotationJob({
      log: log as never,
      litellm: litellm as never,
      maxDeprovisionPerRun: 20,
    });

    expect(log.warn).toHaveBeenCalled();

    // Rotation still proceeded: new key was generated
    expect(litellm.generateKey).toHaveBeenCalled();
  });
});
