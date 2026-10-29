ALTER TABLE `card_emails` MODIFY COLUMN `body` mediumtext NOT NULL;--> statement-breakpoint
ALTER TABLE `email_templates` MODIFY COLUMN `body` mediumtext NOT NULL;--> statement-breakpoint
ALTER TABLE `card_emails` ADD `format` varchar(8) DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `email_templates` ADD `format` varchar(8) DEFAULT 'text' NOT NULL;