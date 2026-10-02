import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  addUploadedFilePart,
  completeUploadedFile,
  createUploadedFile,
  getUploadedFileForUser,
  listUploadedFiles,
  type UploadedFilePart,
} from "../db";
import { storagePrepareUploadAtKey, storagePutStream } from "../storage";
import { sdk } from "./sdk";
import { createFileAccessToken } from "./storageProxy";
import {
  buildUploadPartKey,
  buildUserUploadKey,
  createByteCountingStream,
  getExpectedUploadPartSize,
  MAX_UPLOAD_PARTS,
  MAX_UPLOAD_SIZE_BYTES,
  normalizeUploadContentType,
  normalizeUploadFileName,
  requireUploadContentLength,
  UPLOAD_CHUNK_SIZE_BYTES,
  UploadRequestError,
  validateUploadSize,
} from "./fileUpload";

const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticatedUser(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user && !user.isCron && Number.isSafeInteger(user.id) && user.id > 0) return user;
  } catch {
    // Deliberately return one generic auth response; never disclose token details.
  }
  res.status(401).json({ message: "سجّل الدخول قبل رفع الملفات أو فتحها." });
  return null;
}

function sendUploadError(res: Response, error: unknown, fallback: string) {
  if (error instanceof UploadRequestError) {
    res.status(error.statusCode).json({ message: error.message, code: error.code });
    return;
  }
  console.error("[Storage] Upload operation failed", error instanceof Error ? error.message : "unknown error");
  res.status(503).json({ message: fallback });
}

function parseUploadId(value: unknown): string | null {
  return typeof value === "string" && UPLOAD_ID_PATTERN.test(value) ? value : null;
}

