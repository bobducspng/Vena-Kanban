CREATE TABLE `bi_feeds` (
	`org_id` char(36) NOT NULL,
	`token` char(43) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `bi_feeds_org_id` PRIMARY KEY(`org_id`),
	CONSTRAINT `uq_bifeeds_token` UNIQUE(`token`)
);
