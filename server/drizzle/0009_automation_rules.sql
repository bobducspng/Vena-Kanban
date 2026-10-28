CREATE TABLE `automation_logs` (
	`id` char(36) NOT NULL,
	`rule_id` char(36) NOT NULL,
	`card_id` char(36),
	`status` varchar(16) NOT NULL,
	`message` text,
	`duration_ms` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `automation_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automation_rules` (
	`id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`trigger` json NOT NULL,
	`groups` json NOT NULL,
	`actions` json NOT NULL,
	`state` json,
	`last_run_at` datetime(3),
	`last_status` varchar(16),
	`last_error` text,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `automation_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_autolog_rule` ON `automation_logs` (`rule_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_autolog_card` ON `automation_logs` (`card_id`);--> statement-breakpoint
CREATE INDEX `idx_rules_pipe` ON `automation_rules` (`pipe_id`,`active`);