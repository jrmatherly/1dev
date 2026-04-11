CREATE TYPE "public"."key_status" AS ENUM('active', 'revoked', 'rotated', 'expired', 'expiring_soon');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_email" text NOT NULL,
	"actor_entra_oid" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provisioned_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"litellm_key_id" text,
	"litellm_key_alias" text NOT NULL,
	"key_preview" text,
	"team_id" text NOT NULL,
	"team_alias" text NOT NULL,
	"status" "key_status" DEFAULT 'active' NOT NULL,
	"portal_expires_at" timestamp with time zone NOT NULL,
	"rotated_from_id" uuid,
	"last_spend" numeric(12, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "provisioned_keys_litellm_key_id_unique" UNIQUE("litellm_key_id")
);
--> statement-breakpoint
CREATE TABLE "user_team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"team_alias" text NOT NULL,
	"entra_group_id" text NOT NULL,
	"litellm_role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
/*
 * Two-step users PK swap per design.md Decision 2.
 *
 * The existing `users_pkey` constraint is on the `oid` text column.
 * Drizzle 0.31 cannot auto-generate the DROP CONSTRAINT statement
 * because it doesn't know the PK constraint name at generation time,
 * so this migration hand-writes the swap:
 *
 *   1. Add `id` column as a plain uuid with default gen_random_uuid()
 *      (populates automatically for any existing rows).
 *   2. Drop the old `users_pkey` constraint on `oid`.
 *   3. Promote `id` to PRIMARY KEY.
 *   4. Add the remaining provisioning columns (all backward-compatible
 *      with defaults or nullable).
 *   5. Create the `users_oid_unique` index so `oid` is still a valid
 *      lookup key for `PATCH /api/user/profile`.
 *
 * This ordering is backward-compatible for rolling deploys: existing
 * rows get `id` populated with random uuids, the old PK is dropped
 * only after `id` exists, and the `oid` unique index is created last.
 */
ALTER TABLE "users" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_pkey";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "litellm_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_key_duration_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deprovisioned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provisioned_keys" ADD CONSTRAINT "provisioned_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioned_keys" ADD CONSTRAINT "provisioned_keys_rotated_from_id_provisioned_keys_id_fk" FOREIGN KEY ("rotated_from_id") REFERENCES "public"."provisioned_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_team_memberships" ADD CONSTRAINT "user_team_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_team" ON "user_team_memberships" USING btree ("user_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_oid_unique" ON "users" USING btree ("oid");
