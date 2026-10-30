CREATE TABLE `table_members` (
	`table_id` char(36) NOT NULL,
	`kind` varchar(8) NOT NULL,
	`subject_id` char(36) NOT NULL,
	`role` varchar(16) NOT NULL DEFAULT 'member',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `table_members_table_id_kind_subject_id_pk` PRIMARY KEY(`table_id`,`kind`,`subject_id`)
);
--> statement-breakpoint
ALTER TABLE `data_tables` ADD `access` varchar(16) DEFAULT 'all_edit' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_tablemembers_subject` ON `table_members` (`subject_id`);