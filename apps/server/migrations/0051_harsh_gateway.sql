CREATE TABLE `item_sighting` (
	`household_id` text NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`user_id` text,
	`how` text NOT NULL,
	PRIMARY KEY(`item_id`, `kind`),
	FOREIGN KEY (`household_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `item_sighting_household_idx` ON `item_sighting` (`household_id`,`kind`,`at`);