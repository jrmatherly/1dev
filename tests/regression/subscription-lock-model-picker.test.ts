/**
 * Regression guard: the agent model-picker "Add Models" footer is gated
 * for enterprise-auth sessions on a managed Claude subscription.
 *
 * End users on a managed subscription have no need to add their own
 * provider credentials; exposing the Add Models affordance would let
 * them bypass LiteLLM's centralized audit, rate-limiting, and team
 * allowlist. This guard scans new-chat-form.tsx for the `canAddModels`
 * boolean gate and asserts it references both `accountType ===
 * "claude-subscription"` and `enterpriseAuthEnabled`, plus that the
 * `onOpenModelsSettings` prop passed to `<AgentModelSelector>` is
 * conditionally withheld when the gate evaluates false.
 *
 * Part of the add-dual-mode-llm-routing OpenSpec change (§9.10). See
 * openspec/changes/add-dual-mode-llm-routing/specs/llm-routing/spec.md
 * → "Subscription-aware model picker access control".
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import path from "path";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");
const NEW_CHAT_FORM = path.join(
  REPO_ROOT,
  "src/renderer/features/agents/main/new-chat-form.tsx",
);

describe("subscription-lock-model-picker regression guard", () => {
  test("new-chat-form.tsx declares the canAddModels gate", () => {
    const source = readFileSync(NEW_CHAT_FORM, "utf8");
    expect(source).toMatch(/const\s+canAddModels\s*=/);
  });

  test("canAddModels references accountType === 'claude-subscription'", () => {
    const source = readFileSync(NEW_CHAT_FORM, "utf8");
    // Tolerate both single- and double-quoted string literals.
    const accountTypeCheck = /accountType\s*===\s*["']claude-subscription["']/;
    expect(source).toMatch(accountTypeCheck);
  });

  test("canAddModels references enterpriseAuthEnabled", () => {
    const source = readFileSync(NEW_CHAT_FORM, "utf8");
    expect(source).toMatch(/enterpriseAuthEnabled/);
  });

  test("onOpenModelsSettings is conditionally withheld on <AgentModelSelector>", () => {
    const source = readFileSync(NEW_CHAT_FORM, "utf8");
    // The AgentModelSelector picker hides the "Add Models" footer when
    // `onOpenModelsSettings` is falsy. To enforce the gate at the call
    // site, new-chat-form must pass it conditionally (ternary with
    // `canAddModels`) — never as an unconditional function reference.
    const callSiteMatch = source.match(
      /onOpenModelsSettings\s*=\s*\{[\s\S]*?\}/,
    );
    expect(callSiteMatch).not.toBeNull();
    const callSite = callSiteMatch?.[0] ?? "";
    expect(callSite).toMatch(/canAddModels/);
  });

  test("activeAccount query is used to feed the gate", () => {
    const source = readFileSync(NEW_CHAT_FORM, "utf8");
    expect(source).toMatch(/trpc\.anthropicAccounts\.getActive\.useQuery/);
  });
});
