import { bigint, index, int, json, mysqlEnum, mysqlTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const learningData = mysqlTable("learning_data", {
  userId: int("userId").primaryKey().notNull(),
  data: json("data").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const learningDataVersions = mysqlTable(
  "learning_data_versions",
  {
    userId: int("userId").notNull(),
    revision: bigint("revision", { mode: "number" }).notNull(),
    data: json("data").notNull(),
    savedAt: timestamp("savedAt").defaultNow().notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.userId, table.revision] }),
  }),
);

export const uploadedFiles = mysqlTable(
  "uploaded_files",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId").notNull(),
    objectKey: varchar("objectKey", { length: 512 }).notNull().unique(),
    originalName: varchar("originalName", { length: 255 }).notNull(),
    contentType: varchar("contentType", { length: 128 }).notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    chunkSize: int("chunkSize").notNull(),
    partCount: int("partCount").notNull(),
    parts: json("parts").notNull(),
    status: mysqlEnum("status", ["uploading", "complete", "failed"])
      .default("uploading")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ userIdx: index("uploaded_files_user_idx").on(table.userId) }),
);

export const focusSessions = mysqlTable(
  "focus_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("userId").notNull(),
    startedAt: timestamp("startedAt").notNull(),
    endedAt: timestamp("endedAt").notNull(),
    minutes: int("minutes").notNull(),
    mode: varchar("mode", { length: 32 }).notNull().default("pomodoro"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ userCreatedIdx: index("focus_sessions_user_created_idx").on(table.userId, table.createdAt) }),
);

export type LearningData = typeof learningData.$inferSelect;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type FocusSession = typeof focusSessions.$inferSelect;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here
