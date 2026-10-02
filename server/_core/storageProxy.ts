import type { Express, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { Readable } from "node:stream";
import JSZip from "jszip";
import { getUploadedFileForUser, type UploadedFilePart } from "../db";
import { storageGetSignedUrl } from "../storage";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { buildUploadPartKey, isUserLearningUploadKey, MAX_UPLOAD_PARTS } from "./fileUpload";

const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;
const GENERIC_PREVIEW_MAX_BYTES = 256 * 1024;
const ARCHIVE_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
const ARCHIVE_MAX_ENTRIES = 2000;
const ARCHIVE_MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const PREVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const PREVIEW_CACHE_MAX_ENTRIES = 64;
const previewHtmlCache = new Map<string, { expiresAt: number; html: string }>();
type FileAccessClaims = { fileId: string; userId: number; expiresAt: number };

export function createFileAccessToken(fileId: string, userId: number): string {
  const claims: FileAccessClaims = {
    fileId,
    userId,
    expiresAt: Date.now() + FILE_ACCESS_TOKEN_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", ENV.cookieSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyFileAccessToken(token: unknown): FileAccessClaims | null {
  if (typeof token !== "string") return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !ENV.cookieSecret) return null;
  try {
    const expected = createHmac("sha256", ENV.cookieSecret).update(payload).digest("base64url");
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<FileAccessClaims>;
    const userId = claims.userId;
    const expiresAt = claims.expiresAt;
    if (
      typeof claims.fileId !== "string" || !UPLOAD_ID_PATTERN.test(claims.fileId) ||
      typeof userId !== "number" || !Number.isSafeInteger(userId) || userId <= 0 ||
      typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()
    ) return null;
    return claims as FileAccessClaims;
  } catch {
    return null;
  }
}

async function getAuthenticatedUserId(req: Request): Promise<number | null> {
  try {
    const user = await sdk.authenticateRequest(req);
    return user && !user.isCron && Number.isSafeInteger(user.id) && user.id > 0 ? user.id : null;
  } catch {
    return null;
  }
}

type ByteRange = { start: number; end: number; partial: boolean };

function parseByteRange(header: string | undefined, total: number): ByteRange | null {
  if (!header) return { start: 0, end: Math.max(0, total - 1), partial: false };
  if (total <= 0 || !header.startsWith("bytes=") || header.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, total - suffixLength);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : total - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || end < start) return null;
  return { start, end: Math.min(end, total - 1), partial: true };
}

function isSafeInlineMedia(mime: string): boolean {
  return /^(?:image\/(?:png|jpeg|gif|webp|avif|bmp)|audio\/(?:mpeg|mp4|m4a|x-m4a|ogg|wav|webm|aac|flac)|video\/(?:mp4|ogg|webm|quicktime|x-matroska)|application\/pdf|text\/(?:plain|csv|markdown))$/i.test(mime);
}

function contentTypeForFile(fileName: string, storedType: string): string {
  const normalizedStoredType = storedType.split(";", 1)[0]?.trim().toLowerCase() || "";
  if (normalizedStoredType === "audio/x-m4a" || normalizedStoredType === "audio/m4a") return "audio/mp4";
  if (normalizedStoredType && normalizedStoredType !== "application/octet-stream") return normalizedStoredType;
  const extension = fileName.toLowerCase().split(".").pop() || "";
  const byExtension: Record<string, string> = {
    avif: "image/avif",
    bmp: "image/bmp",
    css: "text/css",
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    md: "text/markdown",
    html: "text/html",
    htm: "text/html",
    json: "application/json",
    xml: "application/xml",
    yaml: "application/yaml",
    yml: "application/yaml",
    js: "text/javascript",
    ts: "text/typescript",
    jsx: "text/jsx",
    tsx: "text/tsx",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    zip: "application/zip",
  };
  return byExtension[extension] || normalizedStoredType || "application/octet-stream";
}

function contentDisposition(name: string, inline: boolean): string {
  const fallback = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) || "download";
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, character => entities[character]);
}

