CREATE TABLE `pipe_group_members` (
	`pipe_id` char(36) NOT NULL,
	`group_id` char(36) NOT NULL,
	`role` varchar(16) NOT NULL DEFAULT 'member',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `pipe_group_members_pipe_id_group_id_pk` PRIMARY KEY(`pipe_id`,`group_id`)
);
--> statement-breakpoint
CREATE TABLE `user_group_members` (
	`group_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	CONSTRAINT `user_group_members_group_id_user_id_pk` PRIMARY KEY(`group_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `user_groups` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pgm_group` ON `pipe_group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_ugm_user` ON `user_group_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_groups_org` ON `user_groups` (`org_id`);