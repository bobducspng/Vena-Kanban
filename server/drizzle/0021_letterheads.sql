CREATE TABLE `letterheads` (
	`id` char(36) NOT NULL,
	`org_id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`logo` varchar(64),
	`header` text,
	`footer` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `letterheads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `organizations` ADD `default_letterhead_id` char(36);--> statement-breakpoint
ALTER TABLE `pdf_templates` ADD `layout_mode` varchar(16) DEFAULT 'pipe' NOT NULL;--> statement-breakpoint
ALTER TABLE `pdf_templates` ADD `letterhead_id` char(36);--> statement-breakpoint
ALTER TABLE `pdf_templates` ADD `layout_field_id` char(36);--> statement-breakpoint
ALTER TABLE `pipes` ADD `letterhead_id` char(36);--> statement-breakpoint
CREATE INDEX `idx_letterheads_org` ON `letterheads` (`org_id`);--> statement-breakpoint
-- O papel timbrado único (M11) vira a primeira frente, marcada como padrão.
INSERT INTO `letterheads` (`id`, `org_id`, `name`, `logo`, `header`, `footer`)
SELECT UUID(), `id`, LEFT(`name`, 120), `pdf_logo`, `pdf_header`, `pdf_footer` FROM `organizations`
WHERE `pdf_logo` IS NOT NULL OR `pdf_header` IS NOT NULL OR `pdf_footer` IS NOT NULL;--> statement-breakpoint
UPDATE `organizations` o JOIN `letterheads` l ON l.`org_id` = o.`id` SET o.`default_letterhead_id` = l.`id` WHERE o.`default_letterhead_id` IS NULL;--> statement-breakpoint
-- Modelos com cabeçalho/rodapé próprios viram uma frente com o nome do modelo (mesmo id).
INSERT INTO `letterheads` (`id`, `org_id`, `name`, `logo`, `header`, `footer`)
SELECT t.`id`, p.`org_id`, LEFT(t.`name`, 120), IF(t.`show_logo`, o.`pdf_logo`, NULL), t.`header`, t.`footer`
FROM `pdf_templates` t JOIN `pipes` p ON p.`id` = t.`pipe_id` JOIN `organizations` o ON o.`id` = p.`org_id`
WHERE t.`use_default_layout` = 0;--> statement-breakpoint
UPDATE `pdf_templates` SET `layout_mode` = 'fixed', `letterhead_id` = `id` WHERE `use_default_layout` = 0;