export function registerUploadRoutes(app: Express) {
  app.get("/api/storage/files", async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      const limit = Number(req.query.limit);
      const safeLimit = Number.isFinite(limit) ? Math.min(200, Math.max(1, Math.floor(limit))) : 100;
      const files = await listUploadedFiles(user.id, safeLimit);
      res.setHeader("Cache-Control", "private, no-store");
      res.json(files.map(file => ({
        id: file.id,
        name: file.originalName,
        mime: file.contentType,
        size: file.size,
        status: file.status,
        createdAt: file.createdAt,
      })));
    } catch {
      res.status(503).json({ message: "تعذر قراءة فهرس ملفاتك المحفوظة الآن." });
    }
  });

  app.post("/api/storage/upload/start", async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    try {
      const size = validateUploadSize(req.body?.size);
      const originalName = normalizeUploadFileName(req.body?.fileName);
      const contentType = normalizeUploadContentType(req.body?.contentType);
      const id = randomUUID();
      const objectKey = buildUserUploadKey(user.id, originalName, Date.now(), id);
      const partCount = Math.ceil(size / UPLOAD_CHUNK_SIZE_BYTES);
      if (partCount > MAX_UPLOAD_PARTS) {
        throw new UploadRequestError(413, "TOO_MANY_PARTS", "عدد أجزاء الملف يتجاوز الحد المدعوم.");
      }

      await createUploadedFile({
        id,
        userId: user.id,
        objectKey,
        originalName,
        contentType,
        size,
        chunkSize: UPLOAD_CHUNK_SIZE_BYTES,
        partCount,
      });

      res.setHeader("Cache-Control", "private, no-store");
      res.status(201).json({
        uploadId: id,
        chunkSize: UPLOAD_CHUNK_SIZE_BYTES,
        partCount,
        maxBytes: MAX_UPLOAD_SIZE_BYTES,
      });
    } catch (error) {
      sendUploadError(res, error, "تعذر تجهيز سجل الملف في التخزين؛ لم يبدأ رفعه.");
    }
  });

  app.post("/api/storage/upload/part", async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) {
      req.resume();
      return;
    }
    if (req.header("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/octet-stream") {
      req.resume();
      res.status(415).json({ message: "نوع طلب الرفع غير مدعوم." });
      return;
    }

    const id = parseUploadId(req.header("x-upload-id"));
    const rawIndex = req.header("x-part-index");
    if (!id || !rawIndex || !/^\d+$/.test(rawIndex)) {
      req.resume();
      res.status(400).json({ message: "بيانات جزء الملف غير صالحة." });
      return;
    }
    const index = Number(rawIndex);

    try {
      const file = await getUploadedFileForUser(id, user.id);
      if (!file || file.status !== "uploading") {
        req.resume();
        res.status(file?.status === "complete" ? 409 : 404).json({ message: "جلسة الرفع غير متاحة." });
        return;
      }
      if (index < 0 || index >= file.partCount || file.partCount > MAX_UPLOAD_PARTS) {
        req.resume();
        res.status(400).json({ message: "رقم جزء الملف خارج النطاق." });
        return;
      }
      const expectedLength = getExpectedUploadPartSize(file.size, index);
      let contentLength: number;
      try {
        contentLength = requireUploadContentLength(req.headers["content-length"]);
      } catch (error) {
        req.resume();
        sendUploadError(res, error, "تعذر التحقق من حجم جزء الملف.");
        return;
      }
      if (contentLength !== expectedLength) {
        req.resume();
        res.status(400).json({ message: "حجم جزء الملف لا يطابق الجزء المطلوب؛ لم يُحفظ هذا الجزء." });
        return;
      }

      const objectKey = buildUploadPartKey(file.objectKey, index);
      const prepared = await storagePrepareUploadAtKey(objectKey);
      const counted = createByteCountingStream();
      const abortStream = () => counted.stream.destroy(new Error("UPLOAD_CLIENT_ABORTED"));
      req.once("aborted", abortStream);
      const uploadPromise = storagePutStream(prepared, counted.stream, file.contentType, contentLength);
      req.pipe(counted.stream);

      try {
        await uploadPromise;
        req.off("aborted", abortStream);
        if (!req.complete || counted.getBytesReceived() !== contentLength) {
          throw new Error("UPLOAD_LENGTH_MISMATCH");
        }
        const updated = await addUploadedFilePart(id, user.id, {
          index,
          key: prepared.key,
          size: contentLength,
        });
        if (!updated) {
          res.status(409).json({ message: "انتهت جلسة الرفع قبل تسجيل هذا الجزء." });
          return;
        }
        res.setHeader("Cache-Control", "private, no-store");
        res.json({ uploaded: true, partIndex: index });
      } catch (error) {
        req.off("aborted", abortStream);
        req.unpipe(counted.stream);
        counted.stream.destroy();
        if (!req.complete) req.resume();
        if (!res.destroyed && !res.headersSent) {
          const message = error instanceof Error ? error.message : "";
          const rejectedByStorage = /Managed storage rejected the file \((400|413)\)/.test(message);
          console.error("[Storage] File part failed", message || "unknown error");
          res.status(rejectedByStorage ? 413 : 502).json({
            message: rejectedByStorage
              ? "رفضت خدمة التخزين جزءًا من الملف؛ لم يُعلَن اكتمال الملف."
              : "تعذر حفظ جزء الملف؛ أُبقيت بيانات الملف الأصلية دون استبدالها. أعد المحاولة.",
          });
        }
      }
    } catch (error) {
      if (!req.complete) req.resume();
      sendUploadError(res, error, "تعذر تجهيز جزء الملف أو تسجيله؛ أعد المحاولة.");
    }
  });

  app.post("/api/storage/upload/complete", async (req, res) => {
    const user = await authenticatedUser(req, res);
    if (!user) return;
    const id = parseUploadId(req.body?.uploadId);
    if (!id) {
      res.status(400).json({ message: "معرّف جلسة الرفع غير صالح." });
      return;
    }

    try {
      const file = await getUploadedFileForUser(id, user.id);
      if (!file) {
        res.status(404).json({ message: "ملف الرفع غير موجود في حسابك." });
        return;
      }
      if (file.status === "complete") {
        res.setHeader("Cache-Control", "private, no-store");
        res.json({
          key: file.id,
          url: `/api/storage/file/${file.id}`,
          previewUrl: `/api/storage/file/${file.id}?view=1&accessToken=${encodeURIComponent(createFileAccessToken(file.id, user.id))}`,
          name: file.originalName,
          mime: file.contentType,
          size: file.size,
        });
        return;
      }

      const parts = (Array.isArray(file.parts) ? file.parts : []) as UploadedFilePart[];
      if (parts.length !== file.partCount) {
        res.status(409).json({ message: "لم يكتمل رفع كل أجزاء الملف؛ لم تتم إضافته إلى بياناتك." });
        return;
      }
      for (let index = 0; index < file.partCount; index += 1) {
        const part = parts.find(item => item.index === index);
        if (!part || part.size !== getExpectedUploadPartSize(file.size, index)) {
          res.status(409).json({ message: "هناك جزء مفقود أو غير مكتمل؛ أعد رفع الملف قبل حفظه." });
          return;
        }
      }

      const completed = await completeUploadedFile(id, user.id);
      if (!completed || completed.status !== "complete") {
        res.status(503).json({ message: "حُفظت الأجزاء لكن تعذر تأكيدها في سجل الملفات؛ أعد محاولة الإنهاء." });
        return;
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        key: completed.id,
        url: `/api/storage/file/${completed.id}`,
        previewUrl: `/api/storage/file/${completed.id}?view=1&accessToken=${encodeURIComponent(createFileAccessToken(completed.id, user.id))}`,
        name: completed.originalName,
        mime: completed.contentType,
        size: completed.size,
      });
    } catch (error) {
      sendUploadError(res, error, "تعذر تأكيد اكتمال الملف؛ لم تتم إضافته إلى بياناتك.");
    }
  });
}
