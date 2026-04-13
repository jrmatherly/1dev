/**
 * Regression guard for the aux-AI provider dispatch matrix (Group 13 of
 * remediate-dev-server-findings).
 *
 * src/main/lib/aux-ai.ts is the provider-aware replacement for the
 * upstream apollosai.dev/api/agents/* fetches. This guard is a
 * SHAPE-BASED contract on the file's source — not a runtime test —
 * because aux-ai.ts imports feature-flags.ts which imports `electron`,
 * which cannot be loaded under bun:test (no Electron runtime). The
 * project's other regression guards follow the same shape-based
 * convention; runtime behavior is verified by the manual smoke (Group
 * 18) on a real Electron launch.
 *
 * What this guard catches:
 *   - DI factory pattern removed or renamed
 *   - A ProviderMode kind branch dropped during refactor
 *   - The customerId header dropped (silent attribution loss)
 *   - The auxAiEnabled kill-switch removed
 *   - Hardcoded model defaults silently changed
 *   - Truncated fallback contract dropped
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const AUX_AI_PATH = join(REPO_ROOT, "src/main/lib/aux-ai.ts");

function readAuxAi(): string {
  return readFileSync(AUX_AI_PATH, "utf8");
}

describe("aux-AI module shape", () => {
  test("file exists and is non-empty", () => {
    const source = readAuxAi();
    expect(source.length).toBeGreaterThan(1000);
  });

  test("observability breadcrumbs present — diagnoses silent fallbacks in dev smoke", () => {
    const source = readAuxAi();
    // Every factory must log the mode kind + SDK opts at entry so
    // operators can diagnose why a title fell back during Group 18 smoke.
    expect(source).toMatch(/\[aux-ai\] generateChatTitle:.+mode=/);
    expect(source).toMatch(/\[aux-ai\] generateCommitMessage:.+mode=/);
    expect(source).toMatch(/\[aux-ai\] SDK call:.+model=/);
    // SDK errors must surface the mode kind.
    expect(source).toMatch(/SDK call failed \(mode=/);
  });

  test("exports DI factories + bound versions + setOllamaNameGenerator", () => {
    const source = readAuxAi();
    expect(source).toContain("export function makeGenerateChatTitle");
    expect(source).toContain("export function makeGenerateCommitMessage");
    expect(source).toContain("export const generateChatTitle");
    expect(source).toContain("export const generateCommitMessage");
    expect(source).toContain("export interface AuxAiDeps");
    expect(source).toContain("export function setOllamaNameGenerator");
  });

  test("AuxAiDeps interface declares the four required dependencies", () => {
    const source = readAuxAi();
    expect(source).toMatch(/createAnthropic:\s*\(opts: CreateAnthropicOpts\)/);
    expect(source).toMatch(/generateOllamaName:/);
    expect(source).toMatch(/getProviderMode:\s*\(\)/);
    expect(source).toMatch(/getFlag:\s*</);
  });
});

describe("aux-AI dispatch matrix coverage", () => {
  test("dispatch covers all four ProviderMode kinds (or implicitly via fallback)", () => {
    const source = readAuxAi();
    expect(source).toContain('"byok-direct"');
    expect(source).toContain('"byok-litellm"');
    expect(source).toContain('"subscription-litellm"');
    // subscription-direct + null are intentionally implicit — they fall
    // through to Ollama. Verify the fallback path exists.
    expect(source).toMatch(/Ollama fallback/i);
    expect(source).toContain("generateOllamaName");
  });

  test("byok-direct branch passes apiKey, no baseURL/authToken", () => {
    const source = readAuxAi();
    expect(source).toMatch(
      /mode\?\.kind === "byok-direct"[\s\S]{0,200}apiKey:\s*mode\.apiKey/,
    );
  });

  test("LiteLLM branches construct opts via liteLlmSdkOpts (DRY)", () => {
    const source = readAuxAi();
    expect(source).toContain("liteLlmSdkOpts");
    // The helper must read the env var and reject when missing.
    expect(source).toContain("MAIN_VITE_LITELLM_BASE_URL");
    expect(source).toMatch(/throw new Error[\s\S]{0,200}MAIN_VITE_LITELLM_BASE_URL/);
  });

  test("LiteLLM helper attaches x-litellm-customer-id header when present", () => {
    const source = readAuxAi();
    expect(source).toContain('"x-litellm-customer-id"');
    expect(source).toMatch(/mode\.customerId/);
  });

  test("LiteLLM helper passes virtualKey via authToken (NOT apiKey)", () => {
    const source = readAuxAi();
    expect(source).toMatch(/authToken:\s*mode\.virtualKey/);
  });
});

describe("aux-AI feature-flag integration", () => {
  test("auxAiEnabled kill-switch is checked in BOTH factories", () => {
    const source = readAuxAi();
    const enabledChecks = source.match(/getFlag\("auxAiEnabled"\)/g) ?? [];
    expect(enabledChecks.length).toBeGreaterThanOrEqual(2);
  });

  test("auxAiModel + auxAiTimeoutMs are read from flags", () => {
    const source = readAuxAi();
    expect(source).toContain('getFlag("auxAiModel")');
    expect(source).toContain('getFlag("auxAiTimeoutMs")');
  });

  test("model resolution honors the precedence chain (flag → modelMap → per-route default)", () => {
    const source = readAuxAi();
    expect(source).toContain("resolveModel");
    // Per-route defaults: LiteLLM routes use gpt-5-nano (fast/cheap on our
    // Azure-backed proxy), byok-direct uses claude-haiku-4-5 (current
    // Anthropic haiku; the retired claude-3-5-haiku-latest alias must not
    // appear anywhere).
    expect(source).toContain("DEFAULT_LITELLM_AUX_MODEL");
    expect(source).toContain("DEFAULT_DIRECT_AUX_MODEL");
    expect(source).toContain('"gpt-5-nano"');
    expect(source).toContain('"claude-haiku-4-5"');
    expect(source).not.toContain("claude-3-5-haiku-latest");
    // modelMap precedence is byok-litellm-only.
    expect(source).toMatch(/mode\.modelMap\.haiku/);
  });

  test("resolveModel dispatches per ProviderMode kind", () => {
    const source = readAuxAi();
    // Switch statement has all 4 kinds explicitly.
    expect(source).toMatch(/case "byok-litellm":/);
    expect(source).toMatch(/case "subscription-litellm":/);
    expect(source).toMatch(/case "byok-direct":/);
    expect(source).toMatch(/case "subscription-direct":/);
  });
});

describe("aux-AI hardcoded behavior", () => {
  test("generateChatTitle uses max_tokens=50, temperature=0.3", () => {
    const source = readAuxAi();
    // Find the generateChatTitle factory body.
    const titleMatch = source.match(
      /makeGenerateChatTitle[\s\S]{0,3000}?max_tokens:\s*50[\s\S]{0,200}?temperature:\s*0\.3/,
    );
    expect(titleMatch).not.toBeNull();
  });

  test("generateCommitMessage uses max_tokens=200, temperature=0.5", () => {
    const source = readAuxAi();
    const commitMatch = source.match(
      /makeGenerateCommitMessage[\s\S]{0,3000}?max_tokens:\s*200[\s\S]{0,200}?temperature:\s*0\.5/,
    );
    expect(commitMatch).not.toBeNull();
  });

  test("withTimeout helper races SDK call against timeout", () => {
    const source = readAuxAi();
    expect(source).toContain("function withTimeout");
    expect(source).toContain("Promise.race");
    expect(source).toContain("setTimeout");
  });

  test("truncated fallback caps at 25 chars + ellipsis", () => {
    const source = readAuxAi();
    expect(source).toContain("function truncatedFallback");
    // The 25-char cap + ellipsis is contractual — chats.ts callers depend on it.
    expect(source).toMatch(/length\s*<=\s*25/);
    expect(source).toMatch(/substring\(0,\s*25\)\s*\+\s*"\.\.\."/);
  });
});
