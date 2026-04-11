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

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ value: [] }), { status: 200 }),
    );
  });

  afterEach(() => {
    acquireSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  test("caches the access token across calls", async () => {
    const client = new GraphClient(FAKE_CONFIG);
    await client.getUserGroups("oid-1");
    await client.getUserGroups("oid-2");
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
    await client.getUserGroups("oid-1");
    await client.getUserGroups("oid-2");
    expect(acquireSpy).toHaveBeenCalledTimes(2);
  });

  test("throws when MSAL returns no access token", async () => {
    acquireSpy.mockResolvedValueOnce(null as never);
    const client = new GraphClient(FAKE_CONFIG);
    await expect(client.getUserGroups("oid-1")).rejects.toThrow(
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
      "@odata.nextLink":
        "https://graph.microsoft.com/v1.0/users/oid-1/memberOf/microsoft.graph.group?$skiptoken=abc",
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
    const groups = await client.getUserGroups("oid-1");

    expect(groups).toEqual(["group-1", "group-2", "group-3"]);
    expect(callCount).toBe(2);
  });

  test("returns empty array when user has no groups", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ value: [] }), { status: 200 }),
    );

    const client = new GraphClient(FAKE_CONFIG);
    const groups = await client.getUserGroups("oid-1");
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
    await expect(client.getUserGroups("missing-oid")).rejects.toThrow(
      /404.*Request_ResourceNotFound/,
    );
  });

  test("throws on 403 (insufficient permissions)", async () => {
    globalThis.fetch = mock(
      async () => new Response("Forbidden", { status: 403 }),
    );

    const client = new GraphClient(FAKE_CONFIG);
    await expect(client.getUserGroups("oid-1")).rejects.toThrow(/403/);
  });
});
