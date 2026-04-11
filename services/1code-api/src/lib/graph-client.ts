import {
  ConfidentialClientApplication,
  type Configuration,
} from "@azure/msal-node";

interface CachedToken {
  value: string;
  /** Epoch ms at which we should treat the token as expired (60s before real expiry) */
  expiresAt: number;
}

export interface GraphClientConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Entra/AAD Object IDs are UUIDs. Anchored match prevents path-traversal
 * payloads like "me/messages?$filter=..." from being interpolated into
 * the Graph API URL. See `getUserGroups()` for the load-bearing rationale.
 */
const OID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Thin wrapper around the Microsoft Graph API for reading Entra group
 * membership. Uses MSAL ConfidentialClientApplication (client credentials
 * flow) with an in-memory token cache that expires 60 seconds before the
 * token's real expiry to avoid using a token that is about to expire.
 */
export class GraphClient {
  private readonly msal: ConfidentialClientApplication;
  private readonly tenantId: string;
  private tokenCache: CachedToken | null = null;

  constructor(config: GraphClientConfig) {
    this.tenantId = config.tenantId;

    const msalConfig: Configuration = {
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    };
    this.msal = new ConfidentialClientApplication(msalConfig);
  }

  // ---- Token acquisition --------------------------------------------------

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now) {
      return this.tokenCache.value;
    }

    const result = await this.msal.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });

    if (!result?.accessToken) {
      throw new Error("graph-client: MSAL returned no access token");
    }

    // Safety margin: treat the token as expired 60s before actual expiry
    const expiresAt = result.expiresOn
      ? result.expiresOn.getTime() - 60_000
      : now + 3_540_000; // fallback: 59 minutes

    this.tokenCache = { value: result.accessToken, expiresAt };
    return result.accessToken;
  }

  // ---- Graph API calls ----------------------------------------------------

  /**
   * Return all Entra security group Object IDs the user is a (direct or
   * transitive) member of. Follows `@odata.nextLink` pagination so large
   * group sets are fully resolved.
   *
   * The `oid` is validated as a UUID before being interpolated into the
   * Graph API URL. This is defense-in-depth: in production the value comes
   * from Envoy Gateway's `claimToHeaders` after JWT validation, but we
   * validate at the module boundary to:
   *   (1) close CodeQL `js/request-forgery` (CWE-918) without a dismissal,
   *   (2) act as a runtime tripwire if the gateway config ever regresses,
   *   (3) reject path-traversal payloads (e.g. `me/messages?$filter=...`)
   *       that would otherwise pivot the request to a different endpoint.
   */
  async getUserGroups(oid: string): Promise<string[]> {
    if (!OID_PATTERN.test(oid)) {
      throw new Error(
        `graph-client: invalid oid format (expected UUID, got ${oid.length}-char value starting with "${oid.slice(0, 8)}")`,
      );
    }

    const token = await this.getAccessToken();
    const groupIds: string[] = [];

    let url: string | undefined =
      `https://graph.microsoft.com/v1.0/users/${oid}/memberOf/microsoft.graph.group?$select=id&$top=100`;

    while (url) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "(unreadable)");
        throw new Error(
          `graph-client: GET memberOf for oid=${oid} returned ${response.status}: ${body}`,
        );
      }

      const data = (await response.json()) as {
        value?: Array<{ id: string }>;
        "@odata.nextLink"?: string;
      };

      for (const group of data.value ?? []) {
        if (group.id) groupIds.push(group.id);
      }

      url = data["@odata.nextLink"];
    }

    return groupIds;
  }
}
