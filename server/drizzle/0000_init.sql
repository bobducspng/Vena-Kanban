CREATE TABLE `attachments` (
	`id` char(36) NOT NULL,
	`card_id` char(36),
	`card_field_id` char(36),
	`filename` varchar(512) NOT NULL,
	`url` varchar(2048) NOT NULL,
	`size_bytes` bigint,
	`uploaded_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` char(36) NOT NULL,
	`automation_id` char(36) NOT NULL,
	`card_id` char(36),
	`status` enum('success','skipped','failed') NOT NULL,
	`counted_task` boolean NOT NULL DEFAULT true,
	`dedupe_key` varchar(255),
	`error` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `automation_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_run_dedupe` UNIQUE(`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `automations` (
	`id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`event_type` enum('card_enters_phase','field_updated','card_created','schedule','alert') NOT NULL,
	`event_config` json,
	`cond_json` json,
	`action_type` enum('move_card','update_field','create_connected_card','create_record','notify') NOT NULL,
	`action_config` json,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `automations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `card_assignees` (
	`card_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	CONSTRAINT `card_assignees_card_id_user_id_pk` PRIMARY KEY(`card_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `card_events` (
	`id` char(36) NOT NULL,
	`card_id` char(36) NOT NULL,
	`type` varchar(48) NOT NULL,
	`from_phase_id` char(36),
	`to_phase_id` char(36),
	`actor_id` char(36),
	`data` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `card_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `card_fields` (
	`id` char(36) NOT NULL,
	`card_id` char(36) NOT NULL,
	`field_id` char(36) NOT NULL,
	`value` json,
	`filled_at` datetime(3),
	CONSTRAINT `card_fields_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_card_field` UNIQUE(`card_id`,`field_id`)
);
--> statement-breakpoint
CREATE TABLE `card_labels` (
	`card_id` char(36) NOT NULL,
	`label_id` char(36) NOT NULL,
	CONSTRAINT `card_labels_card_id_label_id_pk` PRIMARY KEY(`card_id`,`label_id`)
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`current_phase_id` char(36) NOT NULL,
	`title` varchar(512) NOT NULL,
	`created_by` char(36),
	`due_date` datetime(3),
	`done` boolean NOT NULL DEFAULT false,
	`late` boolean NOT NULL DEFAULT false,
	`version` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` char(36) NOT NULL,
	`card_id` char(36) NOT NULL,
	`author_id` char(36),
	`body` text NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dashboard_widgets` (
	`id` char(36) NOT NULL,
	`dashboard_id` char(36) NOT NULL,
	`type` enum('line','bar','area','table','calendar','number') NOT NULL,
	`source` json,
	`config` json,
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `dashboard_widgets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dashboards` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `dashboards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_tables` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `data_tables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fields` (
	`id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`phase_id` char(36) NOT NULL,
	`label` varchar(255) NOT NULL,
	`type` varchar(32) NOT NULL,
	`required` boolean NOT NULL DEFAULT false,
	`options` json,
	`settings` json,
	`position` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `fields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `item_links` (
	`id` char(36) NOT NULL,
	`field_id` char(36),
	`from_item_type` enum('card','record') NOT NULL,
	`from_item_id` char(36) NOT NULL,
	`to_item_type` enum('card','record') NOT NULL,
	`to_item_id` char(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `item_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_link` UNIQUE(`field_id`,`from_item_id`,`to_item_id`)
);
--> statement-breakpoint
CREATE TABLE `labels` (
	`id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`color` varchar(16),
	CONSTRAINT `labels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`role` enum('admin','member','guest') NOT NULL DEFAULT 'member',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_membership` UNIQUE(`org_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `phases` (
	`id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`color` varchar(16),
	`description` text,
	`position` int NOT NULL DEFAULT 0,
	`is_start` boolean NOT NULL DEFAULT false,
	`is_end` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `phases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pipes` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `pipes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portal_forms` (
	`portal_id` char(36) NOT NULL,
	`form_id` char(36) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `portal_forms_portal_id_form_id_pk` PRIMARY KEY(`portal_id`,`form_id`)
);
--> statement-breakpoint
CREATE TABLE `portals` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`title` varchar(255),
	`branding` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `portals_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_portal_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `public_forms` (
	`id` char(36) NOT NULL,
	`pipe_id` char(36) NOT NULL,
	`phase_id` char(36),
	`slug` varchar(64) NOT NULL,
	`title` varchar(255),
	`branding` json,
	`is_public` boolean NOT NULL DEFAULT true,
	`closed` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `public_forms_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_form_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`scope` enum('pipe','company') NOT NULL DEFAULT 'pipe',
	`pipe_id` char(36),
	`name` varchar(255) NOT NULL,
	`config` json,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(64) NOT NULL,
	`user_id` char(36) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `table_fields` (
	`id` char(36) NOT NULL,
	`table_id` char(36) NOT NULL,
	`label` varchar(255) NOT NULL,
	`type` varchar(32) NOT NULL,
	`options` json,
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `table_fields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `table_record_fields` (
	`id` char(36) NOT NULL,
	`record_id` char(36) NOT NULL,
	`field_id` char(36) NOT NULL,
	`value` json,
	CONSTRAINT `table_record_fields_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_record_field` UNIQUE(`record_id`,`field_id`)
);
--> statement-breakpoint
CREATE TABLE `table_records` (
	`id` char(36) NOT NULL,
	`table_id` char(36) NOT NULL,
	`title` varchar(512) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `table_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`google_sub` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255),
	`avatar_url` varchar(1024),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_google_sub` UNIQUE(`google_sub`),
	CONSTRAINT `uq_users_email` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `idx_attach_card` ON `attachments` (`card_id`);--> statement-breakpoint
CREATE INDEX `idx_runs_autom` ON `automation_runs` (`automation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_autom_pipe` ON `automations` (`pipe_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_autom_event` ON `automations` (`pipe_id`,`event_type`);--> statement-breakpoint
CREATE INDEX `idx_assignee_user` ON `card_assignees` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_events_card` ON `card_events` (`card_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_card_fields_field` ON `card_fields` (`field_id`);--> statement-breakpoint
CREATE INDEX `idx_cardlabels_label` ON `card_labels` (`label_id`);--> statement-breakpoint
CREATE INDEX `idx_cards_pipe` ON `cards` (`pipe_id`);--> statement-breakpoint
CREATE INDEX `idx_cards_phase` ON `cards` (`current_phase_id`);--> statement-breakpoint
CREATE INDEX `idx_cards_due` ON `cards` (`pipe_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_comments_card` ON `comments` (`card_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_widgets_dash` ON `dashboard_widgets` (`dashboard_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_dash_org` ON `dashboards` (`org_id`);--> statement-breakpoint
CREATE INDEX `idx_tables_org` ON `data_tables` (`org_id`);--> statement-breakpoint
CREATE INDEX `idx_fields_pipe` ON `fields` (`pipe_id`);--> statement-breakpoint
CREATE INDEX `idx_fields_phase` ON `fields` (`phase_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_link_from` ON `item_links` (`from_item_type`,`from_item_id`);--> statement-breakpoint
CREATE INDEX `idx_link_to` ON `item_links` (`to_item_type`,`to_item_id`);--> statement-breakpoint
CREATE INDEX `idx_labels_pipe` ON `labels` (`pipe_id`);--> statement-breakpoint
CREATE INDEX `idx_membership_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_phases_pipe` ON `phases` (`pipe_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_pipes_org` ON `pipes` (`org_id`);--> statement-breakpoint
CREATE INDEX `idx_forms_pipe` ON `public_forms` (`pipe_id`);--> statement-breakpoint
CREATE INDEX `idx_reports_org` ON `reports` (`org_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_tablefields_table` ON `table_fields` (`table_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_records_table` ON `table_records` (`table_id`);