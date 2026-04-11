/**
 * Enterprise Entra ID authentication via MSAL Node.
 *
 * This module provides token acquisition for the Envoy Gateway dual-auth
 * pattern (docs/enterprise/auth-strategy.md v2.1). CLI subprocesses
 * (Claude Code, Codex) receive the acquired Bearer token via the
 * ANTHROPIC_AUTH_TOKEN env var (the only mechanism CLI 2.1.96 supports).
 * Future: CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR (FD-based) when CLI
 * pin is bumped.
 *
 * Phase 1 change #2 (wire-enterprise-auth) wired this module into
 * auth-manager.ts via a Strangler Fig adapter gated by the
 * `enterpriseAuthEnabled` feature flag.
 *
 * Auth strategy references:
 *   §5.1 — PublicClientApplication (token acquisition only)
 *   §5.3 — Module structure
 *   §7.1.1 — Linux keystore fallback (delegated to enterprise-store.ts)
 */

import {
  PublicClientApplication,
  type Configuration,
  type AuthenticationResult,
  type AccountInfo,
  type SilentFlowRequest,
  LogLevel,
} from "@azure/msal-node";
import { createEnterpriseCachePlugin } from "./enterprise-store";
import type {
  EnterpriseAuthConfig,
  EnterpriseAuthResult,
  EnterpriseUser,
} from "./enterprise-types";

// Default scopes for the LiteLLM / Envoy Gateway audience.
// The `.default` scope requests all statically-configured permissions.
const DEFAULT_SCOPES = ["openid", "profile", "email", "offline_access"];

/**
 * Extract EnterpriseUser from an MSAL AccountInfo using jose for
 * JWT claim inspection.
 */
function accountToUser(account: AccountInfo): EnterpriseUser {
  // MSAL populates idTokenClaims from the decoded ID token
  const claims = account.idTokenClaims as Record<string, unknown> | undefined;

  return {
    oid:
      (claims?.oid as string) ??
      account.localAccountId ??
      account.homeAccountId,
    tid: (claims?.tid as string) ?? account.tenantId ?? "",
    displayName: (claims?.name as string) ?? account.name ?? "",
    email: (claims?.email as string) ?? account.username ?? null,
  };
}

/**
 * Convert MSAL AuthenticationResult to our EnterpriseAuthResult type.
 */
function toAuthResult(result: AuthenticationResult): EnterpriseAuthResult {
  if (!result.account) {
    throw new Error("Authentication succeeded but no account was returned");
  }

  return {
    accessToken: result.accessToken,
    expiresOn: result.expiresOn ?? new Date(Date.now() + 3600_000),
    account: accountToUser(result.account),
  };
}

/**
 * Enterprise auth instance wrapping MSAL PublicClientApplication.
 */
export class EnterpriseAuth {
  private pca: PublicClientApplication;
  private config: EnterpriseAuthConfig;
  private cachedAccount: AccountInfo | null = null;

  private constructor(
    pca: PublicClientApplication,
    config: EnterpriseAuthConfig,
  ) {
    this.pca = pca;
    this.config = config;
  }

  /**
   * Async factory — must be used instead of direct construction because
   * the cache plugin initialization is async.
   */
  static async create(config: EnterpriseAuthConfig): Promise<EnterpriseAuth> {
    const authority =
      config.authority ??
      `https://login.microsoftonline.com/${config.tenantId}/v2.0`;

    const cachePlugin = await createEnterpriseCachePlugin();

    const msalConfig: Configuration = {
      auth: {
        clientId: config.clientId,
        authority,
        // CP1 (Continuous Access Evaluation) intentionally omitted.
        // LiteLLM is not a CAE-enabled resource — enabling CP1 would cause
        // Entra to issue 28-hour tokens that cannot be revoked by the resource,
        // which is worse than the default 1-hour lifetime. See agent team
        // review finding C3 (2026-04-09).
      },
      cache: {
        cachePlugin,
      },
      system: {
        loggerOptions: {
          logLevel: LogLevel.Warning,
          loggerCallback: (level, message) => {
            if (level <= LogLevel.Warning) {
              console.warn(`[MSAL] ${message}`);
            }
          },
          piiLoggingEnabled: false,
        },
      },
    };

    const pca = new PublicClientApplication(msalConfig);
    return new EnterpriseAuth(pca, config);
  }

