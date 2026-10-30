CREATE TABLE `inbox_state` (
	`org_id` char(36) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`uid_validity` bigint,
	`last_uid` bigint,
	`last_check_at` datetime(3),
	`last_error` text,
	`processed` int NOT NULL DEFAULT 0,
	CONSTRAINT `inbox_state_org_id` PRIMARY KEY(`org_id`)
);
--> statement-breakpoint
ALTER TABLE `card_emails` ADD `direction` varchar(8) DEFAULT 'out' NOT NULL;--> statement-breakpoint
ALTER TABLE `card_emails` ADD `from_address` varchar(320);--> statement-breakpoint
ALTER TABLE `card_emails` ADD `message_id` varchar(255);--> statement-breakpoint
ALTER TABLE `cards` ADD `inbox_token` varchar(16);--> statement-breakpoint
ALTER TABLE `pipes` ADD `inbox_token` varchar(16);--> statement-breakpoint
ALTER TABLE `pipes` ADD `inbox_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pipes` ADD `inbox_from_field_id` char(36);--> statement-breakpoint
ALTER TABLE `pipes` ADD `inbox_body_field_id` char(36);--> statement-breakpoint
ALTER TABLE `pipes` ADD `inbox_allowed_domains` varchar(500);--> statement-breakpoint
CREATE INDEX `idx_cardemails_msgid` ON `card_emails` (`message_id`);