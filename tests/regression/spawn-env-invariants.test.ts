/**
 * Regression guard: deriveClaudeSpawnEnv invariants.
 *
 * Enforces the mutual-exclusivity contract from the llm-routing capability
 * spec (openspec/specs/llm-routing/spec.md) — at most one of
 * {CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN} may
 * appear in any derived spawn environment, and each ProviderMode kind
 * produces the expected key set.
 *
 * Part of the add-dual-mode-llm-routing OpenSpec change.
 */

import { describe, test, expect } from "bun:test";
import {
  deriveClaudeSpawnEnv,
  buildLiteLlmHeaders,
  type ProviderMode,
} from "../../src/main/lib/claude/spawn-env";

const LITELLM_URL = "https://llms.example.com";

const CREDENTIAL_VARS = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
] as const;

function credentialVarCount(env: Record<string, string>): number {
  return CREDENTIAL_VARS.filter((v) => v in env).length;
}

describe("deriveClaudeSpawnEnv — mutual exclusivity", () => {
  test("no ProviderMode kind ever sets more than one credential env var", () => {
    const modes: ProviderMode[] = [
      { kind: "subscription-direct", oauthToken: "sk-ant-oat01-abc" },
      {
        kind: "subscription-litellm",
        oauthToken: "sk-ant-oat01-abc",
        virtualKey: "sk-litellm-xyz",
        customerId: "oid-123",
      },
      { kind: "byok-direct", apiKey: "sk-ant-api03-def" },
      {
        kind: "byok-litellm",
        virtualKey: "sk-litellm-xyz",
        customerId: "oid-123",
        modelMap: {
          sonnet: "claude-sonnet-4",
          haiku: "claude-haiku-4",
          opus: "claude-opus-4",
        },
      },
    ];

    for (const mode of modes) {
      const env = deriveClaudeSpawnEnv(mode, LITELLM_URL);
      expect(credentialVarCount(env)).toBeLessThanOrEqual(1);
    }
  });
});

describe("deriveClaudeSpawnEnv — subscription-direct", () => {
  test("sets only CLAUDE_CODE_OAUTH_TOKEN", () => {
    const env = deriveClaudeSpawnEnv({
      kind: "subscription-direct",
      oauthToken: "sk-ant-oat01-abc",
    });
    expect(env).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-abc" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });
});

describe("deriveClaudeSpawnEnv — subscription-litellm", () => {
  test("sets OAuth token + LiteLLM routing headers", () => {
    const env = deriveClaudeSpawnEnv(
      {
        kind: "subscription-litellm",
        oauthToken: "sk-ant-oat01-abc",
        virtualKey: "sk-litellm-xyz",
        customerId: "oid-123",
      },
      LITELLM_URL,
    );
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-abc");
    expect(env.ANTHROPIC_BASE_URL).toBe(LITELLM_URL);
    expect(env.ENABLE_TOOL_SEARCH).toBe("true");
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toContain(
      "x-litellm-api-key: Bearer sk-litellm-xyz",
    );
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toContain(
      "x-litellm-customer-id: oid-123",
    );
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  test("headers joined by newline", () => {
    const env = deriveClaudeSpawnEnv(
      {
        kind: "subscription-litellm",
        oauthToken: "tok",
        virtualKey: "vkey",
        customerId: "oid",
      },
      LITELLM_URL,
    );
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBe(
      "x-litellm-api-key: Bearer vkey\nx-litellm-customer-id: oid",
    );
  });
});

describe("deriveClaudeSpawnEnv — byok-direct", () => {
  test("sets only ANTHROPIC_API_KEY", () => {
    const env = deriveClaudeSpawnEnv({
      kind: "byok-direct",
      apiKey: "sk-ant-api03-def",
    });
    expect(env).toEqual({ ANTHROPIC_API_KEY: "sk-ant-api03-def" });
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });
});

describe("deriveClaudeSpawnEnv — byok-litellm", () => {
  test("sets virtual key via ANTHROPIC_AUTH_TOKEN + model map", () => {
    const env = deriveClaudeSpawnEnv(
      {
        kind: "byok-litellm",
        virtualKey: "sk-litellm-xyz",
        customerId: "oid-123",
        modelMap: {
          sonnet: "claude-sonnet-4",
          haiku: "claude-haiku-4",
          opus: "claude-opus-4",
        },
      },
      LITELLM_URL,
    );
    expect(env.ANTHROPIC_BASE_URL).toBe(LITELLM_URL);
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-litellm-xyz");
    expect(env.ENABLE_TOOL_SEARCH).toBe("true");
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("claude-sonnet-4");
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-haiku-4");
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("claude-opus-4");
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toContain(
      "x-litellm-customer-id: oid-123",
    );
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  test("omits ANTHROPIC_CUSTOM_HEADERS when no customerId and no virtualKey headers", () => {
    const env = deriveClaudeSpawnEnv(
      {
        kind: "byok-litellm",
        virtualKey: "vkey",
        modelMap: { sonnet: "s", haiku: "h", opus: "o" },
      },
      LITELLM_URL,
    );
    // ANTHROPIC_AUTH_TOKEN is the bearer; no customerId means no custom-headers block
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("vkey");
  });
});

describe("deriveClaudeSpawnEnv — base URL required for LiteLLM branches", () => {
  test("subscription-litellm throws when baseUrl missing", () => {
    expect(() =>
      deriveClaudeSpawnEnv({
        kind: "subscription-litellm",
        oauthToken: "tok",
        virtualKey: "vkey",
      }),
    ).toThrow(/MAIN_VITE_LITELLM_BASE_URL/);
  });

  test("byok-litellm throws when baseUrl missing", () => {
    expect(() =>
      deriveClaudeSpawnEnv({
        kind: "byok-litellm",
        virtualKey: "vkey",
        modelMap: { sonnet: "s", haiku: "h", opus: "o" },
      }),
    ).toThrow(/MAIN_VITE_LITELLM_BASE_URL/);
  });

  test("subscription-litellm throws on empty string baseUrl", () => {
    expect(() =>
      deriveClaudeSpawnEnv(
        {
          kind: "subscription-litellm",
          oauthToken: "tok",
          virtualKey: "vkey",
        },
        "   ",
      ),
    ).toThrow(/MAIN_VITE_LITELLM_BASE_URL/);
  });

  test("direct branches succeed without baseUrl", () => {
    expect(() =>
      deriveClaudeSpawnEnv({
        kind: "subscription-direct",
        oauthToken: "tok",
      }),
    ).not.toThrow();
    expect(() =>
      deriveClaudeSpawnEnv({ kind: "byok-direct", apiKey: "sk-ant-api03-x" }),
    ).not.toThrow();
  });
});

describe("buildLiteLlmHeaders — helper", () => {
  test("returns empty string when both inputs undefined", () => {
    expect(buildLiteLlmHeaders(undefined, undefined)).toBe("");
  });

  test("includes Bearer prefix on x-litellm-api-key", () => {
    expect(buildLiteLlmHeaders("vkey", undefined)).toBe(
      "x-litellm-api-key: Bearer vkey",
    );
  });

  test("joins multiple headers with newline", () => {
    expect(buildLiteLlmHeaders("vkey", "oid")).toBe(
      "x-litellm-api-key: Bearer vkey\nx-litellm-customer-id: oid",
    );
  });
});
