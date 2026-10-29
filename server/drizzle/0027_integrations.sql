CREATE TABLE `api_tokens` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`prefix` varchar(16) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_used_at` datetime(3),
	`revoked_at` datetime(3),
	CONSTRAINT `api_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_api_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` char(36) NOT NULL,
	`webhook_id` char(36) NOT NULL,
	`event` varchar(40) NOT NULL,
	`card_id` char(36),
	`status` varchar(16) NOT NULL,
	`http_status` int,
	`error` varchar(500),
	`attempts` int NOT NULL DEFAULT 1,
	`duration_ms` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`url` varchar(1000) NOT NULL,
	`events` json NOT NULL,
	`secret` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `webhooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_api_tokens_org` ON `api_tokens` (`org_id`);--> statement-breakpoint
CREATE INDEX `idx_wh_deliveries` ON `webhook_deliveries` (`webhook_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_webhooks_pipe` ON `webhooks` (`pipe_id`);