  /**
   * Interactive token acquisition — opens browser to Entra sign-in page.
   * Uses PKCE automatically (MSAL Node handles code_challenge generation).
   */
  async acquireTokenInteractive(): Promise<EnterpriseAuthResult> {
    const result = await this.pca.acquireTokenInteractive({
      scopes: DEFAULT_SCOPES,
      openBrowser: async (url) => {
        // Electron's shell.openExternal handles cross-platform browser launch
        const { shell } = await import("electron");
        await shell.openExternal(url);
      },
      successTemplate:
        "<h1>Authentication complete</h1><p>You can close this window and return to 1Code.</p>",
      errorTemplate:
        "<h1>Authentication failed</h1><p>Error: {{error}}. Please close this window and try again in 1Code.</p>",
    });

    this.cachedAccount = result.account;
    return toAuthResult(result);
  }

  /**
   * Silent token acquisition — uses cached refresh token.
   * Call this for token renewal before spawning CLI subprocesses.
   */
  async acquireTokenSilent(): Promise<EnterpriseAuthResult> {
    const account = await this.getActiveAccount();
    if (!account) {
      throw new Error(
        "No cached account — call acquireTokenInteractive() first",
      );
    }

    const request: SilentFlowRequest = {
      scopes: DEFAULT_SCOPES,
      account,
    };

    const result = await this.pca.acquireTokenSilent(request);
    this.cachedAccount = result.account;
    return toAuthResult(result);
  }

  /**
   * Sign out — clears the MSAL cache for the active account.
   */
  async signOut(): Promise<void> {
    const account = await this.getActiveAccount();
    if (account) {
      const cache = this.pca.getTokenCache();
      await cache.removeAccount(account);
    }
    this.cachedAccount = null;
  }

  /**
   * Get the cached user without network calls.
   * Returns null if no account is cached.
   */
  getAccount(): EnterpriseUser | null {
    if (!this.cachedAccount) return null;
    return accountToUser(this.cachedAccount);
  }

  /**
   * Check if an authenticated, non-expired account exists in the cache.
   */
  isAuthenticated(): boolean {
    return this.cachedAccount !== null;
  }

  /**
   * Resolve the active account from the MSAL cache.
   * Prefers the in-memory cached account, falls back to the first
   * account in the persistent cache.
   */
  private async getActiveAccount(): Promise<AccountInfo | null> {
    if (this.cachedAccount) return this.cachedAccount;

    const cache = this.pca.getTokenCache();
    const accounts = await cache.getAllAccounts();
    if (accounts.length > 0) {
      this.cachedAccount = accounts[0];
      return this.cachedAccount;
    }

    return null;
  }
}

/**
 * Factory function — the public API entry point.
 * Creates a configured EnterpriseAuth instance.
 */
export async function createEnterpriseAuth(
  config: EnterpriseAuthConfig,
): Promise<EnterpriseAuth> {
  return EnterpriseAuth.create(config);
}

/**
 * Build an EnterpriseAuthConfig from environment variables.
 * Used during development; Phase 1 change #3 adds UI config.
 *
 * Both ENTRA_CLIENT_ID and ENTRA_TENANT_ID are required — no hardcoded
 * fallbacks so misconfigured environments fail fast rather than silently
 * targeting the wrong tenant.
 */
export function getEnterpriseAuthConfig(): EnterpriseAuthConfig {
  const clientId = process.env.ENTRA_CLIENT_ID;
  const tenantId = process.env.ENTRA_TENANT_ID;

  if (!clientId) {
    throw new Error(
      "ENTRA_CLIENT_ID environment variable is required for enterprise auth. " +
        "Set it to the Entra app registration client ID (GUID).",
    );
  }

  if (!tenantId) {
    throw new Error(
      "ENTRA_TENANT_ID environment variable is required for enterprise auth. " +
        "Set it to the Entra Directory (tenant) ID (GUID).",
    );
  }

  return { clientId, tenantId };
}
