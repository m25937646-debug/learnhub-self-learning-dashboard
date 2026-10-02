import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  buildUserUploadKey,
  buildUploadPartKey,
  createByteCountingStream,
  getExpectedUploadPartSize,
  isUserLearningUploadKey,
  normalizeUploadContentType,
  normalizeUploadFileName,
  requireUploadContentLength,
  UPLOAD_CHUNK_SIZE_BYTES,
  validateUploadSize,
  UploadRequestError,
} from "./fileUpload";

describe("large file upload framing", () => {
  it("accepts large finite uploads without the former 250 MiB application cap", () => {
    expect(requireUploadContentLength("4294967296")).toBe(4_294_967_296);
  });

  it("rejects missing, empty and unsafe request lengths", () => {
    expect(() => requireUploadContentLength(undefined)).toThrow(UploadRequestError);
    expect(() => requireUploadContentLength("0")).toThrow("الملف فارغ");
    expect(() => requireUploadContentLength("9007199254740992")).toThrow(
      "المجال الذي تدعمه خدمة النقل",
    );
  });

  it("uses a high-entropy ASCII object key for Arabic filenames", () => {
    const key = buildUserUploadKey(
      42,
      encodeURIComponent("محاضرة تعليمية.pdf"),
      1_700_000_000_000,
      "123e4567-e89b-12d3-a456-426614174000",
    );

    expect(key).toBe(
      "42/learning-dashboard/1700000000000-123e4567-e89b-12d3-a456-426614174000.pdf",
    );
    expect(key).toMatch(/^[\x21-\x7e]+$/);
  });

  it("splits very large files into bounded parts without an old 250 MiB cap", () => {
    const size = 2 * 1024 * 1024 * 1024 + 1;
    expect(validateUploadSize(size)).toBe(size);
    expect(getExpectedUploadPartSize(size, 0)).toBe(UPLOAD_CHUNK_SIZE_BYTES);
    expect(getExpectedUploadPartSize(size, 127)).toBe(UPLOAD_CHUNK_SIZE_BYTES);
    expect(getExpectedUploadPartSize(size, 128)).toBe(1);
  });

  it("creates owner-scoped, traversal-safe keys for chunked objects", () => {
    const base = "42/learning-dashboard/1700000000000-123e4567-e89b-12d3-a456-426614174000.pdf";
    expect(isUserLearningUploadKey(42, base)).toBe(true);
    expect(isUserLearningUploadKey(99, base)).toBe(false);
    expect(isUserLearningUploadKey(42, "42/learning-dashboard/../secret")).toBe(false);
    expect(buildUploadPartKey(base, 3)).toBe(`${base}.part-00003`);
  });

  it("normalizes uploaded display names without changing the file extension", () => {
    expect(normalizeUploadFileName("C:\\private\\محاضرة\r\n.pdf")).toBe("محاضرة.pdf");
  });

  it("keeps valid media types and falls back for unsafe MIME headers", () => {
    expect(normalizeUploadContentType("image/jpeg; charset=utf-8")).toBe("image/jpeg");
    expect(normalizeUploadContentType("text/html\r\nX-Evil: yes")).toBe(
      "application/octet-stream",
    );
  });

  it("counts bytes while passing the original chunks through a stream", async () => {
    const counted = createByteCountingStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      counted.stream.on("data", chunk => chunks.push(Buffer.from(chunk)));
      counted.stream.once("end", resolve);
      counted.stream.once("error", reject);
      Readable.from([Buffer.from("large "), Buffer.from("file")]).pipe(counted.stream);
    });

    expect(Buffer.concat(chunks).toString("utf8")).toBe("large file");
    expect(counted.getBytesReceived()).toBe(10);
  });
});
