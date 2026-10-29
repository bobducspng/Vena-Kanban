CREATE TABLE `drive_targets` (
	`org_id` char(36) NOT NULL,
	`secret` text NOT NULL,
	`url` varchar(512),
	`email` varchar(320),
	`folder_url` varchar(512),
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `drive_targets_org_id` PRIMARY KEY(`org_id`)
);
