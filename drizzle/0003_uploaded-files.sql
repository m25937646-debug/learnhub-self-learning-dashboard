CREATE TABLE `uploaded_files` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`objectKey` varchar(512) NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`contentType` varchar(128) NOT NULL,
	`size` bigint NOT NULL,
	`chunkSize` int NOT NULL,
	`partCount` int NOT NULL,
	`parts` json NOT NULL,
	`status` enum('uploading','complete','failed') NOT NULL DEFAULT 'uploading',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `uploaded_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `uploaded_files_objectKey_unique` UNIQUE(`objectKey`)
);
--> statement-breakpoint
CREATE INDEX `uploaded_files_user_idx` ON `uploaded_files` (`userId`);