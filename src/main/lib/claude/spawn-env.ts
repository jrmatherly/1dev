/**
 * Deterministic derivation of Claude CLI spawn-environment auth vars.
 *
 * Contract: this is the ONLY place in the codebase that assembles the
 * credential-bearing env vars the Claude CLI subprocess needs. All call
 * sites in src/main/lib/trpc/routers/claude.ts dispatch through here.
 *
 * See openspec/changes/add-dual-mode-llm-routing/ for the full design.
 * The llm-routing capability spec enumerates the scenarios this function
 * is expected to satisfy, and tests/regression/spawn-env-invariants.test.ts
 * enforces the mutual-exclusivity invariants.
 */

export type ProviderMode =
  | { kind: "subscription-direct"; oauthToken: string }
  | {
      kind: "subscription-litellm";
      oauthToken: string;
      virtualKey: string;
      customerId?: string;
    }
  | { kind: "byok-direct"; apiKey: string }
  | {
      kind: "byok-litellm";
      virtualKey: string;
      customerId?: string;
      modelMap: { sonnet: string; haiku: string; opus: string };
    };

/**
 * Build the ANTHROPIC_CUSTOM_HEADERS value for LiteLLM routing.
 * Claude CLI parses this via /\n|\r\n/.split → trim → first ":" as delimiter.
 */
export function buildLiteLlmHeaders(
  virtualKey: string | undefined,
  customerId: string | undefined,
): string {
  const lines: string[] = [];
  if (virtualKey) lines.push(`x-litellm-api-key: Bearer ${virtualKey}`);
  if (customerId) lines.push(`x-litellm-customer-id: ${customerId}`);
  return lines.join("\n");
}

/**
 * Derive the Claude CLI spawn environment for the given provider mode.
 *
 * Pure, synchronous, deterministic: same input always produces identical output.
 * Throws when a LiteLLM branch is selected but liteLlmBaseUrl is missing.
 */
export function deriveClaudeSpawnEnv(
  mode: ProviderMode,
  liteLlmBaseUrl?: string,
): Record<string, string> {
  switch (mode.kind) {
    case "subscription-direct":
      return { CLAUDE_CODE_OAUTH_TOKEN: mode.oauthToken };

    case "subscription-litellm": {
      assertBaseUrl(liteLlmBaseUrl);
      const headers = buildLiteLlmHeaders(mode.virtualKey, mode.customerId);
      const env: Record<string, string> = {
        CLAUDE_CODE_OAUTH_TOKEN: mode.oauthToken,
        ANTHROPIC_BASE_URL: liteLlmBaseUrl,
        ENABLE_TOOL_SEARCH: "true",
      };
      if (headers) env.ANTHROPIC_CUSTOM_HEADERS = headers;
      return env;
    }

    case "byok-direct":
      return { ANTHROPIC_API_KEY: mode.apiKey };

    case "byok-litellm": {
      assertBaseUrl(liteLlmBaseUrl);
      const headers = buildLiteLlmHeaders(undefined, mode.customerId);
      const env: Record<string, string> = {
        ANTHROPIC_BASE_URL: liteLlmBaseUrl,
        ANTHROPIC_AUTH_TOKEN: mode.virtualKey,
        ANTHROPIC_DEFAULT_SONNET_MODEL: mode.modelMap.sonnet,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: mode.modelMap.haiku,
        ANTHROPIC_DEFAULT_OPUS_MODEL: mode.modelMap.opus,
        ENABLE_TOOL_SEARCH: "true",
      };
      if (headers) env.ANTHROPIC_CUSTOM_HEADERS = headers;
      return env;
    }
  }
}

function assertBaseUrl(
  value: string | undefined,
): asserts value is string {
  if (!value || value.trim() === "") {
    throw new Error(
      "[spawn-env] missing MAIN_VITE_LITELLM_BASE_URL — cannot route through LiteLLM without a proxy URL",
    );
  }
}
