import { z } from "zod";

const KEY_STATUS_VALUES = [
  "active",
  "expiring_soon",
  "expired",
  "revoked",
  "rotated",
] as const;

export const KeyListItem = z.object({
  key_id: z.string().uuid(),
  key_preview: z.string().nullable(),
  key_alias: z.string(),
  team_id: z.string(),
  team_alias: z.string(),
  status: z.enum(KEY_STATUS_VALUES),
  days_until_expiry: z.number().int(),
  portal_expires_at: z.date(),
  rotated_from_id: z.string().uuid().nullable(),
  created_at: z.date(),
});
export type KeyListItemType = z.infer<typeof KeyListItem>;

export const KeyListResponse = z.object({
  active: z.array(KeyListItem),
  revoked: z.array(KeyListItem),
});
export type KeyListResponseType = z.infer<typeof KeyListResponse>;

export const KeyCreateRequest = z.object({
  team_id: z.string().min(1),
  /** Number of days until the key expires — defaults to user's defaultKeyDurationDays */
  duration_days: z.number().int().positive().optional(),
});
export type KeyCreateRequestType = z.infer<typeof KeyCreateRequest>;

export const KeyCreateResponse = z.object({
  key_id: z.string().uuid(),
  /** Raw key — returned once, never stored after this response */
  key: z.string(),
  key_alias: z.string(),
  team_alias: z.string(),
  portal_expires_at: z.date(),
});
export type KeyCreateResponseType = z.infer<typeof KeyCreateResponse>;

export const KeyRotateResponse = z.object({
  new_key_id: z.string().uuid(),
  /** Raw key for the rotated replacement — returned once */
  key: z.string(),
  key_alias: z.string(),
  old_key_id: z.string().uuid(),
});
export type KeyRotateResponseType = z.infer<typeof KeyRotateResponse>;

export const KeyRevokeResponse = z.object({
  revoked: z.literal(true),
  key_id: z.string().uuid(),
});
export type KeyRevokeResponseType = z.infer<typeof KeyRevokeResponse>;
