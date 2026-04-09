/**
 * Shared types for enterprise Entra ID authentication.
 *
 * These types define the contract between enterprise-auth.ts (token
 * acquisition), enterprise-store.ts (cache persistence), and future
 * consumers (auth-manager.ts in change #2, buildClaudeEnv in change #2).
 *
 * The identity key is `oid` (Entra object ID), NOT `preferred_username`
 * or `email` — per Microsoft docs, those are tenant-admin-mutable and
 * unsuitable for authorization.
 */

/**
 * Configuration for the MSAL PublicClientApplication.
 * In Phase 1 change #3, these become user-configurable via Settings UI.
 * For now, sourced from environment variables with org defaults.
 */
export interface EnterpriseAuthConfig {
  /** Entra app registration client ID (GUID) */
  clientId: string;
  /** Entra tenant ID (GUID) */
  tenantId: string;
  /** Override authority URL. Defaults to `https://login.microsoftonline.com/{tenantId}/v2.0` */
  authority?: string;
  /** Override redirect URI. Defaults to `http://localhost` (MSAL loopback) */
  redirectUri?: string;
}

/**
 * Authenticated user identity extracted from Entra ID token claims.
 * `oid` is the authoritative identity key — see CLAUDE.md Known Security Gaps.
 */
export interface EnterpriseUser {
  /** Entra object ID (GUID) — the identity key */
  oid: string;
  /** Entra tenant ID (GUID) */
  tid: string;
  /** User's display name from the `name` claim */
  displayName: string;
  /** User's email (may be null for service principals or B2B guests) */
  email: string | null;
}

/**
 * Result of a successful token acquisition (interactive or silent).
 */
export interface EnterpriseAuthResult {
  /** Bearer access token for the LiteLLM / Envoy Gateway endpoint */
  accessToken: string;
  /** Token expiration time */
  expiresOn: Date;
  /** Authenticated user identity */
  account: EnterpriseUser;
}
