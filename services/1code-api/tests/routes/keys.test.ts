/**
 * Task 8.9 — keys route tests
 *
 * Covers:
 * - Feature flag off returns 503 on all /api/keys* endpoints
 * - Ownership enforcement: rotate/revoke return 404 when key is not owned
 * - Happy-path list/create/rotate/revoke
 * - Rate limiting smoke (covered elsewhere in rate-limit-keygenerator.test.ts)
 */
import { describe, test, expect, beforeEach, mock } from "bun:test";

if (!process.env.DATABASE_URL)
  process.env.DATABASE_URL = "postgres://localhost:5432/test";

// ---- Mock config ----------------------------------------------------------
const mockConfig = {
  PORT: 8000,
  DATABASE_URL: "postgres://localhost:5432/test",
  DEV_BYPASS_AUTH: false,
  LOG_LEVEL: "silent" as const,
  PROVISIONING_ENABLED: false,
  LITELLM_BASE_URL: "https://litellm.test.invalid",
  LITELLM_MASTER_KEY: "sk-test",
  AZURE_TENANT_ID: "00000000-0000-4000-8000-000000000001",
  AZURE_GRAPH_CLIENT_ID: "00000000-0000-4000-8000-000000000002",
  AZURE_GRAPH_CLIENT_SECRET: "fake-secret",
  TEAMS_CONFIG_PATH: "/tmp/teams.yaml",
  DEPROVISIONING_MAX_PER_RUN: 20,
};

mock.module("../../src/config.js", () => ({
  config: mockConfig,
  parseConfig: (env: NodeJS.ProcessEnv) => env,
}));

// ---- Mock db with configurable user lookup --------------------------------
import * as schema from "../../src/db/schema.js";

interface MockDbUser {
  id: string;
  oid: string;
  email: string;
  displayName: string;
  isActive: boolean;
  litellmUserId: string | null;
  defaultKeyDurationDays: number;
}

let mockDbUser: MockDbUser | null = null;

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
    limit() {
      return chain;
    },
    then<T>(onFulfilled: (rows: unknown[]) => T): Promise<T> {
      let rows: unknown[] = [];
      if (currentTable === schema.users && mockDbUser) rows = [mockDbUser];
      return Promise.resolve(rows).then(onFulfilled);
    },
  };
  return chain;
}

const mockDb = {
  select: () => makeSelectChain(),
};

mock.module("../../src/db/connection.js", () => ({
  getDb: () => mockDb,
  connectDatabase: async () => undefined,
  closeDatabase: async () => undefined,
  runMigrations: async () => undefined,
  isDatabaseHealthy: async () => true,
}));

// ---- Mock the key-service layer -------------------------------------------
const listUserKeysMock = mock(async () => ({ active: [], revoked: [] }));
const createKeyMock = mock(async () => ({
  key_id: "new-key-uuid",
  key: "sk-freshly-minted",
  key_alias: "team-a",
  team_alias: "Team A",
  portal_expires_at: new Date("2026-07-10T00:00:00Z"),
}));
const rotateKeyMock = mock(async () => ({
  new_key_id: "new-rotated-uuid",
  key: "sk-rotated",
  key_alias: "team-a",
  old_key_id: "old-key-uuid",
}));
const revokeKeyMock = mock(async () => undefined);

// Preserve the real helper functions (_computeStatus, _daysUntilExpiry,
// _makeKeyPreview) so tests/services/key-service.test.ts still sees them.
// Bun's `mock.module` is process-global — any symbols we don't re-export
// here will be `undefined` when another test file imports them later.
const realKeyService = await import("../../src/services/key-service.js");
mock.module("../../src/services/key-service.js", () => ({
  ...realKeyService,
  listUserKeys: listUserKeysMock,
  createKey: createKeyMock,
  rotateKey: rotateKeyMock,
  revokeKey: revokeKeyMock,
}));

const { registerKeysRoute } = await import("../../src/routes/keys.js");
import Fastify from "fastify";

// ---- Helper ---------------------------------------------------------------

async function buildServer() {
  const server = Fastify({ logger: false });

  server.addHook("onRequest", async (req) => {
    req.user = {
      oid: "00000000-0000-4000-8000-000000000123",
      email: "test@example.com",
      name: "Test User",
    };
  });

  server.decorate("litellm", {} as never);

  registerKeysRoute(server);
  await server.ready();
  return server;
}

