import { AuthStore, AuthData, AuthUser } from "./auth-store";
import { app, BrowserWindow } from "electron";
import { getFlag, getFlagWithSource } from "./lib/feature-flags";
import { EnterpriseAuth, getEnterpriseAuthConfig } from "./lib/enterprise-auth";
import type { EnterpriseUser } from "./lib/enterprise-types";

/**
 * Discriminated kinds for auth errors thrown from `startAuthFlow()`.
 * The IPC sanitizer in `windows/main.ts` switches on `authKind` to map
 * to the renderer-facing `AuthError` discriminated union (see
 * src/preload/index.d.ts) and to apply dev-vs-end-user wording.
 *
 * Spec contract:
 *   openspec/specs/enterprise-auth-wiring/spec.md →
 *     "Auth error IPC payload is a typed discriminated union"
 */
export type AuthErrorKind =
  | "flag-off"
  | "config-missing"
  | "init-failed"
  | "msal-error";

interface TaggedAuthError extends Error {
  authKind: AuthErrorKind;
}

function createAuthError(kind: AuthErrorKind, message?: string): TaggedAuthError {
  const defaults: Record<AuthErrorKind, string> = {
    "flag-off":
      "Enterprise auth is not configured. Set MAIN_VITE_ENTRA_CLIENT_ID, MAIN_VITE_ENTRA_TENANT_ID, and MAIN_VITE_ENTERPRISE_AUTH_ENABLED=true in your .env (or use MAIN_VITE_DEV_BYPASS_AUTH=true to skip auth in dev).",
    "config-missing":
      "Enterprise auth is enabled but MAIN_VITE_ENTRA_CLIENT_ID and/or MAIN_VITE_ENTRA_TENANT_ID environment variables are unset. Check your .env.",
    "init-failed":
      "Enterprise auth (MSAL) initialization failed. See the main-process console for details.",
    "msal-error":
      "Sign-in failed. See logs for details.",
  };
  const err = new Error(message ?? defaults[kind]) as TaggedAuthError;
  err.authKind = kind;
  return err;
}

// Get API URL - in packaged app always use production, in dev allow override
function getApiBaseUrl(): string {
  if (app.isPackaged) {
    return "https://apollosai.dev";
  }
  return import.meta.env.MAIN_VITE_API_URL || "https://apollosai.dev";
}

// Dev-only auth bypass: set MAIN_VITE_DEV_BYPASS_AUTH=true in .env to skip
// the login screen when the enterprise auth backend (Envoy Gateway + Entra)
// is not yet deployed. Never works in packaged builds.
function isDevAuthBypassed(): boolean {
  return (
    !app.isPackaged && import.meta.env.MAIN_VITE_DEV_BYPASS_AUTH === "true"
  );
}

const DEV_BYPASS_USER: AuthUser = {
  id: "dev-bypass-user",
  email: "dev@localhost",
  name: "Dev Bypass User",
  imageUrl: null,
  username: "dev-bypass",
};

// Dev bypass user with synthetic Entra fields for enterprise mode
const DEV_BYPASS_USER_ENTERPRISE: AuthUser = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "dev@localhost",
  name: "Dev Bypass User (Enterprise)",
  imageUrl: null,
  username: "dev-bypass",
};

/**
 * Adapt EnterpriseUser (Entra claims) to AuthUser (app-wide shape).
 * This is the single boundary where the shape translation happens.
 */
function adaptEnterpriseUser(eu: EnterpriseUser): AuthUser {
  return {
    id: eu.oid,
    email: eu.email ?? "unknown@enterprise",
    name: eu.displayName,
    imageUrl: null,
    username: eu.email,
  };
}

export class AuthManager {
  private store: AuthStore | null;
  private refreshTimer?: NodeJS.Timeout;
  private isDev: boolean;
  private onTokenRefresh?: (authData: AuthData) => void;
  private enterpriseAuth: EnterpriseAuth | null = null;
  private readyPromise: Promise<void>;
  private readonly isEnterprise: boolean;
  /**
   * If `initEnterprise()` failed, this records WHY so that
   * `startAuthFlow()` can throw a typed `AuthError` with the right
   * `authKind` (config-missing vs init-failed). `null` means init
   * succeeded (or has not run yet — call `ensureReady()` first).
   */
  private initFailureKind: "config-missing" | "init-failed" | null = null;

  constructor(isDev: boolean = false) {
    this.isDev = isDev;
    const flagState = getFlagWithSource("enterpriseAuthEnabled");
    this.isEnterprise = flagState.value;
    // Spec: "Startup logs resolved flag source" — answer "why is enterprise
    // auth on/off?" in one log line without grepping the database.
    console.log(
      `[AuthManager] enterpriseAuthEnabled=${flagState.value} (source: ${flagState.source})`,
    );

    if (this.isEnterprise) {
      // Enterprise mode: skip AuthStore (MSAL cache plugin handles persistence)
      this.store = null;
      this.readyPromise = this.initEnterprise();
    } else {
      // Legacy mode: use AuthStore as before
      this.store = new AuthStore(app.getPath("userData"));
      this.readyPromise = Promise.resolve();

      // Schedule refresh if already authenticated
      if (this.store.isAuthenticated()) {
        this.scheduleRefresh();
      }
    }
  }

