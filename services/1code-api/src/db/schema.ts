import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * Per Decision 2 in
 * openspec/changes/add-1code-api-litellm-provisioning/design.md:
 *
 * `users.id` is an internal UUID primary key (Apollos-faithful).
 * `users.oid` stays as a unique Entra object ID column — still a valid
 * lookup key for the existing `PATCH /api/user/profile` handler, which
 * uses `.onConflictDoUpdate({ target: users.oid, ... })`.
 *
 * All new provisioning columns are nullable or have defaults, so the
 * migration that introduces them is backward-compatible for rolling
 * deploys against a populated table.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    oid: text("oid").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull().default(""),
    // Provisioning columns (Decision 2):
    litellmUserId: text("litellm_user_id"),
    isActive: boolean("is_active").notNull().default(true),
    defaultKeyDurationDays: integer("default_key_duration_days")
      .notNull()
      .default(90),
    deprovisionedAt: timestamp("deprovisioned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    oidUnique: uniqueIndex("users_oid_unique").on(table.oid),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * Per Decision 9 in
 * openspec/changes/add-1code-api-litellm-provisioning/design.md:
 *
 * Five-state key status. Persisted column values are only ever
 * `"active" | "revoked" | "rotated"`. The values `"expired"` and
 * `"expiring_soon"` are derived at read time from
 * `(persisted_status, portal_expires_at, now)` and NEVER written to
 * the DB — they appear in the pgEnum only so the Zod response schema
 * can reuse the same type.
 */
export const keyStatus = pgEnum("key_status", [
  "active",
  "revoked",
  "rotated",
  "expired",
  "expiring_soon",
]);

/**
 * Runtime guard: the subset of `KeyStatus` that may be persisted.
 * Import this as the type annotation on every DB write path so
 * `"expired" | "expiring_soon"` is a compile error at the write site.
 */
export type KeyStatus = (typeof keyStatus.enumValues)[number];
export type PersistedKeyStatus = "active" | "revoked" | "rotated";

export const provisionedKeys = pgTable("provisioned_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  litellmKeyId: text("litellm_key_id").unique(),
  litellmKeyAlias: text("litellm_key_alias").notNull(),
  keyPreview: text("key_preview"),
  teamId: text("team_id").notNull(),
  teamAlias: text("team_alias").notNull(),
  status: keyStatus("status").notNull().default("active"),
  portalExpiresAt: timestamp("portal_expires_at", {
    withTimezone: true,
  }).notNull(),
  rotatedFromId: uuid("rotated_from_id").references(
    (): AnyPgColumn => provisionedKeys.id,
    { onDelete: "set null" },
  ),
  lastSpend: numeric("last_spend", { precision: 12, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export type ProvisionedKey = typeof provisionedKeys.$inferSelect;
export type NewProvisionedKey = typeof provisionedKeys.$inferInsert;

export const userTeamMemberships = pgTable(
  "user_team_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull(),
    teamAlias: text("team_alias").notNull(),
    entraGroupId: text("entra_group_id").notNull(),
    litellmRole: text("litellm_role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueUserTeam: uniqueIndex("uq_user_team").on(table.userId, table.teamId),
  }),
);

export type UserTeamMembership = typeof userTeamMemberships.$inferSelect;
export type NewUserTeamMembership = typeof userTeamMemberships.$inferInsert;

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorEmail: text("actor_email").notNull(),
  actorEntraOid: text("actor_entra_oid").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