async function readPreviewPrefix(partKey: string, maxBytes: number): Promise<Buffer> {
  if (maxBytes <= 0) return Buffer.alloc(0);
  const signedUrl = await storageGetSignedUrl(partKey);
  const upstream = await fetch(signedUrl, { headers: { Range: `bytes=0-${maxBytes - 1}` } });
  if (!upstream.ok || !upstream.body) throw new Error(`FILE_PREVIEW_READ_${upstream.status}`);

  const stream = Readable.fromWeb(upstream.body as any);
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const rawChunk of stream) {
      const buffer = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      const take = Math.min(buffer.length, maxBytes - total);
      if (take > 0) {
        chunks.push(buffer.subarray(0, take));
        total += take;
      }
      if (total >= maxBytes) {
        stream.destroy();
        break;
      }
    }
  } finally {
    stream.destroy();
  }
  return Buffer.concat(chunks, total);
}

async function readUploadedPreviewBytes(
  parts: Map<number, UploadedFilePart>,
  file: { size: number; chunkSize: number; partCount: number },
  maxBytes: number,
): Promise<Buffer> {
  const limit = Math.min(file.size, maxBytes);
  const chunks: Buffer[] = [];
  let total = 0;
  for (let index = 0; index < file.partCount && total < limit; index += 1) {
    const part = parts.get(index);
    if (!part) throw new Error("FILE_PART_MISSING");
    const signedUrl = await storageGetSignedUrl(part.key);
    const upstream = await fetch(signedUrl);
    if (!upstream.ok || !upstream.body) throw new Error(`FILE_PART_READ_${upstream.status}`);
    const stream = Readable.fromWeb(upstream.body as any);
    try {
      for await (const rawChunk of stream) {
        const buffer = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
        const take = Math.min(buffer.length, limit - total);
        if (take > 0) {
          chunks.push(buffer.subarray(0, take));
          total += take;
        }
        if (total >= limit) {
          stream.destroy();
          break;
        }
      }
    } finally {
      stream.destroy();
    }
  }
  return Buffer.concat(chunks, total);
}

function textFromPreviewSample(sample: Buffer): string | null {
  if (!sample.length) return "";
  if (sample.includes(0)) return null;
  let controls = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const byte = sample[index];
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) controls += 1;
  }
  return controls / sample.length > 0.02 ? null : sample.toString("utf8");
}

function hexPreview(sample: Buffer): string {
  const shown = sample.subarray(0, 256);
  const rows: string[] = [];
  for (let offset = 0; offset < shown.length; offset += 16) {
    const row = shown.subarray(offset, Math.min(offset + 16, shown.length));
    const hex = Array.from(row, byte => byte.toString(16).padStart(2, "0")).join(" ");
    const text = Array.from(row, byte => byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".").join("");
    rows.push(`${offset.toString(16).padStart(8, "0")}  ${hex.padEnd(47, " ")}  ${text}`);
  }
  return rows.join("\n") || "(لا توجد بايتات لعرضها)";
}

function decodeXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function xmlTexts(xml: string): string[] {
  return Array.from(xml.matchAll(/<(?:w:t|a:t|text:p|text:h|t)[^>]*>([\s\S]*?)<\/(?:w:t|a:t|text:p|text:h|t)>/gi), match => decodeXml(match[1] || "").trim())
    .filter(Boolean);
}

