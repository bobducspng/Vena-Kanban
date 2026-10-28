ALTER TABLE `fields` ADD `description` text;--> statement-breakpoint
ALTER TABLE `fields` ADD `help` varchar(500);--> statement-breakpoint
ALTER TABLE `fields` ADD `editable_other_phases` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `fields` ADD `is_unique` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `fields` ADD `validation_regex` varchar(500);