  /**
   * Initialize MSAL PublicClientApplication asynchronously.
   * Called from constructor, resolved via ensureReady().
   */
  private async initEnterprise(): Promise<void> {
    try {
      const config = getEnterpriseAuthConfig();
      this.enterpriseAuth = await EnterpriseAuth.create(config);
      console.log("[AuthManager] Enterprise auth (MSAL) initialized");
    } catch (err) {
      console.error("[AuthManager] Failed to initialize enterprise auth:", err);
      // enterpriseAuth stays null — isAuthenticated() will return false.
      // Distinguish config-missing (env vars unset) from init-failed (MSAL
      // construction itself threw) so the click-time error is actionable.
      const message = err instanceof Error ? err.message : String(err);
      this.initFailureKind =
        message.includes("MAIN_VITE_ENTRA_CLIENT_ID") ||
        message.includes("MAIN_VITE_ENTRA_TENANT_ID")
          ? "config-missing"
          : "init-failed";
      // Surface a one-line actionable warn so `bun run dev` developers see
      // the missing config without needing to read full stack traces.
      // Spec: openspec/specs/enterprise-auth-wiring/spec.md →
      //   "Startup configuration warning when MSAL init fails"
      console.warn(
        "[AuthManager] enterpriseAuthEnabled=true but MSAL init failed. " +
          "Check MAIN_VITE_ENTRA_CLIENT_ID and MAIN_VITE_ENTRA_TENANT_ID env vars.",
      );
    }
  }

