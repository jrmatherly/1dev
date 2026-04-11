/**
 * Task 8.1 — teams-config unit tests
 *
 * Covers YAML parsing, getQualifyingTeams default-suppression rule, and
 * isUserAuthorized with empty vs non-empty required_groups.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadTeamsConfig,
  getTeamByGroupId,
  getQualifyingTeams,
  isUserAuthorized,
  type TeamsConfig,
} from "../../src/lib/teams-config.js";

let tmp: string;

const GROUP_A = "11111111-1111-1111-1111-111111111111";
const GROUP_B = "22222222-2222-2222-2222-222222222222";
const GROUP_DEFAULT = "33333333-3333-3333-3333-333333333333";
const GROUP_REQUIRED = "44444444-4444-4444-4444-444444444444";

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "teams-config-test-"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeTeamsFile(contents: string): string {
  const p = join(tmp, `teams-${Math.random().toString(36).slice(2)}.yaml`);
  writeFileSync(p, contents);
  return p;
}

// ---- YAML parsing ---------------------------------------------------------

describe("loadTeamsConfig — YAML parsing", () => {
  test("parses a minimal valid file", () => {
    const path = writeTeamsFile(`
teams:
  - entra_group_id: "${GROUP_A}"
    team_alias: "Team A"
    models: ["gpt-4o"]
    max_budget: 100
    budget_duration: "1mo"
    team_member_budget: 10
    litellm_role: "user"
`);
    const cfg = loadTeamsConfig(path);
    expect(cfg.teams).toHaveLength(1);
    expect(cfg.teams[0].entraGroupId).toBe(GROUP_A);
    expect(cfg.teams[0].teamAlias).toBe("Team A");
    expect(cfg.teams[0].models).toEqual(["gpt-4o"]);
    expect(cfg.teams[0].maxBudget).toBe(100);
    expect(cfg.teams[0].isDefault).toBe(false);
    expect(cfg.requiredGroups).toEqual([]);
  });

  test("parses required_groups", () => {
    const path = writeTeamsFile(`
teams:
  - entra_group_id: "${GROUP_A}"
    team_alias: "Team A"
    models: []
    max_budget: 0
    budget_duration: "1mo"
required_groups:
  - "${GROUP_REQUIRED}"
`);
    const cfg = loadTeamsConfig(path);
    expect(cfg.requiredGroups).toEqual([GROUP_REQUIRED]);
  });

  test("parses is_default: true", () => {
    const path = writeTeamsFile(`
teams:
  - entra_group_id: "${GROUP_DEFAULT}"
    team_alias: "Default Team"
    models: []
    max_budget: 0
    budget_duration: "1mo"
    is_default: true
`);
    const cfg = loadTeamsConfig(path);
    expect(cfg.teams[0].isDefault).toBe(true);
  });

  test("throws on missing teams: key", () => {
    const path = writeTeamsFile(`other_key: value`);
    expect(() => loadTeamsConfig(path)).toThrow(/teams.*array/);
  });

  test("throws on missing entra_group_id", () => {
    const path = writeTeamsFile(`
teams:
  - team_alias: "Nameless"
    models: []
    max_budget: 0
    budget_duration: "1mo"
`);
    expect(() => loadTeamsConfig(path)).toThrow(/entra_group_id/);
  });

  test("throws on nonexistent file", () => {
    expect(() => loadTeamsConfig("/nonexistent/path/teams.yaml")).toThrow(/cannot read/);
  });
});

// ---- getQualifyingTeams (default suppression) ------------------------------

describe("getQualifyingTeams — default suppression", () => {
  const cfg: TeamsConfig = {
    teams: [
      {
        entraGroupId: GROUP_A,
        teamAlias: "Team A",
        models: [],
        maxBudget: 0,
        budgetDuration: "1mo",
        teamMemberBudget: 0,
        litellmRole: "user",
        isDefault: false,
      },
      {
        entraGroupId: GROUP_DEFAULT,
        teamAlias: "Default Team",
        models: [],
        maxBudget: 0,
        budgetDuration: "1mo",
        teamMemberBudget: 0,
        litellmRole: "user",
        isDefault: true,
      },
    ],
    requiredGroups: [],
  };

  test("suppresses default team when user qualifies for a non-default team", () => {
    const result = getQualifyingTeams(cfg, [GROUP_A, GROUP_DEFAULT]);
    expect(result).toHaveLength(1);
    expect(result[0].entraGroupId).toBe(GROUP_A);
  });

  test("returns default team when user only qualifies for it", () => {
    const result = getQualifyingTeams(cfg, [GROUP_DEFAULT]);
    expect(result).toHaveLength(1);
    expect(result[0].entraGroupId).toBe(GROUP_DEFAULT);
  });

  test("returns empty when user qualifies for nothing", () => {
    const result = getQualifyingTeams(cfg, ["some-other-group"]);
    expect(result).toEqual([]);
  });

  test("returns all non-default teams when user qualifies for multiple", () => {
    const cfg2: TeamsConfig = {
      teams: [
        ...cfg.teams,
        {
          entraGroupId: GROUP_B,
          teamAlias: "Team B",
          models: [],
          maxBudget: 0,
          budgetDuration: "1mo",
          teamMemberBudget: 0,
          litellmRole: "user",
          isDefault: false,
        },
      ],
      requiredGroups: [],
    };
    const result = getQualifyingTeams(cfg2, [GROUP_A, GROUP_B, GROUP_DEFAULT]);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.entraGroupId).sort()).toEqual([GROUP_A, GROUP_B].sort());
  });
});

// ---- isUserAuthorized ------------------------------------------------------

describe("isUserAuthorized — required_groups gate", () => {
  test("returns true when required_groups is empty (open policy)", () => {
    const cfg: TeamsConfig = { teams: [], requiredGroups: [] };
    expect(isUserAuthorized(cfg, [])).toBe(true);
    expect(isUserAuthorized(cfg, ["any-group"])).toBe(true);
  });

  test("returns false when user is not in any required group", () => {
    const cfg: TeamsConfig = { teams: [], requiredGroups: [GROUP_REQUIRED] };
    expect(isUserAuthorized(cfg, [GROUP_A])).toBe(false);
  });

  test("returns true when user is in at least one required group", () => {
    const cfg: TeamsConfig = {
      teams: [],
      requiredGroups: [GROUP_REQUIRED, GROUP_A],
    };
    expect(isUserAuthorized(cfg, [GROUP_REQUIRED])).toBe(true);
    expect(isUserAuthorized(cfg, [GROUP_A, GROUP_B])).toBe(true);
  });
});

// ---- getTeamByGroupId ------------------------------------------------------

describe("getTeamByGroupId", () => {
  const cfg: TeamsConfig = {
    teams: [
      {
        entraGroupId: GROUP_A,
        teamAlias: "Team A",
        models: [],
        maxBudget: 0,
        budgetDuration: "1mo",
        teamMemberBudget: 0,
        litellmRole: "user",
        isDefault: false,
      },
    ],
    requiredGroups: [],
  };

  test("returns the matching team", () => {
    expect(getTeamByGroupId(cfg, GROUP_A)?.teamAlias).toBe("Team A");
  });

  test("returns undefined for unknown group id", () => {
    expect(getTeamByGroupId(cfg, "unknown")).toBeUndefined();
  });
});
