import { readFileSync } from "node:fs";
import { parse } from "yaml";

export interface TeamConfig {
  /** Entra security group Object ID (GUID) — used as LiteLLM team_id */
  entraGroupId: string;
  teamAlias: string;
  models: string[];
  maxBudget: number;
  budgetDuration: string;
  /** Per-member cap within the team. 0 = unlimited. */
  teamMemberBudget: number;
  litellmRole: string;
  /**
   * When true, this team is suppressed from the qualifying set whenever the
   * user also qualifies for at least one non-default team.
   */
  isDefault: boolean;
}

export interface TeamsConfig {
  teams: TeamConfig[];
  /**
   * Optional authorization gate. When non-empty, a user must be a member of
   * at least one of these groups or POST /api/provision returns 403.
   */
  requiredGroups: string[];
}

// ---- YAML file shape (snake_case) ----------------------------------------

interface RawTeamEntry {
  entra_group_id: string;
  team_alias: string;
  models: string[];
  max_budget: number;
  budget_duration: string;
  team_member_budget?: number;
  litellm_role?: string;
  is_default?: boolean;
}

interface RawTeamsFile {
  teams: RawTeamEntry[];
  required_groups?: string[];
}

// ---- Loader ----------------------------------------------------------------

/**
 * Load and validate a `teams.yaml` file from `filePath`.
 * Throws with a descriptive message if the file is missing or malformed.
 */
export function loadTeamsConfig(filePath: string): TeamsConfig {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `teams-config: cannot read ${filePath}: ${(err as Error).message}`,
    );
  }

  let parsed: RawTeamsFile;
  try {
    parsed = parse(raw) as RawTeamsFile;
  } catch (err) {
    throw new Error(
      `teams-config: YAML parse error in ${filePath}: ${(err as Error).message}`,
    );
  }

  if (!parsed?.teams || !Array.isArray(parsed.teams)) {
    throw new Error(
      `teams-config: ${filePath} must have a top-level "teams:" array`,
    );
  }

  const teams: TeamConfig[] = parsed.teams.map((entry, i) => {
    if (!entry.entra_group_id) {
      throw new Error(
        `teams-config: teams[${i}] is missing required field "entra_group_id"`,
      );
    }
    if (!entry.team_alias) {
      throw new Error(
        `teams-config: teams[${i}] is missing required field "team_alias"`,
      );
    }
    return {
      entraGroupId: entry.entra_group_id,
      teamAlias: entry.team_alias,
      models: entry.models ?? [],
      maxBudget: entry.max_budget ?? 0,
      budgetDuration: entry.budget_duration ?? "1mo",
      teamMemberBudget: entry.team_member_budget ?? 0,
      litellmRole: entry.litellm_role ?? "user",
      isDefault: entry.is_default ?? false,
    };
  });

  return {
    teams,
    requiredGroups: parsed.required_groups ?? [],
  };
}

// ---- Pure resolution helpers -----------------------------------------------

/**
 * Return the `TeamConfig` whose `entraGroupId` matches `groupId`, or
 * `undefined` if not found.
 */
export function getTeamByGroupId(
  config: TeamsConfig,
  groupId: string,
): TeamConfig | undefined {
  return config.teams.find((t) => t.entraGroupId === groupId);
}

/**
 * Resolve which teams the user qualifies for given their Entra group IDs.
 *
 * Default-suppression rule: if the user qualifies for at least one
 * non-default team, all teams with `isDefault: true` are removed from the
 * result. This allows a "catch-all" default team for users who don't belong
 * to any product team while keeping default teams out of the way for users
 * who do.
 */
export function getQualifyingTeams(
  config: TeamsConfig,
  groupIds: string[],
): TeamConfig[] {
  const groupSet = new Set(groupIds);
  const matching = config.teams.filter((t) => groupSet.has(t.entraGroupId));

  const hasNonDefault = matching.some((t) => !t.isDefault);
  if (hasNonDefault) {
    return matching.filter((t) => !t.isDefault);
  }
  return matching;
}

/**
 * Return `true` if the user passes the `required_groups` authorization gate.
 *
 * When `required_groups` is empty, all users are authorized (open policy).
 * When non-empty, the user must be a member of at least one listed group.
 */
export function isUserAuthorized(
  config: TeamsConfig,
  groupIds: string[],
): boolean {
  if (config.requiredGroups.length === 0) return true;
  const groupSet = new Set(groupIds);
  return config.requiredGroups.some((g) => groupSet.has(g));
}