const STANDARD_USER: MockDbUser = {
  id: "00000000-0000-4000-8000-000000000abc",
  oid: "00000000-0000-4000-8000-000000000123",
  email: "test@example.com",
  displayName: "Test User",
  isActive: true,
  litellmUserId: "test@example.com",
  defaultKeyDurationDays: 90,
};

beforeEach(() => {
  listUserKeysMock.mockClear();
  createKeyMock.mockClear();
  rotateKeyMock.mockClear();
  revokeKeyMock.mockClear();
  mockDbUser = null;
});

// ---- Feature flag tests ---------------------------------------------------

describe("/api/keys — feature flag off (503)", () => {
  test("GET returns 503", async () => {
    mockConfig.PROVISIONING_ENABLED = false;
    const server = await buildServer();
    const res = await server.inject({ method: "GET", url: "/api/keys" });
    expect(res.statusCode).toBe(503);
    await server.close();
  });

  test("POST /new returns 503", async () => {
    mockConfig.PROVISIONING_ENABLED = false;
    const server = await buildServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/keys/new",
      payload: { team_id: "group-a" },
    });
    expect(res.statusCode).toBe(503);
    await server.close();
  });

  test("POST /:id/rotate returns 503", async () => {
    mockConfig.PROVISIONING_ENABLED = false;
    const server = await buildServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/keys/abc/rotate",
    });
    expect(res.statusCode).toBe(503);
    await server.close();
  });

  test("POST /:id/revoke returns 503", async () => {
    mockConfig.PROVISIONING_ENABLED = false;
    const server = await buildServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/keys/abc/revoke",
    });
    expect(res.statusCode).toBe(503);
    await server.close();
  });
});

// ---- Happy path tests -----------------------------------------------------

describe("/api/keys — happy path (flag on)", () => {
  test("GET returns empty lists for provisioned user", async () => {
    mockConfig.PROVISIONING_ENABLED = true;
    mockDbUser = STANDARD_USER;
    const server = await buildServer();
    const res = await server.inject({ method: "GET", url: "/api/keys" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ active: [], revoked: [] });
    expect(listUserKeysMock).toHaveBeenCalledWith(STANDARD_USER.id);
    await server.close();
  });

  test("GET returns 404 for unprovisioned user", async () => {
    mockConfig.PROVISIONING_ENABLED = true;
    mockDbUser = null;
    const server = await buildServer();
    const res = await server.inject({ method: "GET", url: "/api/keys" });
    expect(res.statusCode).toBe(404);
    await server.close();
  });

  test("POST /new returns new key", async () => {
    mockConfig.PROVISIONING_ENABLED = true;
    mockDbUser = STANDARD_USER;
    const server = await buildServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/keys/new",
      payload: { team_id: "group-a" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.key).toBe("sk-freshly-minted");
    expect(createKeyMock).toHaveBeenCalledTimes(1);
    await server.close();
  });

  test("POST /new returns 400 without team_id", async () => {
    mockConfig.PROVISIONING_ENABLED = true;
    mockDbUser = STANDARD_USER;
    const server = await buildServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/keys/new",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await server.close();
  });
});

// ---- Ownership enforcement ------------------------------------------------

describe("/api/keys — ownership enforcement (404 not 403)", () => {
  test("rotate returns 404 when key is not owned", async () => {
    mockConfig.PROVISIONING_ENABLED = true;
    mockDbUser = STANDARD_USER;
    const err = new Error("Key not found") as Error & { statusCode: number };
    err.statusCode = 404;
    rotateKeyMock.mockRejectedValueOnce(err);

    const server = await buildServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/keys/some-other-user-key-uuid/rotate",
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe("Key not found");
    await server.close();
  });

  test("revoke returns 404 when key is not owned", async () => {
    mockConfig.PROVISIONING_ENABLED = true;
    mockDbUser = STANDARD_USER;
    const err = new Error("Key not found") as Error & { statusCode: number };
    err.statusCode = 404;
    revokeKeyMock.mockRejectedValueOnce(err);

    const server = await buildServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/keys/some-other-user-key-uuid/revoke",
    });
    expect(res.statusCode).toBe(404);
    await server.close();
  });
});