async function officePreview(sample: Buffer, fileName: string): Promise<{ text: string; note: string } | null> {
  if (sample.length < 4 || sample[0] !== 0x50 || sample[1] !== 0x4b) return null;
  try {
    const zip = await JSZip.loadAsync(sample);
    const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
    if (names.length > ARCHIVE_MAX_ENTRIES) return { text: "الأرشيف يحتوي على عدد ملفات كبير جدًا للمعاينة الآمنة.", note: "تم إيقاف فك الأرشيف لحماية الذاكرة؛ لم يتم تشغيل أو تنزيل أي ملف." };
    let declaredUncompressedBytes = 0;
    for (const name of names) {
      const entry = zip.files[name] as unknown as { _data?: { uncompressedSize?: number } };
      const size = Number(entry._data?.uncompressedSize || 0);
      if (Number.isSafeInteger(size) && size > 0) {
        declaredUncompressedBytes += size;
        if (declaredUncompressedBytes > ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
          return { text: "الأرشيف أكبر من الحد المسموح للمعاينة الآمنة.", note: "تم منع فك محتوى مضغوط كبير أو مشبوه لحماية التطبيق." };
        }
      }
    }
    const lowerName = fileName.toLowerCase();
    const read = async (name: string) => {
      const entry = zip.file(name);
      const declaredSize = Number((entry as unknown as { _data?: { uncompressedSize?: number } } | null)?._data?.uncompressedSize || 0);
      if (declaredSize > ARCHIVE_MAX_UNCOMPRESSED_BYTES) return "";
      return entry ? entry.async("string") : "";
    };

    if (lowerName.endsWith(".docx")) {
      const xml = await read("word/document.xml");
      const text = xmlTexts(xml).join("\n");
      return { text: text || "لم يتم العثور على نص قابل للعرض داخل مستند Word.", note: "معاينة نصية آمنة لمحتوى مستند Word؛ التنسيق والصور غير النصية لا تُنفّذ." };
    }
    if (lowerName.endsWith(".pptx")) {
      const slides = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort();
      const text = (await Promise.all(slides.map(async (name, index) => {
        const values = xmlTexts(await read(name));
        return values.length ? `شريحة ${index + 1}\n${values.join(" ")}` : "";
      }))).filter(Boolean).join("\n\n");
      return { text: text || "لم يتم العثور على نص قابل للعرض داخل العرض التقديمي.", note: "معاينة نصية آمنة لنصوص شرائح PowerPoint." };
    }
    if (lowerName.endsWith(".xlsx")) {
      const sharedXml = await read("xl/sharedStrings.xml");
      const shared = xmlTexts(sharedXml);
      const sheets = names.filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort();
      const rows: string[] = [];
      for (const sheet of sheets) {
        const xml = await read(sheet);
        for (const row of Array.from(xml.matchAll(/<row\b[\s\S]*?<\/row>/gi))) {
          const cells: string[] = [];
          for (const cell of Array.from(row[0].matchAll(/<c\b([^>]*)>[\s\S]*?<v>([\s\S]*?)<\/v>[\s\S]*?<\/c>/gi))) {
            const value = decodeXml(cell[2] || "");
            cells.push(/\bt="s"/i.test(cell[1] || "") ? (shared[Number(value)] || value) : value);
          }
          if (cells.length) rows.push(cells.join("\t"));
        }
      }
      return { text: rows.join("\n") || "لم يتم العثور على صفوف قابلة للعرض داخل جدول Excel.", note: "معاينة نصية آمنة لخلايا Excel؛ الصيغ والتنسيق لا تُنفّذ." };
    }
    if (/\.(?:odt|ods|odp)$/i.test(lowerName)) {
      const xml = await read("content.xml");
      return { text: xmlTexts(xml).join("\n") || "لم يتم العثور على نص داخل مستند OpenDocument.", note: "معاينة نصية آمنة لمحتوى OpenDocument." };
    }
    if (/\.zip$/i.test(lowerName) || names.length > 0) {
      return { text: names.map(name => `• ${name}`).join("\n") || "الأرشيف فارغ.", note: "معاينة آمنة لقائمة محتويات الأرشيف؛ لا يتم تشغيل أي ملف بداخله." };
    }
  } catch {
    // A truncated or malformed archive falls through to the safe binary view.
  }
  return null;
}

