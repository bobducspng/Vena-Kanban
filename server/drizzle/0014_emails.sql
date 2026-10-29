CREATE TABLE `card_emails` (
	`id` char(36) NOT NULL,
	`card_id` char(36) NOT NULL,
	`template_id` char(36),
	`to_list` varchar(2000) NOT NULL,
	`cc_list` varchar(2000),
	`subject` varchar(500) NOT NULL,
	`body` text NOT NULL,
	`attachment_ids` json,
	`sent_by` char(36),
	`via` varchar(255),
	`status` varchar(16) NOT NULL,
	`error` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `card_emails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`to_spec` varchar(1000) NOT NULL DEFAULT '',
	`cc_spec` varchar(1000) NOT NULL DEFAULT '',
	`subject` varchar(500) NOT NULL,
	`body` text NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `email_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_cardemails_card` ON `card_emails` (`card_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_emailtpl_pipe` ON `email_templates` (`pipe_id`);