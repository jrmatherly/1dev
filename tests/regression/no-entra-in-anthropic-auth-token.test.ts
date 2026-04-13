/**
 * Regression guard: applyEnterpriseAuth() must never write ANTHROPIC_AUTH_TOKEN.
 *
 * The Entra access token acquired by MSAL Node is NOT an Anthropic-recognized
 * bearer token. Writing it to ANTHROPIC_AUTH_TOKEN causes the Claude CLI to
 * send "Authorization: Bearer <entra_jwt>" to api.anthropic.com, which returns
 * a 401 referencing a required x-azure-signature header. Entra identity for
 * LiteLLM audit flows through the x-litellm-customer-id header assembled by
 * deriveClaudeSpawnEnv, not via ANTHROPIC_AUTH_TOKEN.
 *
 * Part of the add-dual-mode-llm-routing OpenSpec change.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import path from "path";

const ENV_TS = path.join(
  import.meta.dir,
  "../../src/main/lib/claude/env.ts",
);

function extractFunctionBody(source: string, fnName: string): string {
  // Find `export async function <fnName>(` or `export function <fnName>(`
  const startRe = new RegExp(
    `export\\s+(?:async\\s+)?function\\s+${fnName}\\s*\\(`,
  );
  const startMatch = source.match(startRe);
  if (!startMatch) return "";
  const start = startMatch.index ?? 0;

  // Walk braces from the first `{` after the signature
  let i = source.indexOf("{", start);
  if (i < 0) return "";
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

describe("no Entra JWT in ANTHROPIC_AUTH_TOKEN", () => {
  test("applyEnterpriseAuth body contains no assignment to env.ANTHROPIC_AUTH_TOKEN", () => {
    const source = readFileSync(ENV_TS, "utf-8");
    const body = extractFunctionBody(source, "applyEnterpriseAuth");
    expect(body.length).toBeGreaterThan(0); // positive control: function exists

    // Forbid any shape of writing to env.ANTHROPIC_AUTH_TOKEN
    // covers: env.ANTHROPIC_AUTH_TOKEN = ...  |  env["ANTHROPIC_AUTH_TOKEN"] = ...
    expect(body).not.toMatch(/env\.ANTHROPIC_AUTH_TOKEN\s*=/);
    expect(body).not.toMatch(/env\[["']ANTHROPIC_AUTH_TOKEN["']\]\s*=/);
    // Also forbid Object.assign shapes that would add it
    expect(body).not.toMatch(/ANTHROPIC_AUTH_TOKEN:\s*token/);
  });

  test("applyEnterpriseAuth still acquires the Entra token (identity side-effect)", () => {
    const source = readFileSync(ENV_TS, "utf-8");
    const body = extractFunctionBody(source, "applyEnterpriseAuth");
    // The side-effect call must remain so MSAL cache stays warm and
    // failures surface during buildClaudeEnv().
    expect(body).toContain("getValidToken");
  });
});