async function sendUniversalPreview(res: Response, cacheKey: string, fileName: string, contentType: string, fileSize: number, sample: Buffer) {
  const cached = previewHtmlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.status(200);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Content-Length", String(Buffer.byteLength(cached.html)));
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.end(cached.html);
    return;
  }
  const text = textFromPreviewSample(sample);
  const office = await officePreview(sample, fileName);
  const isText = office ? true : text !== null;
  const previewText = office?.text || text || hexPreview(sample);
  const preview = escapeHtml(previewText || "(الملف فارغ)");
  const previewNote = office?.note || (isText
    ? "معاينة نصية آمنة لمحتوى الملف."
    : "لا يمكن تشغيل هذا التنسيق داخل المتصفح؛ عُرضت معاينة تقنية آمنة للبايتات الأولى دون تنزيل.");
  const sampleSize = Math.min(sample.length, isText ? GENERIC_PREVIEW_MAX_BYTES : 256);
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>معاينة ${escapeHtml(fileName)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:24px;background:#0b1220;color:#e5e7eb;font:16px system-ui,sans-serif}.card{width:min(1000px,100%);margin:0 auto;padding:24px;border:1px solid #334155;border-radius:18px;background:#111827;line-height:1.8}h1{margin:0 0 12px;color:#44e0c2;font-size:20px;overflow-wrap:anywhere}.meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:#a7b0bf;font-size:13px}.note{margin:16px 0 8px;color:#cbd5e1;font-size:13px}pre{max-height:70vh;overflow:auto;margin:0;padding:16px;border:1px solid #334155;border-radius:12px;background:#08111f;color:#e5e7eb;white-space:pre-wrap;overflow-wrap:anywhere;direction:auto;font:13px/1.65 ui-monospace,monospace}.hex{direction:ltr;white-space:pre}</style></head><body><main class="card"><h1>${escapeHtml(fileName)}</h1><div class="meta"><span>النوع: ${escapeHtml(contentType || "غير معروف")}</span><span>الحجم: ${fileSize.toLocaleString("en-US")} بايت</span></div><p class="note">${previewNote}${fileSize > sampleSize ? ` عُرضت عينة من ${sampleSize.toLocaleString("en-US")} بايت فقط.` : ""}</p><pre class="${isText ? "text" : "hex"}">${preview}</pre></main></body></html>`;
  previewHtmlCache.set(cacheKey, { expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS, html });
  while (previewHtmlCache.size > PREVIEW_CACHE_MAX_ENTRIES) {
    const oldest = previewHtmlCache.keys().next().value;
    if (oldest) previewHtmlCache.delete(oldest);
    else break;
  }
  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Content-Length", String(Buffer.byteLength(html)));
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(html);
}

function sendPreviewNotice(res: Response, status: number, title: string, message: string, fileName = "الملف") {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>${escapeHtml(title)}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0b1220;color:#e5e7eb;font:16px system-ui,sans-serif}.card{width:min(640px,100%);padding:24px;border:1px solid #334155;border-radius:18px;background:#111827;line-height:1.8}h1{margin:0 0 10px;color:#44e0c2;font-size:20px}.file{margin-top:14px;color:#a7b0bf;font-size:13px;overflow-wrap:anywhere}</style></head><body><main class="card"><h1>${escapeHtml(title)}</h1><div>${escapeHtml(message)}</div><div class="file">${escapeHtml(fileName)}</div></main></body></html>`;
  clearDownloadHeaders(res);
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Content-Length", String(Buffer.byteLength(html)));
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(html);
}

function clearDownloadHeaders(res: Response) {
  for (const header of ["Content-Type", "Content-Length", "Content-Disposition", "Content-Range", "Accept-Ranges"]) {
    res.removeHeader(header);
  }
}

function fail(res: Response, status: number, message: string) {
  if (res.headersSent || res.destroyed) {
    res.destroy();
    return;
  }
  clearDownloadHeaders(res);
  res.status(status).json({ message });
}

function respondToFileError(res: Response, status: number, message: string, previewMode: boolean, fileName?: string) {
  if (previewMode && !res.headersSent && !res.destroyed) {
    sendPreviewNotice(res, status, "تعذر فتح الملف", message, fileName);
    return;
  }
  fail(res, status, message);
}

