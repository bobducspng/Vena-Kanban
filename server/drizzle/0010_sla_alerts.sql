CREATE TABLE `business_calendars` (
	`org_id` char(36) NOT NULL,
	`weekdays` json NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`holidays` json NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `business_calendars_org_id` PRIMARY KEY(`org_id`)
);
--> statement-breakpoint
CREATE TABLE `card_phase_history` (
	`id` char(36) NOT NULL,
	`card_id` char(36) NOT NULL,
	`phase_id` char(36) NOT NULL,
	`entered_at` datetime(3) NOT NULL,
	`left_at` datetime(3),
	`became_late` boolean NOT NULL DEFAULT false,
	CONSTRAINT `card_phase_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cards` ADD `phase_entered_at` datetime(3);--> statement-breakpoint
ALTER TABLE `cards` ADD `late_at` datetime(3);--> statement-breakpoint
ALTER TABLE `cards` ADD `expired_at` datetime(3);--> statement-breakpoint
ALTER TABLE `cards` ADD `overdue_at` datetime(3);--> statement-breakpoint
ALTER TABLE `phases` ADD `sla_minutes` int;--> statement-breakpoint
ALTER TABLE `pipes` ADD `expiration_minutes` int;--> statement-breakpoint
ALTER TABLE `pipes` ADD `business_hours_only` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_phasehist_card` ON `card_phase_history` (`card_id`,`entered_at`);--> statement-breakpoint
CREATE INDEX `idx_phasehist_phase` ON `card_phase_history` (`phase_id`);