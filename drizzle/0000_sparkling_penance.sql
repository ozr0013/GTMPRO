CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`tick` integer NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`ref_type` text,
	`ref_id` text,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bandit_arms` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`archetype` text NOT NULL,
	`time_slot` text NOT NULL,
	`alpha` real DEFAULT 2 NOT NULL,
	`beta` real DEFAULT 2 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bandit_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`arm_id` text NOT NULL,
	`post_id` text NOT NULL,
	`reward` real NOT NULL,
	`tick` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bandit_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`playbook_version_id` text NOT NULL,
	`arms_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dm_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`sender` text NOT NULL,
	`text` text NOT NULL,
	`tick` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dm_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`turn_count` integer DEFAULT 0 NOT NULL,
	`created_tick` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`post_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`kind` text NOT NULL,
	`comment_text` text,
	`tick` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `funnel_events` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_post_id` text,
	`tick` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outcome_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`post_id` text NOT NULL,
	`window_ticks` integer NOT NULL,
	`actual` text NOT NULL,
	`predicted` text NOT NULL,
	`verdict` text NOT NULL,
	`attribution` text NOT NULL,
	`summary` text NOT NULL,
	`tick` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`bio` text NOT NULL,
	`segment` text NOT NULL,
	`hidden` text NOT NULL,
	`is_follower` integer DEFAULT false NOT NULL,
	`fatigue` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `playbook_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`version_id` text NOT NULL,
	`rule_key` text NOT NULL,
	`category` text NOT NULL,
	`text` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`evidence` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `playbook_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`version` integer NOT NULL,
	`parent_version` integer,
	`change_summary` text NOT NULL,
	`author_type` text NOT NULL,
	`created_tick` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`author_type` text NOT NULL,
	`ambient_author` text,
	`proposal_id` text,
	`bandit_arm_id` text,
	`archetype` text NOT NULL,
	`topic` text NOT NULL,
	`caption` text NOT NULL,
	`hashtags` text NOT NULL,
	`creative_brief` text NOT NULL,
	`image_url` text,
	`scheduled_tick` integer NOT NULL,
	`published_tick` integer,
	`status` text DEFAULT 'scheduled' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text NOT NULL,
	`reasoning` text NOT NULL,
	`evidence` text NOT NULL,
	`predicted_effect` text NOT NULL,
	`risk_class` text DEFAULT 'normal' NOT NULL,
	`human_reason` text,
	`human_edit_diff` text,
	`created_tick` integer NOT NULL,
	`decided_tick` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`world_id` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'propose' NOT NULL,
	`max_posts_per_day` integer DEFAULT 3 NOT NULL,
	`max_dms_per_day` integer DEFAULT 5 NOT NULL,
	`quiet_hours` text NOT NULL,
	`image_budget` integer DEFAULT 10 NOT NULL,
	`banned_topics` text NOT NULL,
	`paused` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`product_description` text NOT NULL,
	`sim_tick` integer DEFAULT 0 NOT NULL,
	`seed` text NOT NULL,
	`config` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
