/**
 * Auxiliary-AI dispatch module — provider-aware sub-chat name + commit
 * message generation.
 *
 * Replaces the upstream apollosai.dev/api/agents/* call sites in
 * src/main/lib/trpc/routers/chats.ts (Groups 10-11 of the
 * remediate-dev-server-findings change). The dispatch matrix mirrors
 * the four ProviderMode kinds enumerated by spawn-env.ts and adds a
 * graceful Ollama-or-truncated fallback for the subscription-direct
 * case (no API key / virtual key available).
 *
 * Design (see openspec/changes/remediate-dev-server-findings/design.md
 * Decision 1):
 *   - byok-direct          → Anthropic SDK with apiKey
 *   - byok-litellm         → Anthropic SDK pointed at LiteLLM, virtualKey + customerId header
 *   - subscription-litellm → Anthropic SDK pointed at LiteLLM, virtualKey + customerId header
 *   - subscription-direct  → Ollama (if running) → truncated fallback
 *   - null mode            → Ollama (if running) → truncated fallback
 *
 * The deps-factory pattern (`makeGenerateChatTitle(deps)` →
 * `generateChatTitle`) exists specifically so the regression guard in
 * tests/regression/aux-ai-provider-dispatch.test.ts can construct
 * synthetic AuxAiDeps for each ProviderMode kind without mocking the
 * real SDK.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ProviderMode } from "./claude/spawn-env";
import { getFlag, type FeatureFlagKey, type FeatureFlagValue } from "./feature-flags";
import { getActiveProviderMode } from "./trpc/routers/claude";

/**
 * Minimal SDK-shape interface — what aux-ai.ts actually exercises.
 * Production wires this to `new Anthropic(opts)`; tests provide a fake
 * that records the constructor args + returns a canned response.
 */
