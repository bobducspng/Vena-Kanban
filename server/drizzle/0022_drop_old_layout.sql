ALTER TABLE `organizations` DROP COLUMN `pdf_logo`;--> statement-breakpoint
ALTER TABLE `organizations` DROP COLUMN `pdf_header`;--> statement-breakpoint
ALTER TABLE `organizations` DROP COLUMN `pdf_footer`;--> statement-breakpoint
ALTER TABLE `pdf_templates` DROP COLUMN `use_default_layout`;--> statement-breakpoint
ALTER TABLE `pdf_templates` DROP COLUMN `show_logo`;--> statement-breakpoint
ALTER TABLE `pdf_templates` DROP COLUMN `header`;--> statement-breakpoint
ALTER TABLE `pdf_templates` DROP COLUMN `footer`;