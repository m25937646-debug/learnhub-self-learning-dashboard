CREATE TABLE `focus_sessions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`startedAt` timestamp NOT NULL,
	`endedAt` timestamp NOT NULL,
	`minutes` int NOT NULL,
	`mode` varchar(32) NOT NULL DEFAULT 'pomodoro',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `focus_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `focus_sessions_user_created_idx` ON `focus_sessions` (`userId`,`createdAt`);