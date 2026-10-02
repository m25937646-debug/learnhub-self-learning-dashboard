import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";

export const UPLOAD_CHUNK_SIZE_BYTES = 16 * 1024 * 1024;
export const MAX_UPLOAD_PARTS = 10_000;
export const MAX_UPLOAD_SIZE_BYTES = UPLOAD_CHUNK_SIZE_BYTES * MAX_UPLOAD_PARTS;

export class UploadRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UploadRequestError";
  }
}

export function requireUploadContentLength(
  value: string | string[] | undefined,
): number {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header || !/^\d+$/.test(header)) {
    throw new UploadRequestError(
      411,
      "CONTENT_LENGTH_REQUIRED",
      "تعذر تحديد حجم الملف؛ أعد المحاولة من المتصفح.",
    );
  }

  const normalizedSize = header.replace(/^0+/, "") || "0";
  if (normalizedSize === "0") {
    throw new UploadRequestError(400, "EMPTY_FILE", "الملف فارغ.");
  }
  const maxSafeSize = String(Number.MAX_SAFE_INTEGER);
  if (
    normalizedSize.length > maxSafeSize.length ||
    (normalizedSize.length === maxSafeSize.length && normalizedSize > maxSafeSize)
  ) {
    throw new UploadRequestError(
      413,
      "SIZE_OUT_OF_RANGE",
      "حجم الملف يتجاوز المجال الذي تدعمه خدمة النقل.",
    );
  }
  return Number(normalizedSize);
}

export function normalizeUploadContentType(value: string | undefined): string {
  const candidate = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return /^[a-z0-9!#$&^_.+-]{1,64}\/[a-z0-9!#$&^_.+-]{1,64}$/.test(candidate)
    ? candidate
    : "application/octet-stream";
}

export function normalizeUploadFileName(value: unknown): string {
  const candidate = typeof value === "string" ? value : "";
  const leafName = candidate.split(/[\\/]/).pop() || "learning-upload";
  const safeName = leafName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
  return safeName || "learning-upload";
}

export function validateUploadSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new UploadRequestError(400, "INVALID_FILE_SIZE", "تعذر التحقق من حجم الملف.");
  }
  if (value > MAX_UPLOAD_SIZE_BYTES) {
    throw new UploadRequestError(
      413,
      "FILE_TOO_LARGE",
      `الحد التطبيقي الحالي للملف ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 ** 3))} جيجابايت؛ قد تفرض المنصة أو الحصة حدًا أقل.`,
    );
  }
  return value;
}

export function getExpectedUploadPartSize(size: number, index: number): number {
  const partCount = Math.ceil(size / UPLOAD_CHUNK_SIZE_BYTES);
  if (!Number.isSafeInteger(index) || index < 0 || index >= partCount) return -1;
  return Math.min(UPLOAD_CHUNK_SIZE_BYTES, size - index * UPLOAD_CHUNK_SIZE_BYTES);
}

export function buildUserUploadKey(
  userId: number | string,
  encodedFileName: string | undefined,
  now = Date.now(),
  uniqueId = randomUUID(),
): string {
  const owner = String(userId);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(owner)) {
    throw new UploadRequestError(400, "INVALID_OWNER", "تعذر تحديد مالك الملف.");
  }

  let fileName = encodedFileName || "learning-upload";
  try {
    fileName = decodeURIComponent(fileName);
  } catch {
    // A malformed display name must never prevent a safe, randomly named upload.
  }
  const leafName = fileName.split(/[\\/]/).pop() || "learning-upload";
  const extension = /\.([A-Za-z0-9]{1,16})$/.exec(leafName)?.[0]?.toLowerCase() ?? "";
  const safeId = uniqueId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!Number.isSafeInteger(now) || !safeId) {
    throw new UploadRequestError(400, "INVALID_UPLOAD_ID", "تعذر تجهيز اسم آمن للملف.");
  }

  // The original (possibly Arabic) filename is not part of the object path.
  return `${owner}/learning-dashboard/${now}-${safeId}${extension}`;
}

export function isSafeStorageObjectKey(key: unknown): key is string {
  if (typeof key !== "string" || !key || key.length > 512) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(key) || key.includes("\\")) return false;
  return key.split("/").every(segment => Boolean(segment) && segment !== "." && segment !== "..");
}

export function isUserLearningUploadKey(userId: number | string, key: unknown): key is string {
  const owner = String(userId);
  return /^[A-Za-z0-9_-]{1,64}$/.test(owner) &&
    isSafeStorageObjectKey(key) &&
    key.startsWith(`${owner}/learning-dashboard/`) &&
    key.split("/").length === 3;
}

export function buildUploadPartKey(objectKey: string, index: number): string {
  if (!isSafeStorageObjectKey(objectKey) || !Number.isSafeInteger(index) || index < 0 || index >= MAX_UPLOAD_PARTS) {
    throw new UploadRequestError(400, "INVALID_PART_KEY", "تعذر تجهيز جزء آمن من الملف.");
  }
  const key = `${objectKey}.part-${String(index).padStart(5, "0")}`;
  if (!isSafeStorageObjectKey(key)) {
    throw new UploadRequestError(400, "INVALID_PART_KEY", "تعذر تجهيز جزء آمن من الملف.");
  }
  return key;
}

export function createByteCountingStream() {
  let bytesReceived = 0;
  const stream = new Transform({
    transform(chunk: Buffer | string, encoding, callback) {
      bytesReceived += Buffer.isBuffer(chunk)
        ? chunk.byteLength
        : Buffer.byteLength(chunk, encoding);
      callback(null, chunk);
    },
  });

  return {
    stream,
    getBytesReceived: () => bytesReceived,
  };
}
