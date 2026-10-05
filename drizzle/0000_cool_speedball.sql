CREATE TABLE `editorial_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`head` integer NOT NULL,
	`published` integer
);
--> statement-breakpoint
CREATE TABLE `editorial_revisions` (
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`state` text NOT NULL,
	`content` text NOT NULL,
	`actor` text NOT NULL,
	`role` text NOT NULL,
	`action` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`document_id`, `version`),
	FOREIGN KEY (`document_id`) REFERENCES `editorial_documents`(`id`) ON UPDATE no action ON DELETE no action
);
