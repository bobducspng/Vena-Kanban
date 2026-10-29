CREATE TABLE `audit_log` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`user_id` char(36),
	`action` varchar(128) NOT NULL,
	`input` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `pipes` ADD `folder` varchar(100);--> statement-breakpoint
CREATE INDEX `idx_audit_org` ON `audit_log` (`org_id`,`created_at`);