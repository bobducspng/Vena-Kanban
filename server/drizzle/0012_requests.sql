CREATE TABLE `requests` (
	`id` char(36) NOT NULL,
	`card_id` char(36) NOT NULL,
	`form_id` char(36),
	`email` varchar(320),
	`access_token` char(43) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_requests_token` UNIQUE(`access_token`)
);
--> statement-breakpoint
CREATE INDEX `idx_requests_card` ON `requests` (`card_id`);--> statement-breakpoint
CREATE INDEX `idx_requests_email` ON `requests` (`email`);