export function registerStorageFileRoutes(app: Express) {
  // The platform owns /manus-storage/*; this app route serves only files in its
  // owner-indexed table and never returns the temporary CDN URL to the browser.
  app.post("/api/storage/file-access", async (req: Request, res: Response) => {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ message: "سجّل الدخول لفتح هذا الملف." });
      return;
    }
    const id = req.body?.id;
    if (typeof id !== "string" || !UPLOAD_ID_PATTERN.test(id)) {
      res.status(400).json({ message: "معرّف الملف غير صالح." });
      return;
    }
    try {
      const file = await getUploadedFileForUser(id, userId);
      if (!file || file.status !== "complete") {
        res.status(404).json({ message: "الملف غير موجود في حسابك." });
        return;
      }
      const accessToken = createFileAccessToken(id, userId);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ url: `/api/storage/file/${id}?accessToken=${encodeURIComponent(accessToken)}` });
    } catch {
      res.status(503).json({ message: "تعذر تجهيز رابط فتح الملف الآن؛ أعد المحاولة." });
    }
  });

  app.get("/api/storage/file/:id", async (req: Request, res: Response) => {
    const id = req.params.id;
    const previewMode = req.query.view === "1";
    const rawMode = req.query.raw === "1" || req.query.download === "1";
    if (!UPLOAD_ID_PATTERN.test(id)) {
      if (previewMode) sendPreviewNotice(res, 404, "الملف غير متاح", "رابط الملف غير صالح.");
      else res.status(404).end();
      return;
    }
    const tokenClaims = verifyFileAccessToken(req.query.accessToken);
    const userId = tokenClaims?.fileId === id ? tokenClaims.userId : await getAuthenticatedUserId(req);
    if (!userId) {
      respondToFileError(res, 401, "سجّل الدخول لفتح هذا الملف.", previewMode);
      return;
    }

    try {
      const file = await getUploadedFileForUser(id, userId);
      if (!file || file.status !== "complete") {
        respondToFileError(res, 404, "الملف المحفوظ غير موجود في هذا الحساب.", previewMode);
        return;
      }

      const parts = (Array.isArray(file.parts) ? file.parts : []) as UploadedFilePart[];
      if (
        !Number.isSafeInteger(file.size) || file.size < 0 ||
        !Number.isSafeInteger(file.chunkSize) || file.chunkSize <= 0 ||
        !Number.isSafeInteger(file.partCount) || file.partCount < 0 || file.partCount > MAX_UPLOAD_PARTS ||
        parts.length !== file.partCount
      ) {
        respondToFileError(res, 500, "تعذر التحقق من سجل الملف.", previewMode, file.originalName);
        return;
      }

      const partByIndex = new Map<number, UploadedFilePart>();
      for (const part of parts) {
        if (
          !Number.isSafeInteger(part.index) || part.index < 0 || part.index >= file.partCount ||
          part.key !== buildUploadPartKey(file.objectKey, part.index) ||
          !isUserLearningUploadKey(userId, part.key) ||
          !Number.isSafeInteger(part.size) || part.size < 0
        ) {
          respondToFileError(res, 500, "تعذر التحقق من أجزاء الملف.", previewMode, file.originalName);
          return;
        }
        partByIndex.set(part.index, part);
      }
      if (partByIndex.size !== file.partCount) {
        respondToFileError(res, 500, "سجل أجزاء الملف غير مكتمل.", previewMode, file.originalName);
        return;
      }

      const range = parseByteRange(req.header("range"), file.size);
      if (!range) {
        if (previewMode) {
          sendPreviewNotice(res, 416, "تعذر فتح الملف", "تعذر قراءة نطاق الملف المطلوب.", file.originalName);
          return;
        }
        res.setHeader("Content-Range", `bytes */${file.size}`);
        res.status(416).end();
        return;
      }

      const contentType = contentTypeForFile(file.originalName, file.contentType);
      // Supported documents/media are always served inline. The `view=1` query
      // is retained by the UI as an explicit display intent, while the allow-list
      // prevents unsafe content types from being rendered as active HTML.
      const inline = !rawMode && isSafeInlineMedia(contentType);
      if (previewMode && !rawMode && !inline) {
        const firstPart = partByIndex.get(0);
        if (file.size > 0 && !firstPart) {
          respondToFileError(res, 500, "تعذر تجهيز معاينة الملف.", previewMode, file.originalName);
          return;
        }
        const archiveLike = /^application\/(?:zip|vnd\.openxmlformats-officedocument|vnd\.oasis\.opendocument)/i.test(contentType)
          || /\.(?:zip|docx|xlsx|pptx|odt|ods|odp)$/i.test(file.originalName);
        const sample = archiveLike
          ? await readUploadedPreviewBytes(partByIndex, file, ARCHIVE_PREVIEW_MAX_BYTES)
          : firstPart
            ? await readPreviewPrefix(firstPart.key, Math.min(file.size, GENERIC_PREVIEW_MAX_BYTES))
            : Buffer.alloc(0);
        await sendUniversalPreview(res, `${id}:${file.originalName}:${contentType}:${file.size}`, file.originalName, contentType, file.size, sample);
        return;
      }
      res.status(range.partial ? 206 : 200);
      // `raw=1` is used by the universal client viewer. It keeps the original
      // bytes available for local inspection while forcing attachment semantics
      // if somebody opens the URL directly in a browser tab.
      res.setHeader("Content-Type", rawMode ? contentType : inline ? contentType : "application/octet-stream");
      res.setHeader("Content-Disposition", contentDisposition(file.originalName, rawMode ? false : inline));
      res.setHeader("Content-Length", String(file.size === 0 ? 0 : range.end - range.start + 1));
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (range.partial) res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);
      if (file.size === 0) {
        res.end();
        return;
      }

      const firstPart = Math.floor(range.start / file.chunkSize);
      const lastPart = Math.floor(range.end / file.chunkSize);
      for (let index = firstPart; index <= lastPart; index += 1) {
        if (res.destroyed) return;
        const part = partByIndex.get(index);
        if (!part) throw new Error("FILE_PART_MISSING");
        const expectedPartSize = Math.min(file.chunkSize, file.size - index * file.chunkSize);
        if (part.size !== expectedPartSize) throw new Error("FILE_PART_SIZE_MISMATCH");

        const signedUrl = await storageGetSignedUrl(part.key);
        const upstream = await fetch(signedUrl);
        if (!upstream.ok || !upstream.body) throw new Error(`FILE_PART_READ_${upstream.status}`);

        const stream = Readable.fromWeb(upstream.body as any);
        const sliceStart = Math.max(0, range.start - index * file.chunkSize);
        const sliceEndExclusive = Math.min(expectedPartSize, range.end - index * file.chunkSize + 1);
        let cursor = 0;
        for await (const rawChunk of stream) {
          if (res.destroyed) {
            stream.destroy();
            return;
          }
          const buffer = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
          const chunkStart = cursor;
          const chunkEnd = cursor + buffer.length;
          const copyStart = Math.max(chunkStart, sliceStart);
          const copyEnd = Math.min(chunkEnd, sliceEndExclusive);
          if (copyEnd > copyStart) {
            const slice = buffer.subarray(copyStart - chunkStart, copyEnd - chunkStart);
            if (!res.write(slice)) await once(res, "drain");
          }
          cursor = chunkEnd;
          if (cursor >= sliceEndExclusive) {
            stream.destroy();
            break;
          }
        }
        if (cursor < sliceEndExclusive) throw new Error("FILE_PART_TRUNCATED");
      }
      res.end();
    } catch (error) {
      console.error("[Storage] Protected file read failed", error instanceof Error ? error.message : "unknown error");
      respondToFileError(res, 502, "تعذر تحميل الملف المحفوظ الآن؛ أعد المحاولة أو ارفع الملف من جديد.", previewMode);
    }
  });
}
