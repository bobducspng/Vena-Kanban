CREATE TABLE `signature_requests` (
	`id` char(36) NOT NULL,
	`card_id` char(36) NOT NULL,
	`attachment_id` char(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text,
	`sha256` char(64) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`signed_attachment_id` char(36),
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`completed_at` datetime(3),
	CONSTRAINT `signature_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signature_signers` (
	`id` char(36) NOT NULL,
	`request_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`token` varchar(64) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`viewed_at` datetime(3),
	`signed_at` datetime(3),
	`signed_name` varchar(255),
	`document` varchar(32),
	`ip` varchar(64),
	`user_agent` varchar(512),
	CONSTRAINT `signature_signers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_signer_token` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE INDEX `idx_sigreq_card` ON `signature_requests` (`card_id`);--> statement-breakpoint
CREATE INDEX `idx_signer_req` ON `signature_signers` (`request_id`);