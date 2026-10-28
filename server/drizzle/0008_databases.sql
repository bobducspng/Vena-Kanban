ALTER TABLE `data_tables` ADD `description` text;--> statement-breakpoint
ALTER TABLE `data_tables` ADD `icon` varchar(16);--> statement-breakpoint
ALTER TABLE `data_tables` ADD `color` varchar(16);--> statement-breakpoint
ALTER TABLE `data_tables` ADD `title_field_id` char(36);--> statement-breakpoint
ALTER TABLE `data_tables` ADD `summary_field_ids` json;--> statement-breakpoint
ALTER TABLE `data_tables` ADD `deleted_at` datetime(3);--> statement-breakpoint
ALTER TABLE `table_fields` ADD `required` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `table_fields` ADD `description` text;--> statement-breakpoint
ALTER TABLE `table_fields` ADD `help` varchar(500);--> statement-breakpoint
ALTER TABLE `table_fields` ADD `is_unique` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `table_fields` ADD `validation_regex` varchar(500);--> statement-breakpoint
ALTER TABLE `table_fields` ADD `archived_at` datetime(3);