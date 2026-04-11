export interface LiteLLMClientConfig {
  baseUrl: string;
  masterKey: string;
}

// ---- Request/Response shapes -----------------------------------------------

export interface CreateTeamRequest {
  team_id: string;
  team_alias: string;
  models: string[];
  max_budget?: number | null;
  budget_duration?: string;
  /** Per-member budget cap; omit or null for unlimited */
  max_budget_in_team?: number | null;
}

export interface TeamInfo {
  team_id: string;
  team_alias?: string;
  models?: string[];
}

export interface CreateUserRequest {
  user_id: string;
  user_email: string;
  user_alias?: string;
}

export interface UserInfo {
  user_id: string;
  user_email?: string;
  user_alias?: string;
}

export interface AddTeamMemberRequest {
  team_id: string;
  member: Array<{ user_id: string; role: string }>;
}

export interface GenerateKeyRequest {
  user_id: string;
  team_id: string;
  models?: string[];
  key_alias?: string;
  duration?: string;
}

export interface GenerateKeyResponse {
  key: string;
  key_name?: string;
  expires?: string | null;
  key_alias?: string;
  token_id?: string;
}

// ---- Client ----------------------------------------------------------------

/**
 * Minimal LiteLLM admin API client covering the 8 methods required by the
 * provisioning flow. All requests authenticate via the LiteLLM master key
 * in the `Authorization: Bearer` header.
 *
 * On non-2xx responses the method logs the response body and throws an Error
 * with the status code so callers can distinguish 404 from 5xx.
 */
export class LiteLLMClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: LiteLLMClientConfig) {
    // Normalise trailing slash
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authHeader = `Bearer ${config.masterKey}`;
  }

  // ---- Internal helpers ---------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "(unreadable)");
      console.error(
        `litellm-client: ${method} ${path} → ${response.status}: ${responseBody}`,
      );
      const err = new Error(
        `LiteLLM ${method} ${path} failed with status ${response.status}`,
      ) as Error & { status: number };
      err.status = response.status;
      throw err;
    }

    return response.json() as Promise<T>;
  }

  // ---- Health -------------------------------------------------------------

  async checkHealth(): Promise<{ status: string }> {
    return this.request<{ status: string }>("GET", "/health");
  }

  // ---- Team ---------------------------------------------------------------

  /**
   * Get team info. Returns `null` when LiteLLM returns 404 (team does not
   * exist yet — caller should create it).
   */
  async getTeam(teamId: string): Promise<TeamInfo | null> {
    try {
      return await this.request<TeamInfo>("GET", `/team/info?team_id=${encodeURIComponent(teamId)}`);
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  }

  async createTeam(req: CreateTeamRequest): Promise<TeamInfo> {
    return this.request<TeamInfo>("POST", "/team/new", req);
  }

  // ---- User ---------------------------------------------------------------

  /**
   * Get user info. Returns `null` when LiteLLM returns 404 (user does not
   * exist yet — caller should create it).
   */
  async getUser(userId: string): Promise<UserInfo | null> {
    try {
      return await this.request<UserInfo>(
        "GET",
        `/user/info?user_id=${encodeURIComponent(userId)}`,
      );
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  }

  async createUser(req: CreateUserRequest): Promise<UserInfo> {
    return this.request<UserInfo>("POST", "/user/new", req);
  }

  // ---- Team membership ----------------------------------------------------

  async addTeamMember(req: AddTeamMemberRequest): Promise<unknown> {
    return this.request("POST", "/team/member_add", req);
  }

  // ---- Keys ---------------------------------------------------------------

  async generateKey(req: GenerateKeyRequest): Promise<GenerateKeyResponse> {
    return this.request<GenerateKeyResponse>("POST", "/key/generate", req);
  }

  /**
   * Delete a key by its token value (the `sk-...` string).
   * Best-effort — callers should log but not fail on errors from this method.
   */
  async deleteKey(token: string): Promise<void> {
    await this.request("POST", "/key/delete", { keys: [token] });
  }
}
