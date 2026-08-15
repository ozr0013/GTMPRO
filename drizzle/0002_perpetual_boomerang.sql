ALTER TABLE `settings` ADD `slack_target` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `slack_notify` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `slack_enabled` integer DEFAULT false NOT NULL;