export interface AnthropicLike {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      temperature: number;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

export interface CreateAnthropicOpts {
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
}

export interface AuxAiDeps {
  /** SDK constructor — production: `(opts) => new Anthropic(opts)`. */
  createAnthropic: (opts: CreateAnthropicOpts) => AnthropicLike;
  /** Ollama fallback for chat titles (returns null if Ollama not available). */
  generateOllamaName: (
    userMessage: string,
    model?: string | null,
  ) => Promise<string | null>;
  /** Resolves the current ProviderMode (or null when no account is active). */
  getProviderMode: () => ProviderMode | null;
  /** Type-safe feature-flag accessor — production: `getFlag` from feature-flags.ts. */
  getFlag: <K extends FeatureFlagKey>(key: K) => FeatureFlagValue<K>;
}

/**
 * Renderer-supplied legacy customConfig — the Jotai-atom BYOK path from
 * the "Custom Model" onboarding form (src/renderer/lib/atoms/index.ts
 * `customClaudeConfigAtom`). Populated by users on the LiteLLM / BYOK
 * onboarding screen; stored in localStorage, not in anthropicAccounts.
 *
 * When `getProviderMode()` returns null but a valid customConfig is
 * supplied by the caller, aux-ai synthesizes a LiteLLM-style SDK call
 * (baseURL + authToken + model override). This is the bridge between
 * the legacy onboarding flow and the provider-aware aux-AI dispatch.
 */
export interface LegacyCustomConfig {
  model: string;
  token: string;
  baseUrl: string;
}

export interface GenerateChatTitleOpts {
  ollamaModel?: string | null;
  /** Legacy custom-provider config from the renderer's Jotai atom. */
  customConfig?: LegacyCustomConfig | null;
}

export interface GenerateCommitMessageOpts {
  /** Legacy custom-provider config from the renderer's Jotai atom. */
  customConfig?: LegacyCustomConfig | null;
}

/**
 * Default aux-AI model per route.
 *
 * - **LiteLLM routes** (byok-litellm, subscription-litellm) → `gpt-5-nano`.
 *   Fast + cheap, universally provisioned on our LiteLLM deployment
 *   (see cluster repo configmap.yaml.j2 — `gpt-5-nano` falls back to
 *   `claude-haiku-4-5` via the proxy's fallback chain, so every user
 *   gets coverage regardless of team-level model allowlists).
 *
 * - **byok-direct** (raw Anthropic API) → `claude-haiku-4-5`. The user
 *   brings their own Anthropic key; the cheapest/fastest SDK-routable
 *   model from Anthropic is haiku-4-5 (`claude-haiku-4-5-20251001`
 *   snapshot). Older 3.x haiku aliases were retired by Anthropic and
 *   must not be used as defaults.
 *
 * The operator override (`auxAiModel` feature flag) still wins across
 * all routes when set.
 */
const DEFAULT_LITELLM_AUX_MODEL = "gpt-5-nano";
const DEFAULT_DIRECT_AUX_MODEL = "claude-haiku-4-5";

/**
 * Truncate a user message to a chat-friendly title (≤25 chars + ellipsis).
 * Mirrors getFallbackName in chats.ts.
 */
function truncatedFallback(userMessage: string): string {
  const trimmed = userMessage.trim();
  if (trimmed.length === 0) return "New Chat";
  if (trimmed.length <= 25) return trimmed;
  return trimmed.substring(0, 25) + "...";
}

/**
 * Resolve the model identifier for a given ProviderMode using the
 * documented precedence chain:
 *   flag override → mode.modelMap.haiku (byok-litellm only) → per-route default
 *
 * The per-route default splits on whether the SDK is talking to LiteLLM
 * (our Azure-backed proxy with gpt-5-nano as the cheap anchor) or to
 * Anthropic directly (byok-direct, where we use the current haiku).
 */
function resolveModel(mode: ProviderMode | null, flagOverride: string): string {
  if (flagOverride.length > 0) return flagOverride;
  if (!mode) return DEFAULT_LITELLM_AUX_MODEL; // default path is LiteLLM-aware
  switch (mode.kind) {
    case "byok-litellm":
      // byok-litellm users explicitly chose per-model overrides; honor modelMap
      // if populated, else fall through to the LiteLLM default.
      return mode.modelMap.haiku || DEFAULT_LITELLM_AUX_MODEL;
    case "subscription-litellm":
      return DEFAULT_LITELLM_AUX_MODEL;
    case "byok-direct":
      return DEFAULT_DIRECT_AUX_MODEL;
    case "subscription-direct":
      // Never reaches the SDK — subscription-direct falls through to Ollama.
      // The default here is only used if someone routes through this helper
      // from an unexpected branch; stay on the Anthropic-compatible default.
      return DEFAULT_DIRECT_AUX_MODEL;
  }
}

/**
 * Build a constructor-args record for the SDK from a LiteLLM-routing mode.
 * Throws if MAIN_VITE_LITELLM_BASE_URL is unset — caller catches and
 * falls back to Ollama/truncated.
 */
function liteLlmSdkOpts(
  mode: Extract<ProviderMode, { kind: "subscription-litellm" | "byok-litellm" }>,
): CreateAnthropicOpts {
  const baseURL = process.env.MAIN_VITE_LITELLM_BASE_URL;
  if (!baseURL || baseURL.length === 0) {
    throw new Error(
      "[aux-ai] MAIN_VITE_LITELLM_BASE_URL is not set — cannot route through LiteLLM",
    );
  }
  const opts: CreateAnthropicOpts = {
    baseURL,
    authToken: mode.virtualKey,
  };
  if (mode.customerId) {
    opts.defaultHeaders = { "x-litellm-customer-id": mode.customerId };
  }
  return opts;
}

/**
 * Build SDK opts from the renderer-side legacy customConfig. Auto-detects
 * whether the baseUrl points at LiteLLM (→ authToken) or Anthropic
 * direct (→ apiKey). Returns null if the config is incomplete.
 *
 * This is the bridge for users who onboarded via "Custom Model" rather
 * than "Claude Pro/Max" — their creds live in localStorage, not
 * anthropicAccounts, so getActiveProviderMode() returns null and aux-ai
 * would otherwise fall through to Ollama-or-truncated.
 */
function legacyCustomConfigSdkOpts(
  config: LegacyCustomConfig | null | undefined,
): { opts: CreateAnthropicOpts; model: string } | null {
  if (!config) return null;
  const model = config.model.trim();
  const token = config.token.trim();
  const baseUrl = config.baseUrl.trim();
  if (!model || !token || !baseUrl) return null;

  // Heuristic: sk-ant-* tokens → Anthropic apiKey header. Anything else
  // → LiteLLM-compatible authToken (Bearer). The user's custom base URL
  // is passed through either way.
  const isAnthropicKey = token.startsWith("sk-ant-");
  const opts: CreateAnthropicOpts = isAnthropicKey
    ? { apiKey: token, baseURL: baseUrl }
    : { authToken: token, baseURL: baseUrl };
  return { opts, model };
}

/**
 * Run an SDK call against an AbortController-backed timeout. The SDK
 * ignores the signal natively in some versions, so we race the promise
 * with a setTimeout that rejects.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`[aux-ai] timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/**
 * Extract the first text chunk from an SDK response. Returns trimmed
 * string or null if no text content.
 */
function extractText(resp: { content: Array<{ type: string; text?: string }> }): string | null {
  for (const block of resp.content) {
    if (block.type === "text" && block.text) {
      const trimmed = block.text.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

/**
 * Clean an AI-generated title — strip wrapping quotes, leading "Title:",
 * cap to 50 chars. Mirrors the cleaning in generateChatNameWithOllama.
 */
function cleanTitle(raw: string): string {
  return raw
    .replace(/^["']|["']$/g, "")
    .replace(/^title:\s*/i, "")
    .trim()
    .slice(0, 50);
}

/**
 * Factory — build a chat-title generator bound to the supplied deps.
 * Returns a function that generates a title for a user message.
 */
export function makeGenerateChatTitle(deps: AuxAiDeps) {
  return async function generateChatTitle(
    userMessage: string,
    opts: GenerateChatTitleOpts = {},
  ): Promise<string> {
    if (!deps.getFlag("auxAiEnabled")) {
      console.log("[aux-ai] generateChatTitle: auxAiEnabled=false, returning truncated");
      return truncatedFallback(userMessage);
    }

    const mode = deps.getProviderMode();
    const flagModel = deps.getFlag("auxAiModel");
    const timeoutMs = deps.getFlag("auxAiTimeoutMs");
    const modeKind = mode?.kind ?? "null";
    const legacy = legacyCustomConfigSdkOpts(opts.customConfig);
    console.log(
      `[aux-ai] generateChatTitle: mode=${modeKind} flagModel=${flagModel || "(unset)"} timeout=${timeoutMs}ms hasLegacyConfig=${!!legacy}`,
    );

    const tryViaSdk = async (
      sdkOpts: CreateAnthropicOpts,
      modelOverride?: string,
    ): Promise<string | null> => {
      const client = deps.createAnthropic(sdkOpts);
      // Precedence: explicit caller override (legacy customConfig.model)
      // → flag override → per-route default.
      const model =
        modelOverride && modelOverride.length > 0
          ? modelOverride
          : resolveModel(mode, flagModel);
      console.log(
        `[aux-ai] SDK call: model=${model} baseURL=${sdkOpts.baseURL ?? "(Anthropic default)"} hasAuthToken=${!!sdkOpts.authToken} hasApiKey=${!!sdkOpts.apiKey} customerId=${sdkOpts.defaultHeaders?.["x-litellm-customer-id"] ?? "(none)"}`,
      );
      const resp = await withTimeout(
        client.messages.create({
          model,
          max_tokens: 50,
          temperature: 0.3,
          messages: [
            {
              role: "user",
              content: `Generate a very short (2-5 words) title for a coding chat that starts with this message. The title MUST be in the same language as the user's message. Only output the title, nothing else. No quotes, no explanations.\n\nUser message: "${userMessage.slice(0, 500)}"\n\nTitle:`,
            },
          ],
        }),
        timeoutMs,
      );
      const text = extractText(resp);
      return text ? cleanTitle(text) : null;
    };

    try {
      if (mode?.kind === "byok-direct") {
        const result = await tryViaSdk({ apiKey: mode.apiKey });
        if (result) {
          console.log(`[aux-ai] generateChatTitle: SDK success (byok-direct) → "${result}"`);
          return result;
        }
        console.warn("[aux-ai] generateChatTitle: SDK returned empty text; falling back");
      } else if (mode?.kind === "byok-litellm" || mode?.kind === "subscription-litellm") {
        const result = await tryViaSdk(liteLlmSdkOpts(mode));
        if (result) {
          console.log(`[aux-ai] generateChatTitle: SDK success (${mode.kind}) → "${result}"`);
          return result;
        }
        console.warn("[aux-ai] generateChatTitle: SDK returned empty text; falling back");
      } else if (legacy) {
        // Null ProviderMode but the renderer supplied a legacy customConfig
        // (Custom Model onboarding path — localStorage-backed Jotai atom).
        // Use it directly; the user's chosen model is the authoritative default.
        // The flag override still wins if set.
        const modelOverride = flagModel.length > 0 ? flagModel : legacy.model;
        const result = await tryViaSdk(legacy.opts, modelOverride);
        if (result) {
          console.log(`[aux-ai] generateChatTitle: SDK success (legacy customConfig) → "${result}"`);
          return result;
        }
        console.warn("[aux-ai] generateChatTitle: legacy customConfig SDK returned empty text; falling back");
      } else {
        console.log(`[aux-ai] generateChatTitle: no SDK route for mode=${modeKind}, trying Ollama`);
      }
    } catch (err) {
      console.error(
        `[aux-ai] generateChatTitle SDK call failed (mode=${modeKind}, legacy=${!!legacy}):`,
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
    }

    // subscription-direct, null mode, or SDK failure → Ollama fallback.
    try {
      const ollamaResult = await deps.generateOllamaName(userMessage, opts.ollamaModel);
      if (ollamaResult) {
        console.log(`[aux-ai] generateChatTitle: Ollama success → "${ollamaResult}"`);
        return ollamaResult;
      }
      console.log("[aux-ai] generateChatTitle: Ollama unavailable, using truncated fallback");
    } catch (err) {
      console.error("[aux-ai] Ollama fallback failed:", err);
    }
    return truncatedFallback(userMessage);
  };
}

/**
 * Factory — build a commit-message generator bound to the supplied deps.
 * Accepts the diff context as a string (caller stitches diff + stats).
 * Returns the generated commit message or a deterministic fallback.
 */
export function makeGenerateCommitMessage(deps: AuxAiDeps) {
  return async function generateCommitMessage(
    context: string,
    fallback: string,
    opts: GenerateCommitMessageOpts = {},
  ): Promise<string> {
    if (!deps.getFlag("auxAiEnabled")) {
      console.log("[aux-ai] generateCommitMessage: auxAiEnabled=false, returning fallback");
      return fallback;
    }

    const mode = deps.getProviderMode();
    const flagModel = deps.getFlag("auxAiModel");
    const timeoutMs = deps.getFlag("auxAiTimeoutMs");
    const modeKind = mode?.kind ?? "null";
    const legacy = legacyCustomConfigSdkOpts(opts.customConfig);
    console.log(
      `[aux-ai] generateCommitMessage: mode=${modeKind} flagModel=${flagModel || "(unset)"} timeout=${timeoutMs}ms hasLegacyConfig=${!!legacy}`,
    );

    const tryViaSdk = async (
      sdkOpts: CreateAnthropicOpts,
      modelOverride?: string,
    ): Promise<string | null> => {
      const client = deps.createAnthropic(sdkOpts);
      const model =
        modelOverride && modelOverride.length > 0
          ? modelOverride
          : resolveModel(mode, flagModel);
      console.log(
        `[aux-ai] SDK call: model=${model} baseURL=${sdkOpts.baseURL ?? "(Anthropic default)"} hasAuthToken=${!!sdkOpts.authToken} hasApiKey=${!!sdkOpts.apiKey}`,
      );
      const resp = await withTimeout(
        client.messages.create({
          model,
          max_tokens: 200,
          temperature: 0.5,
          messages: [
            {
              role: "user",
              content: `Generate a concise conventional-commit message (under 72 chars on the first line) for the following changes. Only output the message, no explanation.\n\n${context.slice(0, 10000)}`,
            },
          ],
        }),
        timeoutMs,
      );
      const text = extractText(resp);
      return text ? text.split("\n")[0].slice(0, 200) : null;
    };

    try {
      if (mode?.kind === "byok-direct") {
        const result = await tryViaSdk({ apiKey: mode.apiKey });
        if (result) {
          console.log(`[aux-ai] generateCommitMessage: SDK success (byok-direct)`);
          return result;
        }
      } else if (mode?.kind === "byok-litellm" || mode?.kind === "subscription-litellm") {
        const result = await tryViaSdk(liteLlmSdkOpts(mode));
        if (result) {
          console.log(`[aux-ai] generateCommitMessage: SDK success (${mode.kind})`);
          return result;
        }
      } else if (legacy) {
        const modelOverride = flagModel.length > 0 ? flagModel : legacy.model;
        const result = await tryViaSdk(legacy.opts, modelOverride);
        if (result) {
          console.log(`[aux-ai] generateCommitMessage: SDK success (legacy customConfig)`);
          return result;
        }
      } else {
        console.log(`[aux-ai] generateCommitMessage: no SDK route for mode=${modeKind}, returning heuristic fallback`);
      }
    } catch (err) {
      console.error(
        `[aux-ai] generateCommitMessage SDK call failed (mode=${modeKind}, legacy=${!!legacy}):`,
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
    }
    return fallback;
  };
}

/**
 * Production-bound deps wiring. Uses the real Anthropic SDK,
 * getActiveProviderMode from claude.ts, and getFlag from feature-flags.
 *
 * The Ollama generator is supplied at module-init time by chats.ts via
 * `setOllamaNameGenerator()` to avoid a circular import. Until set,
 * Ollama fallback is a no-op (returns null). chats.ts MUST call
 * setOllamaNameGenerator() at module load.
 */
let ollamaNameGenerator: AuxAiDeps["generateOllamaName"] = async (
  _userMessage,
  _model,
) => null;

export function setOllamaNameGenerator(
  fn: AuxAiDeps["generateOllamaName"],
): void {
  ollamaNameGenerator = fn;
}

const productionDeps: AuxAiDeps = {
  createAnthropic: (opts) => new Anthropic(opts) as unknown as AnthropicLike,
  generateOllamaName: (userMessage, model) =>
    ollamaNameGenerator(userMessage, model),
  getProviderMode: getActiveProviderMode,
  getFlag,
};

export const generateChatTitle = makeGenerateChatTitle(productionDeps);
export const generateCommitMessage = makeGenerateCommitMessage(productionDeps);
