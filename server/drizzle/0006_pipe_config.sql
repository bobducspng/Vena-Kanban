CREATE TABLE `phase_assignees` (
	`phase_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	CONSTRAINT `phase_assignees_phase_id_user_id_pk` PRIMARY KEY(`phase_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `pipes` ADD `icon` varchar(16);--> statement-breakpoint
ALTER TABLE `pipes` ADD `color` varchar(16);--> statement-breakpoint
ALTER TABLE `pipes` ADD `noun` varchar(64);--> statement-breakpoint
ALTER TABLE `pipes` ADD `create_button_label` varchar(64);--> statement-breakpoint
ALTER TABLE `pipes` ADD `title_field_id` char(36);--> statement-breakpoint
ALTER TABLE `pipes` ADD `subtitle_field_ids` json;--> statement-breakpoint
ALTER TABLE `pipes` ADD `deleted_at` datetime(3);