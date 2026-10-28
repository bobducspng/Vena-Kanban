CREATE TABLE `phase_transitions` (
	`from_phase_id` char(36) NOT NULL,
	`to_phase_id` char(36) NOT NULL,
	CONSTRAINT `phase_transitions_from_phase_id_to_phase_id_pk` PRIMARY KEY(`from_phase_id`,`to_phase_id`)
);
--> statement-breakpoint
ALTER TABLE `phases` ADD `can_create_card` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_transitions_to` ON `phase_transitions` (`to_phase_id`);--> statement-breakpoint
-- Pipes existentes: liga cada fase às vizinhas (anterior e próxima), como o
-- original faz ao criar fases. Posições podem ter buracos, então numera de novo.
INSERT INTO `phase_transitions` (`from_phase_id`, `to_phase_id`)
WITH r AS (
  SELECT `id`, `pipe_id`, ROW_NUMBER() OVER (PARTITION BY `pipe_id` ORDER BY `position`, `created_at`) AS rn FROM `phases`
)
SELECT a.`id`, b.`id` FROM r a JOIN r b ON a.`pipe_id` = b.`pipe_id` AND ABS(a.rn - b.rn) = 1;