  /**
   * Wait for MSAL initialization to complete. No-op when enterprise flag
   * is off. Must be awaited at app startup before checking auth state.
   */
  async ensureReady(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Set callback to be called when token is refreshed
   * This allows the main process to update cookies when tokens change
   */
  setOnTokenRefresh(callback: (authData: AuthData) => void): void {
    this.onTokenRefresh = callback;
  }

  private getApiUrl(): string {
    return getApiBaseUrl();
  }

  /**
   * Exchange auth code for session tokens
   * Called after receiving code via deep link
   */
  async exchangeCode(code: string): Promise<AuthData> {
    if (this.isEnterprise) {
      throw new Error("Not available in enterprise mode");
    }

    const response = await fetch(
      `${this.getApiUrl()}/api/auth/desktop/exchange`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          deviceInfo: this.getDeviceInfo(),
        }),
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `Exchange failed: ${response.status}`);
    }

    const data = await response.json();

    const authData: AuthData = {
      token: data.token,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      user: data.user,
    };

    this.store!.save(authData);
    this.scheduleRefresh();

    return authData;
  }

  /**
   * Get device info for session tracking
   */
  private getDeviceInfo(): string {
    const platform = process.platform;
    const arch = process.arch;
    const version = app.getVersion();
    return `1Code ${version} (${platform} ${arch})`;
  }

  /**
   * Get a valid token, refreshing if necessary
   */
  async getValidToken(): Promise<string | null> {
    if (this.isEnterprise) {
      if (!this.enterpriseAuth) return null;
      try {
        const result = await this.enterpriseAuth.acquireTokenSilent();
        return result.accessToken;
      } catch {
        return null;
      }
    }

    if (!this.store!.isAuthenticated()) {
      return null;
    }

    if (this.store!.needsRefresh()) {
      await this.refresh();
    }

    return this.store!.getToken();
  }

  /**
   * Refresh the current session
   */
  async refresh(): Promise<boolean> {
    if (this.isEnterprise) {
      if (!this.enterpriseAuth) return false;
      try {
        await this.enterpriseAuth.acquireTokenSilent();
        return true;
      } catch {
        return false;
      }
    }

    const refreshToken = this.store!.getRefreshToken();
    if (!refreshToken) {
      console.warn("No refresh token available");
      return false;
    }

    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/auth/desktop/refresh`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        },
      );

      if (!response.ok) {
        console.error("Refresh failed:", response.status);
        // If refresh fails, clear auth and require re-login
        if (response.status === 401) {
          this.logout();
        }
        return false;
      }

      const data = await response.json();

      const authData: AuthData = {
        token: data.token,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        user: data.user,
      };

      this.store!.save(authData);
      this.scheduleRefresh();

      // Notify callback about token refresh (so cookie can be updated)
      if (this.onTokenRefresh) {
        this.onTokenRefresh(authData);
      }

      return true;
    } catch (error) {
      console.error("Refresh error:", error);
      return false;
    }
  }

  /**
   * Schedule token refresh before expiration.
   * No-op in enterprise mode — MSAL handles refresh on-demand via acquireTokenSilent().
   */
  private scheduleRefresh(): void {
    if (this.isEnterprise) return;

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const authData = this.store!.load();
    if (!authData) return;

    const expiresAt = new Date(authData.expiresAt).getTime();
    const now = Date.now();

    // Refresh 5 minutes before expiration
    const refreshIn = Math.max(0, expiresAt - now - 5 * 60 * 1000);

    this.refreshTimer = setTimeout(() => {
      this.refresh();
    }, refreshIn);

    console.log(
      `Scheduled token refresh in ${Math.round(refreshIn / 1000 / 60)} minutes`,
    );
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    if (isDevAuthBypassed()) return true;

    if (this.isEnterprise) {
      return this.enterpriseAuth?.isAuthenticated() ?? false;
    }

    return this.store!.isAuthenticated();
  }

  /**
   * Get current user
   */
  getUser(): AuthUser | null {
    if (isDevAuthBypassed()) {
      return this.isEnterprise ? DEV_BYPASS_USER_ENTERPRISE : DEV_BYPASS_USER;
    }

    if (this.isEnterprise) {
      const account = this.enterpriseAuth?.getAccount();
      if (!account) return null;
      return adaptEnterpriseUser(account);
    }

    return this.store!.getUser();
  }

  /**
   * Get current auth data
   */
  getAuth(): AuthData | null {
    if (this.isEnterprise) {
      // No AuthData equivalent in enterprise mode — return null.
      // Callers that need a token should use getValidToken() instead.
      return null;
    }
    return this.store!.load();
  }

  /**
   * Logout and clear stored credentials
   */
  logout(): void {
    if (this.isEnterprise) {
      this.enterpriseAuth?.signOut().catch((err) => {
        console.error("[AuthManager] Enterprise sign-out failed:", err);
      });
      return;
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.store!.clear();
  }

  /**
   * Start auth flow by opening browser
   */
  async startAuthFlow(_mainWindow: BrowserWindow | null): Promise<void> {
    // Caller (windows/main.ts auth:start-flow IPC handler) MUST await
    // ensureReady() before invoking this method to avoid the race where
    // a fast click resolves before initEnterprise() completes.
    if (this.isEnterprise) {
      if (!this.enterpriseAuth) {
        // Init failed (or hasn't run). Throw the kind recorded by
        // initEnterprise() so the IPC sanitizer can map to the renderer
        // AuthError.kind correctly.
        // Spec: "Sign-in click with flag on but MSAL init failed"
        throw createAuthError(this.initFailureKind ?? "init-failed");
      }
      // Entra interactive sign-in (opens browser via MSAL)
      try {
        await this.enterpriseAuth.acquireTokenInteractive();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw createAuthError("msal-error", msg);
      }
      return;
    }

    // Flag is OFF. The legacy upstream SaaS auth-desktop fallthrough was
    // removed in wire-login-button-to-msal — the upstream
    // SaaS endpoint is dead and there is no scenario where opening it
    // succeeds. Fail loudly so the renderer can surface an actionable
    // error toast instead of silently opening a 404.
    // Spec: "Sign-in click with flag off — no dead-URL fallthrough"
    throw createAuthError("flag-off");
  }

  /**
   * Update user profile on server and locally
   */
  async updateUser(updates: { name?: string }): Promise<AuthUser | null> {
    if (this.isEnterprise) {
      throw new Error("Not available in enterprise mode");
    }

    const token = await this.getValidToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    // Update on server using X-Desktop-Token header
    const response = await fetch(`${this.getApiUrl()}/api/user/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Desktop-Token": token,
      },
      body: JSON.stringify({
        display_name: updates.name,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `Update failed: ${response.status}`);
    }

    // Update locally
    return this.store!.updateUser({ name: updates.name ?? null });
  }

  /**
   * Fetch user's subscription plan from web backend
   * Used for PostHog analytics enrichment
   */
  async fetchUserPlan(): Promise<{
    email: string;
    plan: string;
    status: string | null;
  } | null> {
    if (this.isEnterprise) return null;

    const token = await this.getValidToken();
    if (!token) return null;

    try {
      const response = await fetch(
        `${this.getApiUrl()}/api/desktop/user/plan`,
        {
          headers: { "X-Desktop-Token": token },
        },
      );

      if (!response.ok) {
        console.error(
          "[AuthManager] Failed to fetch user plan:",
          response.status,
        );
        return null;
      }

      return response.json();
    } catch (error) {
      console.error("[AuthManager] Failed to fetch user plan:", error);
      return null;
    }
  }
}

// Global singleton instance
let authManagerInstance: AuthManager | null = null;

/**
 * Initialize the global auth manager instance
 * Must be called once from main process initialization
 */
export function initAuthManager(isDev: boolean = false): AuthManager {
  authManagerInstance ??= new AuthManager(isDev);
  return authManagerInstance;
}

/**
 * Get the global auth manager instance
 * Returns null if not initialized
 */
export function getAuthManager(): AuthManager | null {
  return authManagerInstance;
}
