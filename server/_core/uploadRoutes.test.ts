import express, { type Express } from "express";
import JSZip from "jszip";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../db";
import * as storage from "../storage";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { registerStorageFileRoutes } from "./storageProxy";
import { registerUploadRoutes } from "./uploadRoutes";

vi.mock("../db", () => ({
  addUploadedFilePart: vi.fn(),
  completeUploadedFile: vi.fn(),
  createUploadedFile: vi.fn(),
  getUploadedFileForUser: vi.fn(),
  listUploadedFiles: vi.fn(),
}));

vi.mock("../storage", () => ({
  storageGetSignedUrl: vi.fn(),
  storagePrepareUploadAtKey: vi.fn(),
  storagePutStream: vi.fn(),
}));

const user = {
  id: 42,
  openId: "upload-test-user",
  name: "Test user",
  email: null,
  loginMethod: null,
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};
const uploadId = "123e4567-e89b-42d3-a456-426614174000";
const objectKey = `42/learning-dashboard/1700000000000-${uploadId}.bin`;
const partKey = `${objectKey}.part-00000`;
const payload = Buffer.from("chunked payload");

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: uploadId,
    userId: 42,
    objectKey,
    originalName: "study-notes.bin",
    contentType: "application/octet-stream",
    size: payload.length,
    chunkSize: 16 * 1024 * 1024,
    partCount: 1,
    parts: [{ index: 0, key: partKey, size: payload.length }],
    status: "uploading",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function serve(register: (app: Express) => void) {
  const app = express();
  app.use(express.json());
  register(app);
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No HTTP address");
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(sdk, "authenticateRequest").mockResolvedValue(user as any);
  vi.mocked(storage.storagePrepareUploadAtKey).mockResolvedValue({
    key: partKey,
    url: `/manus-storage/${partKey}`,
    uploadUrl: "https://storage.invalid/signed-put",
  });
  vi.mocked(storage.storagePutStream).mockImplementation(async (_prepared, body) => {
    const received: Buffer[] = [];
    for await (const chunk of body as any) received.push(Buffer.from(chunk));
    expect(Buffer.concat(received)).toEqual(payload);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("owner-indexed chunk upload routes", () => {
  it("rejects an unauthenticated upload before creating a file or requesting storage", async () => {
    vi.spyOn(sdk, "authenticateRequest").mockRejectedValue(new Error("invalid session"));
    const app = await serve(registerUploadRoutes);
    try {
      const response = await fetch(`${app.base}/api/storage/upload/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: "private.bin", contentType: "application/octet-stream", size: 40 }),
      });
      expect(response.status).toBe(401);
      expect(db.createUploadedFile).not.toHaveBeenCalled();
      expect(storage.storagePrepareUploadAtKey).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("registers a 2 GiB file as 128 bounded parts without receiving file bytes", async () => {
    const app = await serve(registerUploadRoutes);
    try {
      const response = await fetch(`${app.base}/api/storage/upload/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: "محاضرة.bin", contentType: "application/octet-stream", size: 2 * 1024 ** 3 }),
      });
      const result = await response.json() as any;
      expect(response.status).toBe(201);
      expect(result.partCount).toBe(128);
      expect(result.chunkSize).toBe(16 * 1024 * 1024);
      const created = vi.mocked(db.createUploadedFile).mock.calls[0][0];
      expect(created.userId).toBe(user.id);
      expect(created.size).toBe(2 * 1024 ** 3);
      expect(created.partCount).toBe(128);
      expect(created.objectKey).toMatch(/^42\/learning-dashboard\//);
      expect(storage.storagePutStream).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("streams a part, records it for its owner, and completes only a full file", async () => {
    const initial = makeFile({ parts: [] });
    vi.mocked(db.getUploadedFileForUser).mockResolvedValue(initial as any);
    vi.mocked(db.addUploadedFilePart).mockResolvedValue(makeFile() as any);
    vi.mocked(db.completeUploadedFile).mockResolvedValue(makeFile({ status: "complete" }) as any);
    const app = await serve(registerUploadRoutes);
    try {
      const partResponse = await fetch(`${app.base}/api/storage/upload/part`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(payload.length),
          "X-Upload-Id": uploadId,
          "X-Part-Index": "0",
        },
        body: payload,
        duplex: "half",
      } as any);
      expect(partResponse.status).toBe(200);
      expect(await partResponse.json()).toEqual({ uploaded: true, partIndex: 0 });
      expect(storage.storagePrepareUploadAtKey).toHaveBeenCalledWith(partKey);
      expect(db.addUploadedFilePart).toHaveBeenCalledWith(uploadId, user.id, {
        index: 0,
        key: partKey,
        size: payload.length,
      });

      vi.mocked(db.getUploadedFileForUser).mockResolvedValue(makeFile() as any);
      const completeResponse = await fetch(`${app.base}/api/storage/upload/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      expect(completeResponse.status).toBe(200);
      expect(await completeResponse.json()).toMatchObject({
        key: uploadId,
        url: `/api/storage/file/${uploadId}`,
        size: payload.length,
      });
    } finally {
      await app.close();
    }
  });

  it("serves a byte range only to the owning user", async () => {
    vi.mocked(db.getUploadedFileForUser).mockResolvedValue(makeFile({ status: "complete" }) as any);
    vi.mocked(storage.storageGetSignedUrl).mockResolvedValue("https://storage.invalid/signed-get");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
      if (String(input).startsWith("https://storage.invalid/")) {
        return new Response(Buffer.from("chunked payload"), { status: 200 });
      }
      return originalFetch(input, init);
    }));
    const app = await serve(registerStorageFileRoutes);
    try {
      const response = await fetch(`${app.base}/api/storage/file/${uploadId}`, {
        headers: { Range: "bytes=2-4" },
      });
      expect(response.status).toBe(206);
      expect(response.headers.get("content-range")).toBe(`bytes 2-4/${payload.length}`);
      expect(await response.text()).toBe("unk");
      expect(storage.storageGetSignedUrl).toHaveBeenCalledWith(partKey);

      vi.mocked(db.getUploadedFileForUser).mockResolvedValue(makeFile({
        status: "complete",
        originalName: "study-notes.pdf",
        contentType: "application/octet-stream",
      }) as any);
      const viewResponse = await fetch(`${app.base}/api/storage/file/${uploadId}?view=1`);
      expect(viewResponse.status).toBe(200);
      expect(viewResponse.headers.get("content-type")).toContain("application/pdf");
      expect(viewResponse.headers.get("content-disposition")).toMatch(/^inline;/);

      vi.mocked(db.getUploadedFileForUser).mockResolvedValue(null as any);
      vi.spyOn(sdk, "authenticateRequest").mockResolvedValue({ ...user, id: 99 } as any);
      const crossUser = await fetch(`${app.base}/api/storage/file/${uploadId}`);
      expect(crossUser.status).toBe(404);
    } finally {
      await app.close();
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("opens a completed file through an owner-bound preview URL without requiring a session in the new tab", async () => {
    const originalCookieSecret = ENV.cookieSecret;
    ENV.cookieSecret = "test-file-preview-secret";
    vi.mocked(db.getUploadedFileForUser).mockResolvedValue(makeFile({
      status: "complete",
      originalName: "study-notes.pdf",
      contentType: "application/pdf",
    }) as any);
    vi.mocked(storage.storageGetSignedUrl).mockResolvedValue("https://storage.invalid/signed-get");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
      if (String(input).startsWith("https://storage.invalid/")) {
        return new Response(payload, { status: 200 });
      }
      return originalFetch(input, init);
    }));
    const app = await serve(registerStorageFileRoutes);
    try {
      const accessResponse = await fetch(`${app.base}/api/storage/file-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: uploadId }),
      });
      expect(accessResponse.status).toBe(200);
      const access = await accessResponse.json() as { url: string };
      const previewUrl = new URL(access.url, `${app.base}/`);
      previewUrl.searchParams.set("view", "1");

      const response = await fetch(previewUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/pdf");
      expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
      expect(await response.text()).toBe("chunked payload");
      expect(sdk.authenticateRequest).toHaveBeenCalledTimes(1);

      const rawUrl = new URL(access.url, `${app.base}/`);
      rawUrl.searchParams.set("raw", "1");
      const rawResponse = await fetch(rawUrl);
      expect(rawResponse.status).toBe(200);
      expect(rawResponse.headers.get("content-type")).toContain("application/pdf");
      expect(rawResponse.headers.get("content-disposition")).toMatch(/^attachment;/);
      expect(await rawResponse.text()).toBe("chunked payload");
    } finally {
      await app.close();
      vi.stubGlobal("fetch", originalFetch);
      ENV.cookieSecret = originalCookieSecret;
    }
  });

  it("previews unsafe HTML as escaped text instead of executing or downloading it", async () => {
    const maliciousText = Buffer.from("<script>alert(1)</script>");
    vi.mocked(db.getUploadedFileForUser).mockResolvedValue(makeFile({
      status: "complete",
      originalName: "<script>alert(1)</script>.html",
      contentType: "text/html",
      size: maliciousText.length,
      parts: [{ index: 0, key: partKey, size: maliciousText.length }],
    }) as any);
    vi.mocked(storage.storageGetSignedUrl).mockResolvedValue("https://storage.invalid/signed-get");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
      if (String(input).startsWith("https://storage.invalid/")) return new Response(maliciousText, { status: 200 });
      return originalFetch(input, init);
    }));
    const app = await serve(registerStorageFileRoutes);
    try {
      const response = await fetch(`${app.base}/api/storage/file/${uploadId}?view=1`);
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(response.headers.get("content-disposition")).toBe("inline");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(storage.storageGetSignedUrl).toHaveBeenCalledWith(partKey);
    } finally {
      await app.close();
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("provides a safe hex preview for arbitrary binary formats", async () => {
    const binaryPayload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x10, 0x20]);
    vi.mocked(db.getUploadedFileForUser).mockResolvedValue(makeFile({
      status: "complete",
      originalName: "archive.unknown",
      contentType: "application/octet-stream",
      size: binaryPayload.length,
      parts: [{ index: 0, key: partKey, size: binaryPayload.length }],
    }) as any);
    vi.mocked(storage.storageGetSignedUrl).mockResolvedValue("https://storage.invalid/signed-get");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
      if (String(input).startsWith("https://storage.invalid/")) return new Response(binaryPayload, { status: 200 });
      return originalFetch(input, init);
    }));
    const app = await serve(registerStorageFileRoutes);
    try {
      const response = await fetch(`${app.base}/api/storage/file/${uploadId}?view=1`);
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toBe("inline");
      expect(html).toContain("archive.unknown");
      expect(html).toContain("50 4b 03 04 00 ff 10 20");
      expect(html).toContain("معاينة تقنية");
    } finally {
      await app.close();
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("renders Office document text inside the preview instead of offering a download", async () => {
    const officePayload = await new JSZip()
      .file("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>محتوى المستند للمعاينة</w:t></w:r></w:p></w:body></w:document>")
      .generateAsync({ type: "nodebuffer" });
    vi.mocked(db.getUploadedFileForUser).mockResolvedValue(makeFile({
      status: "complete",
      originalName: "lesson.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: officePayload.length,
      parts: [{ index: 0, key: partKey, size: officePayload.length }],
    }) as any);
    vi.mocked(storage.storageGetSignedUrl).mockResolvedValue("https://storage.invalid/signed-get");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
      if (String(input).startsWith("https://storage.invalid/")) return new Response(officePayload as any, { status: 200 });
      return originalFetch(input, init);
    }));
    const app = await serve(registerStorageFileRoutes);
    try {
      const response = await fetch(`${app.base}/api/storage/file/${uploadId}?view=1`);
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain("محتوى المستند للمعاينة");
      expect(html).toContain("معاينة نصية آمنة لمحتوى مستند Word");
      expect(html).not.toContain("تنزيل الملف");
    } finally {
      await app.close();
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("previews M4A uploads reported as audio/x-m4a inline as browser-compatible audio/mp4", async () => {
    vi.mocked(db.getUploadedFileForUser).mockResolvedValue(makeFile({
      status: "complete",
      originalName: "إزاي_مساج_الضهر_بيحدد_نجاح_العملية (1).m4a",
      contentType: "audio/x-m4a",
    }) as any);
    vi.mocked(storage.storageGetSignedUrl).mockResolvedValue("https://storage.invalid/signed-get");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
      if (String(input).startsWith("https://storage.invalid/")) {
        return new Response(payload, { status: 200 });
      }
      return originalFetch(input, init);
    }));
    const app = await serve(registerStorageFileRoutes);
    try {
      const response = await fetch(`${app.base}/api/storage/file/${uploadId}?view=1`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("audio/mp4");
      expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
      expect(await response.text()).toBe("chunked payload");
    } finally {
      await app.close();
      vi.stubGlobal("fetch", originalFetch);
    }
  });
});
