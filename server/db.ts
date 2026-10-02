import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, focusSessions, learningData, learningDataVersions, UploadedFile, uploadedFiles, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getLearningData(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ data: learningData.data })
    .from(learningData)
    .where(eq(learningData.userId, userId))
    .limit(1);
  return result[0]?.data ?? null;
}

export async function recordFocusSession(input: {
  id: string;
  userId: number;
  startedAt: Date;
  endedAt: Date;
  minutes: number;
  mode?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Focus-session database is unavailable.");
  await db.insert(focusSessions).values({
    id: input.id,
    userId: input.userId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    minutes: input.minutes,
    mode: input.mode || "pomodoro",
  }).onDuplicateKeyUpdate({
    set: {
      endedAt: input.endedAt,
      minutes: input.minutes,
      mode: input.mode || "pomodoro",
    },
  });
}

export async function getFocusSessions(userId: number, limit = 180) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: focusSessions.id,
    startedAt: focusSessions.startedAt,
    endedAt: focusSessions.endedAt,
    minutes: focusSessions.minutes,
    mode: focusSessions.mode,
  }).from(focusSessions)
    .where(eq(focusSessions.userId, userId))
    .orderBy(desc(focusSessions.endedAt))
    .limit(Math.min(Math.max(limit, 1), 365));
}

export class StaleLearningDataError extends Error {
  constructor(readonly currentRevision: number, readonly incomingRevision: number) {
    super("A newer cloud snapshot exists; the incoming snapshot was not saved.");
    this.name = "StaleLearningDataError";
  }
}

export async function upsertLearningData(userId: number, data: unknown) {
  const db = await getDb();
  if (!db) {
    throw new Error("Learning-data database is unavailable; the cloud save was not completed.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid learning-data snapshot; nothing was saved.");
  }

  const incomingData = data as Record<string, unknown>;
  const rawRevision = Number(
    (incomingData?.meta as Record<string, unknown> | undefined)?.localRevision || 0,
  );
  const incomingRevision = Number.isFinite(rawRevision) && rawRevision > 0
    ? Math.floor(rawRevision)
    : Date.now();
  const persistedData = rawRevision > 0
    ? incomingData
    : {
        ...incomingData,
        meta: {
          ...((incomingData.meta as Record<string, unknown> | undefined) || {}),
          localRevision: incomingRevision,
        },
      };

  // Browser saves are asynchronous. Ignore an older request that arrives
  // after a newer one, preventing a slow response from rolling data back.
  const existing = await db
    .select({ data: learningData.data })
    .from(learningData)
    .where(eq(learningData.userId, userId))
    .limit(1);
  const existingRevision = Number(
    ((existing[0]?.data as Record<string, unknown> | undefined)?.meta as
      | Record<string, unknown>
      | undefined)?.localRevision || 0,
  );
  if (existingRevision > incomingRevision) {
    throw new StaleLearningDataError(existingRevision, incomingRevision);
  }

  const nextData = sql`IF(
    COALESCE(
      CAST(JSON_UNQUOTE(JSON_EXTRACT(${learningData.data}, '$.meta.localRevision')) AS UNSIGNED),
      0
    ) > ${incomingRevision},
    ${learningData.data},
    ${JSON.stringify(persistedData)}
  )`;

  await db
    .insert(learningData)
    .values({ userId, data: persistedData })
    .onDuplicateKeyUpdate({ set: { data: nextData } });

  // The conditional upsert protects against a newer write racing the initial
  // read. Read back the committed value so a rejected stale save can never be
  // acknowledged to the browser as successful.
  const saved = await db
    .select({ data: learningData.data })
    .from(learningData)
    .where(eq(learningData.userId, userId))
    .limit(1);
  const savedData = saved[0]?.data as Record<string, unknown> | undefined;
  const savedRevision = Number(
    ((savedData?.meta as Record<string, unknown> | undefined)?.localRevision) || 0,
  );
  if (savedRevision > incomingRevision) {
    throw new StaleLearningDataError(savedRevision, incomingRevision);
  }

  // Keep a bounded server-side history so a bad latest write can be rolled back.
  await db
    .insert(learningDataVersions)
    .values({ userId, revision: incomingRevision, data: persistedData })
    .onDuplicateKeyUpdate({ set: { data: persistedData } });

  const versions = await db
    .select({ revision: learningDataVersions.revision })
    .from(learningDataVersions)
    .where(eq(learningDataVersions.userId, userId))
    .orderBy(desc(learningDataVersions.revision))
    .limit(21);
  const oldRevisions = versions.slice(20).map(version => version.revision);
  if (oldRevisions.length > 0) {
    await db
      .delete(learningDataVersions)
      .where(and(
        eq(learningDataVersions.userId, userId),
        inArray(learningDataVersions.revision, oldRevisions),
      ));
  }
}

