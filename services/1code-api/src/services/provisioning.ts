import { eq, and, inArray } from "drizzle-orm";
import {
  users,
  provisionedKeys,
  userTeamMemberships,
  type User,
  type PersistedKeyStatus,
} from "../db/schema.js";
import { getDb } from "../db/connection.js";
import { AUDIT_ACTIONS, logAction } from "../lib/audit.js";
import { slugify } from "../lib/slugify.js";
import type { LiteLLMClient } from "../lib/litellm-client.js";
import type { GraphClient } from "../lib/graph-client.js";
import type { TeamsConfig, TeamConfig } from "../lib/teams-config.js";
import {
  isUserAuthorized,
  getQualifyingTeams,
} from "../lib/teams-config.js";

export interface RequestUser {
  oid: string;
  email: string;
  name: string;
}

export interface ProvisionStatusResult {
  user_id: string;
  oid: string;
  email: string;
  is_active: boolean;
  teams: Array<{ team_id: string; team_alias: string }>;
  active_key_count: number;
}

export interface ProvisionResult {
  user_id: string;
  litellm_user_id: string;
  teams_provisioned: Array<{ team_id: string; team_alias: string }>;
  keys_generated: Array<{
    key_id: string;
    key: string;
    key_alias: string;
    team_alias: string;
    portal_expires_at: Date;
  }>;
}

// ---- Key preview helper ---------------------------------------------------

function makeKeyPreview(rawKey: string): string {
  if (rawKey.length <= 8) return rawKey;
  return `${rawKey.slice(0, 4)}...${rawKey.slice(-4)}`;
}

// ---- Alias collision guard ------------------------------------------------

async function buildKeyAliasWithCollisionGuard(
  userEmail: string,
  teamAlias: string,
  existingAliases: Set<string>,
): Promise<string> {
  const base = `${slugify(userEmail)}-${slugify(teamAlias)}`;
  let alias = base;
  let suffix = 1;
  while (existingAliases.has(alias)) {
    alias = `${base}-${suffix}`;
    suffix++;
  }
  return alias;
}

// ---- getProvisionStatus --------------------------------------------------

export async function getProvisionStatus(
  requestUser: RequestUser,
): Promise<ProvisionStatusResult | null> {
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.oid, requestUser.oid))
    .limit(1);

  if (!user) return null;

  const memberships = await db
    .select({ teamId: userTeamMemberships.teamId, teamAlias: userTeamMemberships.teamAlias })
    .from(userTeamMemberships)
    .where(eq(userTeamMemberships.userId, user.id));

  const activeKeys = await db
    .select({ id: provisionedKeys.id })
    .from(provisionedKeys)
    .where(
      and(
        eq(provisionedKeys.userId, user.id),
        eq(provisionedKeys.status, "active"),
      ),
    );

  return {
    user_id: user.id,
    oid: user.oid,
    email: user.email,
    is_active: user.isActive,
    teams: memberships,
    active_key_count: activeKeys.length,
  };
}

// ---- provisionUser -------------------------------------------------------

