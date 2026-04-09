/**
 * tRPC router for enterprise Entra ID authentication.
 *
 * Exposes sign-in, sign-out, status, and token refresh procedures for the
 * renderer. All procedures check the `enterpriseAuthEnabled` feature flag
 * and throw PRECONDITION_FAILED if disabled.
 *
 * Spec contract:
 *   openspec/changes/wire-enterprise-auth/specs/enterprise-auth-wiring/spec.md
 */

import { router, publicProcedure } from "../index";
import { TRPCError } from "@trpc/server";
import { getFlag } from "../../feature-flags";
import { getAuthManager } from "../../../auth-manager";

function assertEnterprise(): void {
  if (!getFlag("enterpriseAuthEnabled")) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Enterprise auth is not enabled",
    });
  }
}

export const enterpriseAuthRouter = router({
  /**
   * Trigger interactive Entra sign-in (opens browser via MSAL).
   */
  signIn: publicProcedure.mutation(async () => {
    assertEnterprise();
    const authManager = getAuthManager();
    if (!authManager) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AuthManager not initialized",
      });
    }
    authManager.startAuthFlow(null);
    return { ok: true };
  }),

  /**
   * Sign out — clears MSAL cache for the active account.
   */
  signOut: publicProcedure.mutation(async () => {
    assertEnterprise();
    const authManager = getAuthManager();
    if (!authManager) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AuthManager not initialized",
      });
    }
    authManager.logout();
    return { ok: true };
  }),

  /**
   * Get current enterprise auth status (authenticated, user info).
   */
  getStatus: publicProcedure.query(() => {
    assertEnterprise();
    const authManager = getAuthManager();
    if (!authManager) {
      return { authenticated: false, user: null };
    }
    return {
      authenticated: authManager.isAuthenticated(),
      user: authManager.getUser(),
    };
  }),

  /**
   * Refresh the enterprise auth token silently.
   */
  refreshToken: publicProcedure.mutation(async () => {
    assertEnterprise();
    const authManager = getAuthManager();
    if (!authManager) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AuthManager not initialized",
      });
    }
    const success = await authManager.refresh();
    return { ok: success };
  }),
});
