CREATE TABLE `learning_data_versions` (
	`userId` int NOT NULL,
	`revision` bigint NOT NULL,
	`data` json NOT NULL,
	`savedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `learning_data_versions_userId_revision_pk` PRIMARY KEY(`userId`,`revision`)
);
