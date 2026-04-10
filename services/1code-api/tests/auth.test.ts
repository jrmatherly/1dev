import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";

// We test the auth logic by importing extractUser and authHook
// and simulating Fastify request/reply objects.

// Mock config before importing auth
let mockConfig = { DEV_BYPASS_AUTH: false, PORT: 8000, DATABASE_URL: "postgresql://localhost/test", LOG_LEVEL: "info" as const };
mock.module("../src/config.js", () => ({ config: mockConfig }));

const { extractUser, authHook } = await import("../src/auth.js");

function makeReq(headers: Record<string, string> = {}, url = "/api/test"): FastifyRequest {
  return { headers, url } as unknown as FastifyRequest;
}

function makeReply(): { code: ReturnType<typeof mock>; send: ReturnType<typeof mock>; reply: FastifyReply } {
  const reply = {
    code: mock(() => reply),
    send: mock(() => reply),
  };
  return { ...reply, reply: reply as unknown as FastifyReply };
}

describe("extractUser", () => {
  beforeEach(() => {
    mockConfig.DEV_BYPASS_AUTH = false;
  });

  test("extracts user from gateway headers", () => {
    const req = makeReq({
      "x-user-oid": "abc-123",
      "x-user-email": "user@example.com",
      "x-user-name": "Test User",
    });
    const user = extractUser(req);
    expect(user).toEqual({
      oid: "abc-123",
      email: "user@example.com",
      name: "Test User",
    });
  });

  test("returns null when headers missing in prod mode", () => {
    const req = makeReq({});
    const user = extractUser(req);
    expect(user).toBeNull();
  });

  test("returns dev user when DEV_BYPASS_AUTH=true and no headers", () => {
    mockConfig.DEV_BYPASS_AUTH = true;
    const req = makeReq({});
    const user = extractUser(req);
    expect(user).not.toBeNull();
    expect(user!.oid).toBe("00000000-0000-0000-0000-000000000000");
    expect(user!.email).toBe("dev@localhost");
  });

  test("uses gateway headers even when dev bypass is on", () => {
    mockConfig.DEV_BYPASS_AUTH = true;
    const req = makeReq({
      "x-user-oid": "real-user",
      "x-user-email": "real@example.com",
    });
    const user = extractUser(req);
    expect(user!.oid).toBe("real-user");
  });
});

describe("authHook", () => {
  beforeEach(() => {
    mockConfig.DEV_BYPASS_AUTH = false;
  });

  test("skips auth for /health", () => {
    const req = makeReq({}, "/health");
    const { reply } = makeReply();
    const done = mock(() => {});
    authHook(req, reply, done as unknown as HookHandlerDoneFunction);
    expect(done).toHaveBeenCalled();
  });

  test("returns 401 when no auth and not bypassed", () => {
    const req = makeReq({}, "/api/test");
    const { code, send, reply } = makeReply();
    const done = mock(() => {});
    authHook(req, reply, done as unknown as HookHandlerDoneFunction);
    expect(code).toHaveBeenCalledWith(401);
    expect(send).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(done).not.toHaveBeenCalled();
  });

  test("attaches user when gateway headers present", () => {
    const req = makeReq(
      { "x-user-oid": "u1", "x-user-email": "u@e.com", "x-user-name": "U" },
      "/api/test",
    );
    const { reply } = makeReply();
    const done = mock(() => {});
    authHook(req, reply, done as unknown as HookHandlerDoneFunction);
    expect(done).toHaveBeenCalled();
    expect(req.user).toEqual({ oid: "u1", email: "u@e.com", name: "U" });
  });
});
