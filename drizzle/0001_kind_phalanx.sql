CREATE TABLE `learning_data` (
	`userId` int NOT NULL,
	`data` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `learning_data_userId` PRIMARY KEY(`userId`)
);
