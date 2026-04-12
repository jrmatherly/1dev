/**
 * Regression guard: Enterprise auth wiring invariants
 *
 * Verifies that the enterprise auth modules are correctly wired into the
 * app: auth-manager imports from enterprise-auth, applyEnterpriseAuth is
 * exported from env.ts, STRIPPED_ENV_KEYS includes ANTHROPIC_AUTH_TOKEN,
 * the enterprise-auth tRPC router is registered, and no ANTHROPIC_AUTH_TOKEN_FILE
 * injection code exists (CLI 2.1.96 does not support it).
 *
 * Part of the wire-enterprise-auth OpenSpec change.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import path from "path";

const SRC_MAIN = path.join(import.meta.dir, "../../src/main");
const AUTH_MANAGER = path.join(SRC_MAIN, "auth-manager.ts");
const CLAUDE_ENV = path.join(SRC_MAIN, "lib/claude/env.ts");
const ROUTER_INDEX = path.join(SRC_MAIN, "lib/trpc/routers/index.ts");
const ENTERPRISE_AUTH_ROUTER = path.join(
  SRC_MAIN,
  "lib/trpc/routers/enterprise-auth.ts",
);

describe("enterprise-auth-wiring", () => {
  test("applyEnterpriseAuth is exported from claude/env.ts", () => {
    const content = readFileSync(CLAUDE_ENV, "utf-8");
    expect(content).toContain("export async function applyEnterpriseAuth");
  });

  test("STRIPPED_ENV_KEYS_BASE includes ANTHROPIC_AUTH_TOKEN", () => {
    const content = readFileSync(CLAUDE_ENV, "utf-8");
    // Extract the STRIPPED_ENV_KEYS_BASE array content
    const match = content.match(/STRIPPED_ENV_KEYS_BASE\s*=\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    expect(match![1]).toContain('"ANTHROPIC_AUTH_TOKEN"');
  });

  test("auth-manager.ts imports from enterprise-auth", () => {
    const content = readFileSync(AUTH_MANAGER, "utf-8");
    expect(content).toContain("enterprise-auth");
    expect(content).toContain("EnterpriseAuth");
  });

  test("enterprise-auth router is registered in createAppRouter", () => {
    const content = readFileSync(ROUTER_INDEX, "utf-8");
    expect(content).toContain("enterpriseAuth");
    expect(content).toContain("enterpriseAuthRouter");
  });

  test("no ANTHROPIC_AUTH_TOKEN_FILE injection code (CLI does not support it)", () => {
    // The env var is stripped defensively, but we must never SET it as an
    // injection mechanism — Claude CLI 2.1.96 doesn't read it.
    const envContent = readFileSync(CLAUDE_ENV, "utf-8");
    const authManagerContent = readFileSync(AUTH_MANAGER, "utf-8");
    const routerContent = readFileSync(ENTERPRISE_AUTH_ROUTER, "utf-8");

    // Check that no code assigns env.ANTHROPIC_AUTH_TOKEN_FILE = ...
    const assignmentPattern =
      /env\s*\.\s*ANTHROPIC_AUTH_TOKEN_FILE\s*=|ANTHROPIC_AUTH_TOKEN_FILE["']\s*\]/;
    expect(envContent).not.toMatch(assignmentPattern);
    expect(authManagerContent).not.toMatch(assignmentPattern);
    expect(routerContent).not.toMatch(assignmentPattern);
  });
});
