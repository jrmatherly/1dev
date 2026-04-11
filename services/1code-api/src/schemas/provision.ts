import { z } from "zod";

export const UserSummary = z.object({
  user_id: z.string().uuid(),
  oid: z.string(),
  email: z.string().email(),
  is_active: z.boolean(),
  teams: z.array(
    z.object({
      team_id: z.string(),
      team_alias: z.string(),
    }),
  ),
  active_key_count: z.number().int().nonnegative(),
});
export type UserSummaryType = z.infer<typeof UserSummary>;

export const TeamSummary = z.object({
  team_id: z.string(),
  team_alias: z.string(),
});
export type TeamSummaryType = z.infer<typeof TeamSummary>;

export const KeyGeneratedSummary = z.object({
  key_id: z.string().uuid(),
  /** Raw key — returned once at provision time, never stored */
  key: z.string(),
  key_alias: z.string(),
  team_alias: z.string(),
  portal_expires_at: z.date(),
});

export const ProvisionStatusResponse = z.object({
  user_id: z.string().uuid(),
  oid: z.string(),
  email: z.string().email(),
  is_active: z.boolean(),
  teams: z.array(TeamSummary),
  active_key_count: z.number().int().nonnegative(),
});
export type ProvisionStatusResponseType = z.infer<typeof ProvisionStatusResponse>;

export const ProvisionResponse = z.object({
  user_id: z.string().uuid(),
  litellm_user_id: z.string(),
  teams_provisioned: z.array(TeamSummary),
  keys_generated: z.array(KeyGeneratedSummary),
});
export type ProvisionResponseType = z.infer<typeof ProvisionResponse>;
