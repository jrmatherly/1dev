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
import { readFileSync, readdirSync } from "fs";
import path from "path";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");
const ENV_TS = path.join(REPO_ROOT, "src/main/lib/claude/env.ts");
const MAIN_DIR = path.join(REPO_ROOT, "src", "main");

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walkTsFiles(full, out);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

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

  test("no src/main/*.ts file binds authManager.getValidToken/getToken into an ANTHROPIC_*_TOKEN slot", () => {
    // Broader safety net (spec delta: enterprise-auth, "Broader scan catches
    // Entra-to-ANTHROPIC_AUTH_TOKEN in any main-process file"). The primary
    // scan above is tight on the applyEnterpriseAuth body; this scan catches
    // the same bug class reintroduced anywhere else in the main-process tree
    // (e.g., a new auth helper, a feature-flag-gated path).
    const files = walkTsFiles(MAIN_DIR);
    expect(files.length).toBeGreaterThan(20); // positive-control: walk found real files

    const offenders: Array<{ file: string; snippet: string }> = [];

    // Match shapes like:
    //   const t = await authManager.getValidToken(...); env.ANTHROPIC_AUTH_TOKEN = t
    //   ANTHROPIC_AUTH_TOKEN: await authManager.getToken(...)
    //   env["ANTHROPIC_AUTH_TOKEN"] = await authManager.getValidToken(...)
    // The regex tolerates whitespace/newlines between the call and the
    // assignment — covers multi-line `.` access.
    const forbidden = [
      /authManager\.(?:getValidToken|getToken)[\s\S]{0,400}?ANTHROPIC_[A-Z_]*TOKEN\s*[:=]/,
      /ANTHROPIC_[A-Z_]*TOKEN\s*[:=][\s\S]{0,400}?authManager\.(?:getValidToken|getToken)/,
    ];

    for (const file of files) {
      // Skip this test file itself.
      if (file.endsWith("no-entra-in-anthropic-auth-token.test.ts")) continue;
      const source = readFileSync(file, "utf-8");
      for (const pattern of forbidden) {
        const m = source.match(pattern);
        if (m) {
          offenders.push({
            file: path.relative(REPO_ROOT, file),
            snippet: m[0].slice(0, 200),
          });
          break;
        }
      }
    }

    if (offenders.length > 0) {
      const msg = offenders
        .map((o) => `  - ${o.file}: ${o.snippet.replace(/\s+/g, " ")}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} main-process file(s) that bind authManager.get(Valid)Token into an ANTHROPIC_*_TOKEN env slot:\n${msg}\n\nSee .claude/rules/auth-env-vars.md — HARD RULE.`,
      );
    }
    expect(offenders.length).toBe(0);
  });
});
