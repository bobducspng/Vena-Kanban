CREATE TABLE `pipe_members` (
	`pipe_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`role` varchar(16) NOT NULL DEFAULT 'member',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `pipe_members_pipe_id_user_id_pk` PRIMARY KEY(`pipe_id`,`user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pipemembers_user` ON `pipe_members` (`user_id`);--> statement-breakpoint
-- Fechado por padrão daqui em diante, mas quem já usava não perde acesso: todo
-- membro atual (não admin) entra como "member" em todo pipe que já existe.
INSERT INTO `pipe_members` (`pipe_id`, `user_id`, `role`)
SELECT p.`id`, m.`user_id`, 'member' FROM `pipes` p JOIN `memberships` m ON m.`org_id` = p.`org_id` WHERE m.`role` <> 'admin';
