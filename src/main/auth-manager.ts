import { AuthStore, AuthData, AuthUser } from "./auth-store";
import { app, BrowserWindow } from "electron";
import { AUTH_SERVER_PORT } from "./constants";
import { getFlag } from "./lib/feature-flags";
import {
  EnterpriseAuth,
  getEnterpriseAuthConfig,
} from "./lib/enterprise-auth";
import type { EnterpriseUser } from "./lib/enterprise-types";

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
  return !app.isPackaged && import.meta.env.MAIN_VITE_DEV_BYPASS_AUTH === "true";
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

  constructor(isDev: boolean = false) {
    this.isDev = isDev;
    this.isEnterprise = getFlag("enterpriseAuthEnabled");

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
      // enterpriseAuth stays null — isAuthenticated() will return false
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
  startAuthFlow(mainWindow: BrowserWindow | null): void {
    if (this.isEnterprise) {
      if (!this.enterpriseAuth) {
        console.error("[AuthManager] Enterprise auth not initialized");
        return;
      }
      // Entra interactive sign-in (opens browser via MSAL)
      this.enterpriseAuth.acquireTokenInteractive().catch((err) => {
        console.error("[AuthManager] Interactive sign-in failed:", err);
      });
      return;
    }

    const { shell } = require("electron");

    let authUrl = `${this.getApiUrl()}/auth/desktop?auto=true`;

    // In dev mode, use localhost callback (we run HTTP server on AUTH_SERVER_PORT)
    // Also pass the protocol so web knows which deep link to use as fallback
    if (this.isDev) {
      authUrl += `&callback=${encodeURIComponent(`http://localhost:${AUTH_SERVER_PORT}/auth/callback`)}`;
      // Pass dev protocol so production web can use correct deep link if callback fails
      authUrl += `&protocol=apollosai-agents-dev`;
    }

    shell.openExternal(authUrl);
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
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager(isDev);
  }
  return authManagerInstance;
}

/**
 * Get the global auth manager instance
 * Returns null if not initialized
 */
export function getAuthManager(): AuthManager | null {
  return authManagerInstance;
}
