CREATE TABLE `field_conditions` (
	`id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`phase_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`groups` json NOT NULL,
	`on_true` json NOT NULL,
	`on_false` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `field_conditions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_conditions_phase` ON `field_conditions` (`phase_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_conditions_pipe` ON `field_conditions` (`pipe_id`);