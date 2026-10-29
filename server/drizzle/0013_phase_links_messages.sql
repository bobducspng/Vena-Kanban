CREATE TABLE `phase_form_links` (
	`id` char(36) NOT NULL,
	`card_id` char(36) NOT NULL,
	`phase_id` char(36) NOT NULL,
	`token` char(43) NOT NULL,
	`sent_to` varchar(320),
	`created_by` char(36),
	`submitted_at` datetime(3),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `phase_form_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_phaselinks_token` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `request_messages` (
	`id` char(36) NOT NULL,
	`request_id` char(36) NOT NULL,
	`from_requester` boolean NOT NULL,
	`author_id` char(36),
	`body` text NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `request_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_phaselinks_card` ON `phase_form_links` (`card_id`);--> statement-breakpoint
CREATE INDEX `idx_reqmsg_request` ON `request_messages` (`request_id`,`created_at`);