export async function getLearningDataVersions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ revision: learningDataVersions.revision, savedAt: learningDataVersions.savedAt })
    .from(learningDataVersions)
    .where(eq(learningDataVersions.userId, userId))
    .orderBy(desc(learningDataVersions.revision))
    .limit(20);
}

export async function getLearningDataVersion(userId: number, revision: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ data: learningDataVersions.data })
    .from(learningDataVersions)
    .where(and(
      eq(learningDataVersions.userId, userId),
      eq(learningDataVersions.revision, revision),
    ))
    .limit(1);
  return result[0]?.data ?? null;
}

export async function restoreLearningDataVersion(userId: number, revision: number) {
  const data = await getLearningDataVersion(userId, revision);
  if (!data || typeof data !== "object") return null;
  const restoredData = {
    ...(data as Record<string, unknown>),
    meta: {
      ...(((data as Record<string, unknown>).meta as Record<string, unknown> | undefined) || {}),
      localRevision: Date.now(),
      restoredFromRevision: revision,
    },
  };
  await upsertLearningData(userId, restoredData);
  return restoredData;
}

export type UploadedFilePart = { index: number; key: string; size: number };

export async function createUploadedFile(input: {
  id: string;
  userId: number;
  objectKey: string;
  originalName: string;
  contentType: string;
  size: number;
  chunkSize: number;
  partCount: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("File index database is unavailable; upload was not started.");
  await db.insert(uploadedFiles).values({ ...input, parts: [], status: "uploading" });
}

export async function getUploadedFileForUser(id: string, userId: number): Promise<UploadedFile | null> {
  const db = await getDb();
  if (!db) throw new Error("File index database is unavailable.");
  const rows = await db
    .select()
    .from(uploadedFiles)
    .where(and(eq(uploadedFiles.id, id), eq(uploadedFiles.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function addUploadedFilePart(
  id: string,
  userId: number,
  part: UploadedFilePart,
): Promise<UploadedFile | null> {
  const db = await getDb();
  if (!db) throw new Error("File index database is unavailable.");
  const current = await getUploadedFileForUser(id, userId);
  if (!current || current.status !== "uploading") return null;
  const parts = Array.isArray(current.parts) ? current.parts as UploadedFilePart[] : [];
  const nextParts = [...parts.filter(item => item.index !== part.index), part]
    .sort((left, right) => left.index - right.index);
  await db
    .update(uploadedFiles)
    .set({ parts: nextParts, updatedAt: new Date() })
    .where(and(eq(uploadedFiles.id, id), eq(uploadedFiles.userId, userId)));
  return getUploadedFileForUser(id, userId);
}

export async function completeUploadedFile(id: string, userId: number): Promise<UploadedFile | null> {
  const db = await getDb();
  if (!db) throw new Error("File index database is unavailable.");
  await db
    .update(uploadedFiles)
    .set({ status: "complete", updatedAt: new Date() })
    .where(and(
      eq(uploadedFiles.id, id),
      eq(uploadedFiles.userId, userId),
      eq(uploadedFiles.status, "uploading"),
    ));
  return getUploadedFileForUser(id, userId);
}

export async function listUploadedFiles(userId: number, limit = 100) {
  const db = await getDb();
  if (!db) throw new Error("File index database is unavailable.");
  return db
    .select({
      id: uploadedFiles.id,
      originalName: uploadedFiles.originalName,
      contentType: uploadedFiles.contentType,
      size: uploadedFiles.size,
      status: uploadedFiles.status,
      createdAt: uploadedFiles.createdAt,
    })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.userId, userId))
    .orderBy(desc(uploadedFiles.createdAt))
    .limit(Math.max(1, Math.min(200, Math.floor(limit))));
}

// TODO: add feature queries here as your schema grows.