export async function provisionUser(
  requestUser: RequestUser,
  litellm: LiteLLMClient,
  graph: GraphClient,
  teamsConfig: TeamsConfig,
): Promise<ProvisionResult> {
  const db = getDb();

  // ---- Phase 1: Pre-flight reads (no writes) --------------------------------

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.oid, requestUser.oid))
    .limit(1);

  if (existingUser && !existingUser.isActive) {
    const err = new Error("User was deprovisioned; contact admin to re-enable access") as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const groupIds = await graph.getUserGroups(requestUser.oid);

  if (!isUserAuthorized(teamsConfig, groupIds)) {
    const err = new Error("User is not authorized for access (not a member of any required group)") as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  const qualifyingTeams: TeamConfig[] = getQualifyingTeams(teamsConfig, groupIds);

  let existingMemberships = new Set<string>();
  let existingActiveKeysByTeam = new Map<string, string>();
  const existingAliases = new Set<string>();

  if (existingUser) {
    const memberships = await db
      .select({ teamId: userTeamMemberships.teamId })
      .from(userTeamMemberships)
      .where(eq(userTeamMemberships.userId, existingUser.id));
    existingMemberships = new Set(memberships.map((m) => m.teamId));

    const activeKeys = await db
      .select({ id: provisionedKeys.id, teamId: provisionedKeys.teamId, alias: provisionedKeys.litellmKeyAlias })
      .from(provisionedKeys)
      .where(
        and(
          eq(provisionedKeys.userId, existingUser.id),
          eq(provisionedKeys.status, "active"),
        ),
      );
    existingActiveKeysByTeam = new Map(activeKeys.map((k) => [k.teamId, k.id]));
    for (const k of activeKeys) existingAliases.add(k.alias);
  }

  // ---- Phase 2: Execution (single transaction, interleaved external calls) --

  return db.transaction(async (tx) => {
    // 2a. Upsert user row
    let user: User;
    if (existingUser) {
      user = existingUser;
    } else {
      const [inserted] = await tx
        .insert(users)
        .values({
          oid: requestUser.oid,
          email: requestUser.email,
          displayName: requestUser.name,
          litellmUserId: requestUser.email,
          isActive: true,
        })
        .returning();
      user = inserted;
    }

    // 2b. Ensure LiteLLM user exists
    const ltUser = await litellm.getUser(user.litellmUserId ?? user.email);
    if (!ltUser) {
      await litellm.createUser({
        user_id: user.litellmUserId ?? user.email,
        user_email: user.email,
        user_alias: user.displayName,
      });
      await logAction({
        tx: tx as Parameters<typeof logAction>[0]["tx"],
        actorEmail: user.email,
        actorEntraOid: user.oid,
        action: AUDIT_ACTIONS.ACTION_USER_PROVISIONED,
        targetType: "user",
        targetId: user.id,
      });
    }

    const teamsProvisioned: Array<{ team_id: string; team_alias: string }> = [];
    const keysGenerated: Array<{
      key_id: string;
      key: string;
      key_alias: string;
      team_alias: string;
      portal_expires_at: Date;
    }> = [];

    // 2c. For each qualifying team
    for (const team of qualifyingTeams) {
      // LiteLLM team (idempotent)
      const ltTeam = await litellm.getTeam(team.entraGroupId);
      if (!ltTeam) {
        await litellm.createTeam({
          team_id: team.entraGroupId,
          team_alias: team.teamAlias,
          models: team.models,
          max_budget: team.maxBudget,
          budget_duration: team.budgetDuration,
          max_budget_in_team: team.teamMemberBudget > 0 ? team.teamMemberBudget : null,
        });
        await logAction({
          tx: tx as Parameters<typeof logAction>[0]["tx"],
          actorEmail: user.email,
          actorEntraOid: user.oid,
          action: AUDIT_ACTIONS.ACTION_TEAM_SYNCED,
          targetType: "team",
          targetId: team.entraGroupId,
        });
      }
      teamsProvisioned.push({ team_id: team.entraGroupId, team_alias: team.teamAlias });

      // Membership (idempotent via pre-flight set)
      if (!existingMemberships.has(team.entraGroupId)) {
        await litellm.addTeamMember({
          team_id: team.entraGroupId,
          member: [{ user_id: user.litellmUserId ?? user.email, role: team.litellmRole }],
        });
        await tx.insert(userTeamMemberships).values({
          userId: user.id,
          teamId: team.entraGroupId,
          teamAlias: team.teamAlias,
          entraGroupId: team.entraGroupId,
          litellmRole: team.litellmRole,
        });
        await logAction({
          tx: tx as Parameters<typeof logAction>[0]["tx"],
          actorEmail: user.email,
          actorEntraOid: user.oid,
          action: AUDIT_ACTIONS.ACTION_MEMBERSHIP_ADDED,
          targetType: "membership",
          targetId: team.entraGroupId,
        });
      }

      // Initial key (only if no active key for this team)
      if (!existingActiveKeysByTeam.has(team.entraGroupId)) {
        const keyAlias = await buildKeyAliasWithCollisionGuard(
          user.email,
          team.teamAlias,
          existingAliases,
        );
        existingAliases.add(keyAlias);

        const expiresAt = new Date(
          Date.now() + user.defaultKeyDurationDays * 24 * 60 * 60 * 1000,
        );

        let keyResp;
        try {
          keyResp = await litellm.generateKey({
            user_id: user.litellmUserId ?? user.email,
            team_id: team.entraGroupId,
            models: team.models,
            key_alias: keyAlias,
            duration: `${user.defaultKeyDurationDays}d`,
          });
        } catch (err) {
          throw err;
        }

        const rawKey = keyResp.key;

        let inserted;
        try {
          [inserted] = await tx
            .insert(provisionedKeys)
            .values({
              userId: user.id,
              litellmKeyId: keyResp.token_id ?? keyResp.key_name ?? rawKey,
              litellmKeyAlias: keyAlias,
              keyPreview: makeKeyPreview(rawKey),
              teamId: team.entraGroupId,
              teamAlias: team.teamAlias,
              status: "active" as PersistedKeyStatus,
              portalExpiresAt: expiresAt,
            })
            .returning();
        } catch (insertErr) {
          // Best-effort compensating delete to prevent orphaned LiteLLM keys
          await litellm.deleteKey(rawKey).catch((delErr: unknown) => {
            console.error(
              { err: delErr, orphaned_key_alias: keyAlias },
              "provisioning: failed to delete orphaned LiteLLM key after DB insert failure",
            );
          });
          await logAction({
            tx: tx as Parameters<typeof logAction>[0]["tx"],
            actorEmail: user.email,
            actorEntraOid: user.oid,
            action: AUDIT_ACTIONS.ACTION_KEY_GENERATION_ORPHANED,
            targetType: "key",
            targetId: keyAlias,
            details: { team_id: team.entraGroupId, key_alias: keyAlias },
          });
          throw insertErr;
        }

        keysGenerated.push({
          key_id: inserted.id,
          key: rawKey,
          key_alias: keyAlias,
          team_alias: team.teamAlias,
          portal_expires_at: expiresAt,
        });

        await logAction({
          tx: tx as Parameters<typeof logAction>[0]["tx"],
          actorEmail: user.email,
          actorEntraOid: user.oid,
          action: AUDIT_ACTIONS.ACTION_KEY_GENERATED,
          targetType: "key",
          targetId: inserted.id,
          details: { team_id: team.entraGroupId },
        });
      }
    }

    return {
      user_id: user.id,
      litellm_user_id: user.litellmUserId ?? user.email,
      teams_provisioned: teamsProvisioned,
      keys_generated: keysGenerated,
    };
  });
}
