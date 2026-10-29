ALTER TABLE `organizations` ADD `pdf_logo` varchar(64);--> statement-breakpoint
ALTER TABLE `organizations` ADD `pdf_header` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `pdf_footer` text;--> statement-breakpoint
ALTER TABLE `pdf_templates` ADD `use_default_layout` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `pdf_templates` ADD `show_logo` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `pdf_templates` ADD `header` text;--> statement-breakpoint
ALTER TABLE `pdf_templates` ADD `footer` text;