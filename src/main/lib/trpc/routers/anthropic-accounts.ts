import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthManager } from "../../../index";
import {
  anthropicAccounts,
  anthropicSettings,
  claudeCodeCredentials,
  getDatabase,
} from "../../db";
import { encryptCredential, decryptCredential } from "../../credential-store";
import { createId } from "../../db/utils";
import { publicProcedure, router } from "../index";
import { clearClaudeCaches } from "./claude";

/**
 * Multi-account Anthropic management router
 */
export const anthropicAccountsRouter = router({
  /**
   * List all stored Anthropic accounts
   */
  list: publicProcedure.query(() => {
    const db = getDatabase();

    try {
      const accounts = db
        .select({
          id: anthropicAccounts.id,
          email: anthropicAccounts.email,
          displayName: anthropicAccounts.displayName,
          connectedAt: anthropicAccounts.connectedAt,
          lastUsedAt: anthropicAccounts.lastUsedAt,
        })
        .from(anthropicAccounts)
        .orderBy(anthropicAccounts.connectedAt)
        .all();

      // If we have accounts in new table, return them
      if (accounts.length > 0) {
        return accounts.map((acc) => ({
          ...acc,
          connectedAt: acc.connectedAt?.toISOString() ?? null,
          lastUsedAt: acc.lastUsedAt?.toISOString() ?? null,
        }));
      }
    } catch {
      // Table doesn't exist yet, fall through to legacy
    }

    // Fallback: check legacy table and return as single account
    try {
      const legacyCred = db
        .select()
        .from(claudeCodeCredentials)
        .where(eq(claudeCodeCredentials.id, "default"))
        .get();

      if (legacyCred?.oauthToken) {
        return [
          {
            id: "legacy-default",
            email: null,
            displayName: "Anthropic Account",
            connectedAt: legacyCred.connectedAt?.toISOString() ?? null,
            lastUsedAt: null,
          },
        ];
      }
    } catch {
      // Legacy table also doesn't exist
    }

    return [];
  }),

  /**
   * Get currently active account info
   */
  getActive: publicProcedure.query(() => {
    const db = getDatabase();

    try {
      const settings = db
        .select()
        .from(anthropicSettings)
        .where(eq(anthropicSettings.id, "singleton"))
        .get();

      if (settings?.activeAccountId) {
        const account = db
          .select({
            id: anthropicAccounts.id,
            email: anthropicAccounts.email,
            displayName: anthropicAccounts.displayName,
            connectedAt: anthropicAccounts.connectedAt,
          })
          .from(anthropicAccounts)
          .where(eq(anthropicAccounts.id, settings.activeAccountId))
          .get();

        if (account) {
          return {
            ...account,
            connectedAt: account.connectedAt?.toISOString() ?? null,
          };
        }
      }
    } catch {
      // Tables don't exist yet, fall through to legacy
    }

    // Fallback: if legacy credential exists, treat it as active
    try {
      const legacyCred = db
        .select()
        .from(claudeCodeCredentials)
        .where(eq(claudeCodeCredentials.id, "default"))
        .get();

      if (legacyCred?.oauthToken) {
        return {
          id: "legacy-default",
          email: null,
          displayName: "Anthropic Account",
          connectedAt: legacyCred.connectedAt?.toISOString() ?? null,
        };
      }
    } catch {
      // Legacy table also doesn't exist
    }

    return null;
  }),

  /**
   * Get decrypted OAuth token for active account
   */
  getActiveToken: publicProcedure.query(() => {
    const db = getDatabase();
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get();

    if (!settings?.activeAccountId) {
      return { token: null, error: "No active account" };
    }

    const account = db
      .select()
      .from(anthropicAccounts)
      .where(eq(anthropicAccounts.id, settings.activeAccountId))
      .get();

    if (!account) {
      return { token: null, error: "Active account not found" };
    }

    if (!account.oauthToken) {
      // Accounts with non-oauth credential types (byok) have no oauth token
      // to hand out. Callers relying on this endpoint (legacy Claude CLI
      // OAuth path) should treat this as "not connected".
      return { token: null, error: "Account has no OAuth token" };
    }

    try {
      const token = decryptCredential(account.oauthToken);
      return { token, error: null };
    } catch (error) {
      console.error("[AnthropicAccounts] Decrypt error:", error);
      return { token: null, error: "Failed to decrypt token" };
    }
  }),

  /**
   * Switch to a different account
   */
  setActive: publicProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase();

      // Verify account exists
      const account = db
        .select()
        .from(anthropicAccounts)
        .where(eq(anthropicAccounts.id, input.accountId))
        .get();

      if (!account) {
        throw new Error("Account not found");
      }

      // Update or insert settings
      db.insert(anthropicSettings)
        .values({
          id: "singleton",
          activeAccountId: input.accountId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: anthropicSettings.id,
          set: {
            activeAccountId: input.accountId,
            updatedAt: new Date(),
          },
        })
        .run();

      // Update lastUsedAt on the account
      db.update(anthropicAccounts)
        .set({ lastUsedAt: new Date() })
        .where(eq(anthropicAccounts.id, input.accountId))
        .run();

      // Sync legacy table so existing consumers (being deprecated in Group 7
      // of add-dual-mode-llm-routing) see the correct token. Skip entirely
      // when the active account has no oauth token (byok account types).
      db.delete(claudeCodeCredentials)
        .where(eq(claudeCodeCredentials.id, "default"))
        .run();

      if (account.oauthToken) {
        db.insert(claudeCodeCredentials)
          .values({
            id: "default",
            oauthToken: account.oauthToken,
            connectedAt: new Date(),
          })
          .run();
      }

      // Clear cached SDK state to ensure fresh token is used
      clearClaudeCaches();

      console.log(
        `[AnthropicAccounts] Switched to account: ${input.accountId}`,
      );
      return { success: true };
    }),

  /**
   * Add a new account (called after OAuth flow)
   */
  add: publicProcedure
    .input(
      z
        .object({
          // Existing callers only pass oauthToken; keep for back-compat.
          oauthToken: z.string().min(1).optional(),
          // Dual-mode routing fields (add-dual-mode-llm-routing)
          accountType: z
            .enum(["claude-subscription", "byok"])
            .default("claude-subscription"),
          routingMode: z.enum(["direct", "litellm"]).default("litellm"),
          apiKey: z.string().min(1).optional(),
          virtualKey: z.string().min(1).optional(),
          modelSonnet: z.string().optional(),
          modelHaiku: z.string().optional(),
          modelOpus: z.string().optional(),
          email: z.string().optional(),
          displayName: z.string().optional(),
        })
        .refine(
          (v) =>
            (v.oauthToken ? 1 : 0) +
              (v.apiKey ? 1 : 0) +
              (v.virtualKey ? 1 : 0) >=
            1,
          "At least one of oauthToken, apiKey, virtualKey must be provided",
        ),
    )
    .mutation(({ input }) => {
      const db = getDatabase();
      const authManager = getAuthManager();
      const user = authManager.getUser();

      // All three credential columns route through credential-store.ts
      const encOauth = input.oauthToken
        ? encryptCredential(input.oauthToken)
        : null;
      const encApiKey = input.apiKey
        ? encryptCredential(input.apiKey)
        : null;
      const encVirtualKey = input.virtualKey
        ? encryptCredential(input.virtualKey)
        : null;
      const newId = createId();

      db.insert(anthropicAccounts)
        .values({
          id: newId,
          accountType: input.accountType,
          routingMode: input.routingMode,
          email: input.email ?? null,
          displayName: input.displayName || input.email || "Anthropic Account",
          oauthToken: encOauth,
          apiKey: encApiKey,
          virtualKey: encVirtualKey,
          modelSonnet: input.modelSonnet ?? null,
          modelHaiku: input.modelHaiku ?? null,
          modelOpus: input.modelOpus ?? null,
          connectedAt: new Date(),
          desktopUserId: user?.id ?? null,
        })
        .run();

      // Count accounts
      const countResult = db
        .select({ count: sql<number>`count(*)` })
        .from(anthropicAccounts)
        .get();

      // Automatically set as active if it's the first account
      if (countResult?.count === 1) {
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

      console.log(
        `[AnthropicAccounts] Added new account: ${newId} (type=${input.accountType}, routing=${input.routingMode})`,
      );
      return { id: newId, success: true };
    }),

  /**
   * Update account display name
   */
  rename: publicProcedure
    .input(
      z.object({
        accountId: z.string(),
        displayName: z.string().min(1),
      }),
    )
    .mutation(({ input }) => {
      const db = getDatabase();

      const result = db
        .update(anthropicAccounts)
        .set({ displayName: input.displayName })
        .where(eq(anthropicAccounts.id, input.accountId))
        .run();

      if (result.changes === 0) {
        throw new Error("Account not found");
      }

      console.log(
        `[AnthropicAccounts] Renamed account ${input.accountId} to "${input.displayName}"`,
      );
      return { success: true };
    }),

  /**
   * Remove an account
   */
  remove: publicProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase();

      // Check if this is the active account
      const settings = db
        .select()
        .from(anthropicSettings)
        .where(eq(anthropicSettings.id, "singleton"))
        .get();

      // Delete the account
      db.delete(anthropicAccounts)
        .where(eq(anthropicAccounts.id, input.accountId))
        .run();

      // If deleted account was active, set another account as active
      if (settings?.activeAccountId === input.accountId) {
        const firstRemaining = db
          .select()
          .from(anthropicAccounts)
          .limit(1)
          .get();

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

      console.log(`[AnthropicAccounts] Removed account: ${input.accountId}`);
      return { success: true };
    }),

  /**
   * Check if any accounts are connected
   */
  hasAccounts: publicProcedure.query(() => {
    const db = getDatabase();
    const countResult = db
      .select({ count: sql<number>`count(*)` })
      .from(anthropicAccounts)
      .get();

    return { hasAccounts: (countResult?.count ?? 0) > 0 };
  }),

  // `migrateLegacy` mutation removed by add-dual-mode-llm-routing.
  // Greenfield project: there is no legacy data to migrate, and the
  // useEffect that called this mutation was resurrecting deleted accounts
  // by re-seeding from the claude_code_credentials table. Deletion is
  // enforced by tests/regression/no-migrate-legacy.test.ts.
  // See openspec/changes/add-dual-mode-llm-routing/specs/claude-code-auth-import/spec.md
  // (REMOVED Requirements) for rationale.
});
