/**
 * Startup preflight — runs after initDatabase() to surface account
 * configuration problems at app start instead of at chat-send time.
 *
 * Current check: for every active `anthropic_accounts` row with
 * `routing_mode='litellm'`, verify that `MAIN_VITE_LITELLM_BASE_URL` is
 * set. If unset, log a loud multi-line warning naming the account and
 * suggesting remediation paths.
 *
 * The preflight is **advisory only** — it must NOT block app startup.
 * Users can still launch the app, interact with non-LiteLLM accounts,
 * or fix the configuration via Settings → Models.
 *
 * Part of the remediate-dev-server-findings OpenSpec change (Decision 10).
 */

import { eq } from "drizzle-orm";
import { getDatabase, anthropicAccounts } from "./db";

export function runStartupPreflight(): void {
  try {
    const baseUrl = process.env.MAIN_VITE_LITELLM_BASE_URL;
    if (baseUrl && baseUrl.trim().length > 0) {
      // MAIN_VITE_LITELLM_BASE_URL is set — any litellm-routed accounts
      // will resolve correctly. Nothing to warn about.
      return;
    }

    const db = getDatabase();
    const litellmAccounts = db
      .select({
        id: anthropicAccounts.id,
        displayName: anthropicAccounts.displayName,
        accountType: anthropicAccounts.accountType,
      })
      .from(anthropicAccounts)
      .where(eq(anthropicAccounts.routingMode, "litellm"))
      .all();

    if (litellmAccounts.length === 0) return;

    for (const account of litellmAccounts) {
      const label = account.displayName ?? account.id;
      console.warn(
        [
          "",
          "[startup-preflight] ==========================================",
          `[startup-preflight] ACCOUNT MISCONFIGURED: ${label}`,
          `[startup-preflight]   id=${account.id} type=${account.accountType}`,
          `[startup-preflight]   routing_mode='litellm' but MAIN_VITE_LITELLM_BASE_URL is unset.`,
          "[startup-preflight]   Chat send will fail when this account is active.",
          "",
          "[startup-preflight] Remediation — pick ONE:",
          "[startup-preflight]   (a) Set MAIN_VITE_LITELLM_BASE_URL in .env and restart,",
          "[startup-preflight]       e.g. MAIN_VITE_LITELLM_BASE_URL=https://llms.example.com",
          "[startup-preflight]   (b) Switch this account to direct mode via",
          "[startup-preflight]       Settings → Models → Edit Account → Routing Mode",
          "[startup-preflight]   (c) Delete and re-add the account if it was misconfigured.",
          "[startup-preflight] ==========================================",
          "",
        ].join("\n"),
      );
    }
  } catch (err) {
    // Preflight must not block startup; catch and log.
    console.error("[startup-preflight] Failed to run:", err);
  }
}
