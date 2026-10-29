CREATE TABLE `drive_backups` (
	`org_id` char(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`refresh_token` text NOT NULL,
	`folder_id` varchar(128),
	`db_folder_id` varchar(128),
	`files_folder_id` varchar(128),
	`connected_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `drive_backups_org_id` PRIMARY KEY(`org_id`)
);
