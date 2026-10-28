CREATE TABLE `checklist_items` (
	`id` char(36) NOT NULL,
	`card_id` char(36) NOT NULL,
	`text` varchar(500) NOT NULL,
	`done` boolean NOT NULL DEFAULT false,
	`position` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `checklist_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD `mime_type` varchar(255);--> statement-breakpoint
ALTER TABLE `cards` ADD `deleted_at` datetime(3);--> statement-breakpoint
ALTER TABLE `cards` ADD `deleted_by` char(36);--> statement-breakpoint
CREATE INDEX `idx_checklist_card` ON `checklist_items` (`card_id`,`position`);