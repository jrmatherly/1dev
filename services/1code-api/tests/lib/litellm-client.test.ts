/**
 * Task 8.3 — litellm-client unit tests
 *
 * Covers each of the 8 methods with mocked fetch, plus 404-returns-null
 * semantics for getUser and getTeam.
 */
import { describe, test, expect, afterEach, mock } from "bun:test";
import { LiteLLMClient } from "../../src/lib/litellm-client.js";

const FAKE_CONFIG = {
  baseUrl: "https://litellm.test.invalid",
  masterKey: "sk-test-master",
};

const originalFetch = globalThis.fetch;

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

function makeMockFetch(responses: Array<{ status: number; body: unknown }>): {
  fn: typeof fetch;
  calls: CapturedRequest[];
} {
  const calls: CapturedRequest[] = [];
  let idx = 0;
  const fn = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: init?.headers as Record<string, string>,
      body,
    });
    const resp = responses[idx] ?? responses.at(-1)!;
    idx++;
    return new Response(JSON.stringify(resp.body), { status: resp.status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---- checkHealth ----------------------------------------------------------

describe("LiteLLMClient — checkHealth", () => {
  test("returns status from /health", async () => {
    const { fn, calls } = makeMockFetch([
      { status: 200, body: { status: "ok" } },
    ]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    const result = await client.checkHealth();
    expect(result).toEqual({ status: "ok" });
    expect(calls[0].url).toBe("https://litellm.test.invalid/health");
    expect(calls[0].headers.Authorization).toBe("Bearer sk-test-master");
  });
});

// ---- Team -----------------------------------------------------------------

describe("LiteLLMClient — getTeam", () => {
  test("returns team info on 200", async () => {
    const { fn } = makeMockFetch([
      { status: 200, body: { team_id: "team-1", team_alias: "Team One" } },
    ]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    const team = await client.getTeam("team-1");
    expect(team?.team_alias).toBe("Team One");
  });

  test("returns null on 404", async () => {
    const { fn } = makeMockFetch([
      { status: 404, body: { error: "not found" } },
    ]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    const team = await client.getTeam("nonexistent");
    expect(team).toBeNull();
  });

  test("throws on 500", async () => {
    const { fn } = makeMockFetch([{ status: 500, body: { error: "boom" } }]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    await expect(client.getTeam("team-1")).rejects.toThrow(/500/);
  });
});

describe("LiteLLMClient — createTeam", () => {
  test("POSTs to /team/new with expected body", async () => {
    const { fn, calls } = makeMockFetch([
      { status: 200, body: { team_id: "team-1" } },
    ]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    await client.createTeam({
      team_id: "team-1",
      team_alias: "Team One",
      models: ["gpt-4o"],
      max_budget: 500,
      budget_duration: "1mo",
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://litellm.test.invalid/team/new");
    expect(calls[0].body).toEqual({
      team_id: "team-1",
      team_alias: "Team One",
      models: ["gpt-4o"],
      max_budget: 500,
      budget_duration: "1mo",
    });
  });
});

// ---- User -----------------------------------------------------------------

describe("LiteLLMClient — getUser", () => {
  test("returns user info on 200", async () => {
    const { fn } = makeMockFetch([
      {
        status: 200,
        body: { user_id: "user@example.com", user_email: "user@example.com" },
      },
    ]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    const user = await client.getUser("user@example.com");
    expect(user?.user_id).toBe("user@example.com");
  });

  test("returns null on 404", async () => {
    const { fn } = makeMockFetch([{ status: 404, body: {} }]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    const user = await client.getUser("nobody@example.com");
    expect(user).toBeNull();
  });
});

describe("LiteLLMClient — createUser", () => {
  test("POSTs to /user/new", async () => {
    const { fn, calls } = makeMockFetch([
      { status: 200, body: { user_id: "u@example.com" } },
    ]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    await client.createUser({
      user_id: "u@example.com",
      user_email: "u@example.com",
      user_alias: "U",
    });
    expect(calls[0].url).toBe("https://litellm.test.invalid/user/new");
    expect(calls[0].method).toBe("POST");
  });
});

// ---- Team membership ------------------------------------------------------

describe("LiteLLMClient — addTeamMember", () => {
  test("POSTs to /team/member_add", async () => {
    const { fn, calls } = makeMockFetch([{ status: 200, body: {} }]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    await client.addTeamMember({
      team_id: "team-1",
      member: [{ user_id: "u@example.com", role: "user" }],
    });
    expect(calls[0].url).toBe("https://litellm.test.invalid/team/member_add");
    expect(calls[0].body).toEqual({
      team_id: "team-1",
      member: [{ user_id: "u@example.com", role: "user" }],
    });
  });
});

// ---- Keys -----------------------------------------------------------------

describe("LiteLLMClient — generateKey", () => {
  test("POSTs to /key/generate and returns raw key", async () => {
    const { fn, calls } = makeMockFetch([
      { status: 200, body: { key: "sk-abc123", token_id: "tok-1" } },
    ]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    const result = await client.generateKey({
      user_id: "u@example.com",
      team_id: "team-1",
      models: ["gpt-4o"],
      key_alias: "my-key",
      duration: "90d",
    });
    expect(result.key).toBe("sk-abc123");
    expect(calls[0].url).toBe("https://litellm.test.invalid/key/generate");
  });
});

describe("LiteLLMClient — deleteKey", () => {
  test("POSTs to /key/delete with keys array", async () => {
    const { fn, calls } = makeMockFetch([{ status: 200, body: {} }]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    await client.deleteKey("sk-abc123");
    expect(calls[0].url).toBe("https://litellm.test.invalid/key/delete");
    expect(calls[0].body).toEqual({ keys: ["sk-abc123"] });
  });

  test("throws on 5xx", async () => {
    const { fn } = makeMockFetch([{ status: 500, body: { error: "boom" } }]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient(FAKE_CONFIG);
    await expect(client.deleteKey("sk-abc123")).rejects.toThrow(/500/);
  });
});

// ---- Base URL normalisation -----------------------------------------------

describe("LiteLLMClient — trailing slash handling", () => {
  test("strips trailing slash from baseUrl", async () => {
    const { fn, calls } = makeMockFetch([
      { status: 200, body: { status: "ok" } },
    ]);
    globalThis.fetch = fn;
    const client = new LiteLLMClient({
      ...FAKE_CONFIG,
      baseUrl: "https://litellm.test.invalid/",
    });
    await client.checkHealth();
    expect(calls[0].url).toBe("https://litellm.test.invalid/health");
  });
});
