/**
 * Task 8.2 — graph-client unit tests
 *
 * Covers: token caching (including 60s safety margin), @odata.nextLink
 * pagination across multiple pages, and 4xx error handling with response
 * body logged in the error message.
 *
 * MSAL is mocked at the module level so tests don't try to hit real Entra.
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import { GraphClient } from "../../src/lib/graph-client.js";
import * as msal from "@azure/msal-node";

const FAKE_CONFIG = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  clientId: "00000000-0000-4000-8000-000000000002",
  clientSecret: "fake-secret",
};

// Valid Entra Object ID UUIDs used across the tests. The `getUserGroups`
// method validates `oid` against `OID_PATTERN` before the Graph API URL is
// constructed, so every fixture must be a well-formed UUID.
const OID_1 = "11111111-1111-4111-8111-111111111111";
const OID_2 = "22222222-2222-4222-8222-222222222222";
const OID_MISSING = "33333333-3333-4333-8333-333333333333";

const originalFetch = globalThis.fetch;

// ---- Tests ----------------------------------------------------------------

describe("GraphClient — token caching", () => {
  let acquireSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Spy on the prototype so every new ConfidentialClientApplication uses it
    acquireSpy = spyOn(
      msal.ConfidentialClientApplication.prototype,
      "acquireTokenByClientCredential",
    ).mockResolvedValue({
      accessToken: "fake-token-1",
      expiresOn: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    } as never);

    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ value: [] }), { status: 200 }),
    );
  });

  afterEach(() => {
    acquireSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  test("caches the access token across calls", async () => {
    const client = new GraphClient(FAKE_CONFIG);
    await client.getUserGroups(OID_1);
    await client.getUserGroups(OID_2);
    expect(acquireSpy).toHaveBeenCalledTimes(1);
  });

  test("re-acquires token after cache expiry (simulated)", async () => {
    // First call: token expires in 30s — under the 60s safety margin, so
    // the cache is already stale and a second call must re-acquire.
    acquireSpy.mockResolvedValueOnce({
      accessToken: "near-expiry",
      expiresOn: new Date(Date.now() + 30 * 1000),
    } as never);
    acquireSpy.mockResolvedValueOnce({
      accessToken: "fresh-token",
      expiresOn: new Date(Date.now() + 60 * 60 * 1000),
    } as never);

    const client = new GraphClient(FAKE_CONFIG);
    await client.getUserGroups(OID_1);
    await client.getUserGroups(OID_2);
    expect(acquireSpy).toHaveBeenCalledTimes(2);
  });

  test("throws when MSAL returns no access token", async () => {
    acquireSpy.mockResolvedValueOnce(null as never);
    const client = new GraphClient(FAKE_CONFIG);
    await expect(client.getUserGroups(OID_1)).rejects.toThrow(
      /no access token/,
    );
  });
});

// ---- Pagination -----------------------------------------------------------

describe("GraphClient — pagination", () => {
  let acquireSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    acquireSpy = spyOn(
      msal.ConfidentialClientApplication.prototype,
      "acquireTokenByClientCredential",
    ).mockResolvedValue({
      accessToken: "fake-token",
      expiresOn: new Date(Date.now() + 60 * 60 * 1000),
    } as never);
  });

  afterEach(() => {
    acquireSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  test("follows @odata.nextLink through multiple pages", async () => {
    const page1 = {
      value: [{ id: "group-1" }, { id: "group-2" }],
      "@odata.nextLink": `https://graph.microsoft.com/v1.0/users/${OID_1}/memberOf/microsoft.graph.group?$skiptoken=abc`,
    };
    const page2 = {
      value: [{ id: "group-3" }],
    };

    let callCount = 0;
    globalThis.fetch = mock(async () => {
      callCount++;
      const body = callCount === 1 ? page1 : page2;
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const client = new GraphClient(FAKE_CONFIG);
    const groups = await client.getUserGroups(OID_1);

    expect(groups).toEqual(["group-1", "group-2", "group-3"]);
    expect(callCount).toBe(2);
  });

  test("returns empty array when user has no groups", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ value: [] }), { status: 200 }),
    );

    const client = new GraphClient(FAKE_CONFIG);
    const groups = await client.getUserGroups(OID_1);
    expect(groups).toEqual([]);
  });
});

// ---- Error handling -------------------------------------------------------

describe("GraphClient — 4xx error handling", () => {
  let acquireSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    acquireSpy = spyOn(
      msal.ConfidentialClientApplication.prototype,
      "acquireTokenByClientCredential",
    ).mockResolvedValue({
      accessToken: "fake-token",
      expiresOn: new Date(Date.now() + 60 * 60 * 1000),
    } as never);
  });

  afterEach(() => {
    acquireSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  test("throws with status code and body on 404", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "Request_ResourceNotFound" } }),
          { status: 404 },
        ),
    );

    const client = new GraphClient(FAKE_CONFIG);
    await expect(client.getUserGroups(OID_MISSING)).rejects.toThrow(
      /404.*Request_ResourceNotFound/,
    );
  });

  test("throws on 403 (insufficient permissions)", async () => {
    globalThis.fetch = mock(
      async () => new Response("Forbidden", { status: 403 }),
    );

    const client = new GraphClient(FAKE_CONFIG);
    await expect(client.getUserGroups(OID_1)).rejects.toThrow(/403/);
  });
});

// ---- OID validation (defense-in-depth for CodeQL js/request-forgery) ------

describe("GraphClient — oid validation", () => {
  let acquireSpy: ReturnType<typeof spyOn>;
  let fetchSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    acquireSpy = spyOn(
      msal.ConfidentialClientApplication.prototype,
      "acquireTokenByClientCredential",
    ).mockResolvedValue({
      accessToken: "fake-token",
      expiresOn: new Date(Date.now() + 60 * 60 * 1000),
    } as never);

    fetchSpy = mock(
      async () => new Response(JSON.stringify({ value: [] }), { status: 200 }),
    );
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    acquireSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  test.each([
    ["empty string", ""],
    ["path traversal attempt", "me/messages?$filter=startswith"],
    ["slash injection", "../admin"],
    ["non-UUID plain string", "not-a-uuid"],
    ["UUID with extra suffix", `${OID_1}/messages`],
    ["UUID with trailing newline", `${OID_1}\n`],
    ["too short", "11111111-1111-4111-8111-11111111111"],
    ["missing hyphens", "11111111111141118111111111111111"],
    ["non-hex characters", "gggggggg-gggg-4ggg-8ggg-gggggggggggg"],
  ])("rejects invalid oid: %s", async (_label, badOid) => {
    const client = new GraphClient(FAKE_CONFIG);
    await expect(client.getUserGroups(badOid)).rejects.toThrow(
      /invalid oid format/,
    );
    // The sink must never be reached when validation fails.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("accepts valid lowercase UUID", async () => {
    const client = new GraphClient(FAKE_CONFIG);
    await expect(
      client.getUserGroups("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
    ).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("accepts valid uppercase UUID", async () => {
    const client = new GraphClient(FAKE_CONFIG);
    await expect(
      client.getUserGroups("AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"),
    ).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
