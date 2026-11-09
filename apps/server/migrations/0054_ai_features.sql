CREATE TABLE `ai_run` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`input` text NOT NULL,
	`result` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_run_household_idx` ON `ai_run` (`household_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `item_pair` (
	`household_id` text NOT NULL,
	`item_a` text NOT NULL,
	`item_b` text NOT NULL,
	`score` real NOT NULL,
	`not_duplicate_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`item_a`, `item_b`),
	FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_a`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_b`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_pair_household_idx` ON `item_pair` (`household_id`);--> statement-breakpoint
CREATE TABLE `suggested_task` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`item_id` text NOT NULL,
	`title` text NOT NULL,
	`title_key` text NOT NULL,
	`interval_count` integer NOT NULL,
	`interval_unit` text NOT NULL,
	`source` text NOT NULL,
	`attachment_id` text,
	`dismissed_at` integer,
	`added_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachment`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suggested_task_item_title_idx` ON `suggested_task` (`household_id`,`item_id`,`title_key`);--> statement-breakpoint
ALTER TABLE `household_setting` ADD `ai_fill` text;--> statement-breakpoint
ALTER TABLE `item` ADD `ai_filled` text;--> statement-breakpoint
ALTER TABLE `item` ADD `replacement_cents` integer;--> statement-breakpoint
ALTER TABLE `item` ADD `replacement_estimate` text;--> statement-breakpoint
ALTER TABLE `item` ADD `upkeep_checked_at` integer;--> statement-breakpoint
ALTER TABLE `item` ADD `merged_into_id` text;--> statement-breakpoint
INSERT OR IGNORE INTO `suggested_task` (`id`, `household_id`, `item_id`, `title`, `title_key`, `interval_count`, `interval_unit`, `source`, `attachment_id`, `created_at`)
SELECT lower(hex(randomblob(16))), a.household_id, a.item_id, trim(json_extract(m.value, '$.title')), lower(trim(json_extract(m.value, '$.title'))),
  json_extract(m.value, '$.intervalCount'), json_extract(m.value, '$.intervalUnit'), 'manual', a.id, a.created_at
FROM `attachment` a
JOIN `item` i ON i.id = a.item_id AND i.deleted_at IS NULL
JOIN json_each(json_extract(a.analysis, '$.suggestions.maintenance')) m
WHERE a.deleted_at IS NULL AND a.analysis_status = 'done' AND a.suggestions_dismissed_at IS NULL
  AND json_type(a.analysis, '$.suggestions.maintenance') = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM `maintenance_task` t
    WHERE t.item_id = a.item_id AND t.deleted_at IS NULL
      AND (instr(lower(trim(t.title)), lower(trim(json_extract(m.value, '$.title')))) > 0
        OR instr(lower(trim(json_extract(m.value, '$.title'))), lower(trim(t.title))) > 0)
  );
