CREATE TABLE `notifications` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`type` varchar(32) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text,
	`card_id` char(36),
	`pipe_id` char(36),
	`link` varchar(255),
	`read_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_notif_user` ON `notifications` (`user_id`,`created_at`);