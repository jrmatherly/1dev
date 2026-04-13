PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_anthropic_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_type` text DEFAULT 'claude-subscription' NOT NULL,
	`routing_mode` text DEFAULT 'litellm' NOT NULL,
	`email` text,
	`display_name` text,
	`oauth_token` text,
	`api_key` text,
	`virtual_key` text,
	`model_sonnet` text,
	`model_haiku` text,
	`model_opus` text,
	`connected_at` integer,
	`last_used_at` integer,
	`desktop_user_id` text
);
--> statement-breakpoint
-- Copy existing rows from the old table. New columns receive their DEFAULT values
-- (account_type='claude-subscription', routing_mode='litellm'); credential/model
-- columns that the old schema did not have stay NULL until re-onboarded.
INSERT INTO `__new_anthropic_accounts`("id", "email", "display_name", "oauth_token", "connected_at", "last_used_at", "desktop_user_id") SELECT "id", "email", "display_name", "oauth_token", "connected_at", "last_used_at", "desktop_user_id" FROM `anthropic_accounts`;--> statement-breakpoint
DROP TABLE `anthropic_accounts`;--> statement-breakpoint
ALTER TABLE `__new_anthropic_accounts` RENAME TO `anthropic_accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
