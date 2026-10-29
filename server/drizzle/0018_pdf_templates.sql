CREATE TABLE `pdf_templates` (
	`id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `pdf_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pdftpl_pipe` ON `pdf_templates` (`pipe_id`);