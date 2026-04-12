import { initTRPC, TRPCError } from "@trpc/server";
import { BrowserWindow } from "electron";
import superjson from "superjson";
import { getAuthManager } from "../../index";

/**
 * Context passed to all tRPC procedures
 */
export interface Context {
  getWindow: () => BrowserWindow | null;
}

/**
 * Initialize tRPC with context and superjson transformer
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

/**
 * Centralized auth guard for security-sensitive tRPC procedures.
 *
 * Wraps `authManager.isAuthenticated()` which transparently honors
 * `isDevAuthBypassed()` (MAIN_VITE_DEV_BYPASS_AUTH=true) and routes to the
 * enterprise MSAL flow vs. legacy OAuth store based on the `enterpriseAuth`
 * flag. Throws `UNAUTHORIZED` if no session is present — the renderer treats
 * this as a signal to send the user back to the login page.
 *
 * Use for: enterprise-auth mutations, external URL handlers, credential
 * reads/writes, and any procedure that returns data tied to a logged-in
 * user. Local-only infrastructure (database reads, file system operations)
 * does not need this middleware given the IPC-only transport.
 */
export const authedProcedure = t.procedure.use(async ({ next }) => {
  const authManager = getAuthManager();
  if (!authManager?.isAuthenticated()) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next();
});
