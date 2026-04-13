import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthManager } from "../../../index";
import { getClaudeShellEnvironment } from "../../claude";
import { getExistingClaudeToken } from "../../claude-token";
import {
  anthropicAccounts,
  anthropicSettings,
  claudeCodeCredentials,
  getDatabase,
} from "../../db";
import { encryptCredential, decryptCredential } from "../../credential-store";
import { createId } from "../../db/utils";
import { publicProcedure, router } from "../index";

/**
 * Store OAuth token - now uses multi-account system
 * If setAsActive is true, also sets this account as active
 */
function storeOAuthToken(oauthToken: string, setAsActive = true): string {
  const authManager = getAuthManager();
  const user = authManager.getUser();

  const encryptedToken = encryptCredential(oauthToken);
  const db = getDatabase();
  const newId = createId();

  // Route mode defaults to "litellm" unless the deployment explicitly opted
  // into direct-to-Anthropic via MAIN_VITE_ALLOW_DIRECT_ANTHROPIC=true.
  // add-dual-mode-llm-routing: routingMode is the source of truth for
  // spawn-env derivation.
  const allowDirect =
    process.env.MAIN_VITE_ALLOW_DIRECT_ANTHROPIC === "true";
  const routingMode: "direct" | "litellm" = allowDirect
    ? "direct"
    : "litellm";

  // Store in the multi-account table as a Claude Code Subscription account.
  db.insert(anthropicAccounts)
    .values({
      id: newId,
      accountType: "claude-subscription",
      routingMode,
      oauthToken: encryptedToken,
      displayName: "Anthropic Account",
      connectedAt: new Date(),
      desktopUserId: user?.id ?? null,
    })
    .run();

  if (setAsActive) {
    // Set as active account
    db.insert(anthropicSettings)
      .values({
        id: "singleton",
        activeAccountId: newId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: anthropicSettings.id,
        set: {
          activeAccountId: newId,
          updatedAt: new Date(),
        },
      })
      .run();
  }

  // Legacy `claudeCodeCredentials` mirror write removed by
  // add-dual-mode-llm-routing (Group 7). The `anthropicAccounts` row
  // above is now the sole persistence path.

  return newId;
}

/**
 * Claude Code OAuth router for desktop
 * Uses server only for sandbox creation, stores token locally
 */
export const claudeCodeRouter = router({
  /**
   * Check if user has existing CLI config (API key or proxy)
   * If true, user can skip OAuth onboarding
   * Based on PR #29 by @sa4hnd
   */
  hasExistingCliConfig: publicProcedure.query(() => {
    const shellEnv = getClaudeShellEnvironment();
    const hasConfig = !!(
      shellEnv.ANTHROPIC_API_KEY ||
      shellEnv.ANTHROPIC_AUTH_TOKEN ||
      shellEnv.ANTHROPIC_BASE_URL
    );
    return {
      hasConfig,
      hasApiKey: !!(
        shellEnv.ANTHROPIC_API_KEY || shellEnv.ANTHROPIC_AUTH_TOKEN
      ),
      baseUrl: shellEnv.ANTHROPIC_BASE_URL || null,
    };
  }),

  /**
   * Check if user has Claude Code connected (local check)
   * Now uses multi-account system - checks for active account
   */
  getIntegration: publicProcedure.query(() => {
    const db = getDatabase();

    // First try multi-account system
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get();

    if (settings?.activeAccountId) {
      const account = db
        .select()
        .from(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .get();

      if (account) {
        return {
          isConnected: true,
          connectedAt: account.connectedAt?.toISOString() ?? null,
          accountId: account.id,
          displayName: account.displayName,
        };
      }
    }

    // Fallback to legacy table
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get();

    return {
      isConnected: !!cred?.oauthToken,
      connectedAt: cred?.connectedAt?.toISOString() ?? null,
      accountId: null,
      displayName: null,
    };
  }),

  /**
   * Import an existing OAuth token from the local machine
   */
  importToken: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const oauthToken = input.token.trim();

      storeOAuthToken(oauthToken);

      console.log("[ClaudeCode] Token imported locally");
      return { success: true };
    }),

  /**
   * Check for existing Claude token in system credentials
   */
  getSystemToken: publicProcedure.query(() => {
    const token = getExistingClaudeToken()?.trim() ?? null;
    return { token };
  }),

  /**
   * Import Claude token from system credentials
   */
  importSystemToken: publicProcedure.mutation(() => {
    const token = getExistingClaudeToken()?.trim();
    if (!token) {
      throw new Error("No existing Claude token found");
    }

    storeOAuthToken(token);
    console.log("[ClaudeCode] Token imported from system");
    return { success: true };
  }),

  /**
   * Get decrypted OAuth token (local)
   * Now uses multi-account system - gets token from active account
   */
  getToken: publicProcedure.query(() => {
    const db = getDatabase();

    // First try multi-account system
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get();

    if (settings?.activeAccountId) {
      const account = db
        .select()
        .from(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .get();

      if (account?.oauthToken) {
        try {
          const token = decryptCredential(account.oauthToken);
          return { token, error: null };
        } catch (error) {
          console.error("[ClaudeCode] Decrypt error:", error);
          return { token: null, error: "Failed to decrypt token" };
        }
      }
    }

    // Fallback to legacy table
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get();

    if (!cred?.oauthToken) {
      return { token: null, error: "Not connected" };
    }

    try {
      const token = decryptCredential(cred.oauthToken);
      return { token, error: null };
    } catch (error) {
      console.error("[ClaudeCode] Decrypt error:", error);
      return { token: null, error: "Failed to decrypt token" };
    }
  }),

  /**
   * Disconnect - delete active account from multi-account system
   */
  disconnect: publicProcedure.mutation(() => {
    const db = getDatabase();

    // Get active account
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get();

    if (settings?.activeAccountId) {
      // Remove active account
      db.delete(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .run();

      // Try to set another account as active
      const firstRemaining = db.select().from(anthropicAccounts).limit(1).get();

      if (firstRemaining) {
        db.update(anthropicSettings)
          .set({
            activeAccountId: firstRemaining.id,
            updatedAt: new Date(),
          })
          .where(eq(anthropicSettings.id, "singleton"))
          .run();
      } else {
        db.update(anthropicSettings)
          .set({
            activeAccountId: null,
            updatedAt: new Date(),
          })
          .where(eq(anthropicSettings.id, "singleton"))
          .run();
      }
    }

    // Also clear legacy table
    db.delete(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .run();

    console.log("[ClaudeCode] Disconnected");
    return { success: true };
  }),
});
