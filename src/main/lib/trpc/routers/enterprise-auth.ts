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

import { router, publicProcedure, authedProcedure } from "../index";
import { TRPCError } from "@trpc/server";
import { getFlag } from "../../feature-flags";
import { getAuthManager } from "../../../auth-manager";
import {
  fetchGraphProfile,
  GraphProfileError,
  type GraphProfile,
} from "../../graph-profile";
import { InteractionRequiredAuthError } from "@azure/msal-node";

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
   * Non-throwing flag probe. Renderer gates that conditionally render
   * affordances only for enterprise-auth sessions (e.g. the model-picker
   * "Add Models" footer) use this to avoid catching PRECONDITION_FAILED
   * on every load.
   */
  isEnabled: publicProcedure.query(() => {
    return { enabled: getFlag("enterpriseAuthEnabled") };
  }),

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
  signOut: authedProcedure.mutation(async () => {
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
   * Fetch the signed-in user's Microsoft Graph profile (/me + /me/photo).
   *
   * Returns `null` when enterprise auth is off, when no account is cached,
   * when MSAL reports `InteractionRequiredAuthError` (user needs to re-
   * consent for `User.Read`), or when the Graph /me call itself fails.
   * The renderer hides the Graph UI when the value is null and falls back
   * to `desktopApi.getUser()` for the baseline profile fields.
   *
   * Photo-endpoint failures do NOT null this whole response — they degrade
   * only the `avatarDataUrl` field; see `fetchGraphProfile` for details.
   */
  getGraphProfile: authedProcedure.query(
    async (): Promise<GraphProfile | null> => {
      if (!getFlag("enterpriseAuthEnabled")) return null;
      const authManager = getAuthManager();
      if (!authManager) return null;

      try {
        const token = await authManager.getGraphToken();
        return await fetchGraphProfile(token);
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          console.warn(
            "[enterpriseAuth.getGraphProfile] Interaction required — user must re-consent for User.Read",
          );
          return null;
        }
        if (err instanceof GraphProfileError) {
          console.warn(
            `[enterpriseAuth.getGraphProfile] Graph /me failed with status ${err.status}`,
          );
          return null;
        }
        console.warn(
          "[enterpriseAuth.getGraphProfile] Unexpected error:",
          err,
        );
        return null;
      }
    },
  ),

  /**
   * Refresh the enterprise auth token silently.
   */
  refreshToken: authedProcedure.mutation(async () => {
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
