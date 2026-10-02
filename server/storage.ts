// Managed object-storage helpers for Manus WebDev.
// Large user uploads are streamed by the trusted server into a presigned PUT.

import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

type PreparedStorageUpload = {
  key: string;
  url: string;
  uploadUrl: string;
};

type PresignResponse = {
  url?: unknown;
  error?: unknown;
};

function getRuntimeApiConfig() {
  // Read the documented runtime variables at call time; never expose the key to
  // browser code or include it in diagnostics.
  const apiUrl = process.env.MANUS_API_URL?.trim().replace(/\/+$/, "") ?? "";
  const apiKey = process.env.MANUS_API_KEY ?? "";
  if (!apiUrl || !apiKey) {
    throw new Error("Managed storage runtime credentials are unavailable.");
  }
  return { apiUrl, apiKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function requireSafeStorageKey(key: string): void {
  if (
    !key ||
    /[^\x21-\x7e]/.test(key) ||
    key.includes("\\") ||
    key.split("/").some(segment => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Storage object path must be a safe ASCII path.");
  }
}

function appendRandomSuffix(relKey: string): string {
  const key = normalizeKey(relKey);
  const suffix = randomUUID().replace(/-/g, "");
  const lastDot = key.lastIndexOf(".");
  const uniqueKey = lastDot === -1
    ? `${key}_${suffix}`
    : `${key.slice(0, lastDot)}_${suffix}${key.slice(lastDot)}`;
  requireSafeStorageKey(uniqueKey);
  return uniqueKey;
}

async function requestPresignedUrl(
  operation: "put" | "get",
  key: string,
): Promise<string> {
  requireSafeStorageKey(key);
  const { apiUrl, apiKey } = getRuntimeApiConfig();
  const endpoint = new URL(`v1/storage/presign/${operation}`, `${apiUrl}/`);
  endpoint.searchParams.set("path", key);

  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const result = await response.json().catch(async () => {
    // Consume a non-JSON error body for diagnostics without exposing it.
    await response.text().catch(() => "");
    return null;
  }) as PresignResponse | null;

  if (!response.ok || !result || typeof result.error === "string" || typeof result.url !== "string") {
    throw new Error(`Managed storage presign failed (${response.status}).`);
  }

  const signedUrl = new URL(result.url);
  if (signedUrl.protocol !== "https:") {
    throw new Error("Managed storage returned an invalid transfer URL.");
  }
  return signedUrl.toString();
}

export async function storagePrepareUpload(relKey: string): Promise<PreparedStorageUpload> {
  const key = appendRandomSuffix(relKey);
  const uploadUrl = await requestPresignedUrl("put", key);
  return { key, url: `/manus-storage/${key}`, uploadUrl };
}

/** Use only when the caller already allocated a cryptographically unique key. */
export async function storagePrepareUploadAtKey(relKey: string): Promise<PreparedStorageUpload> {
  const key = normalizeKey(relKey);
  requireSafeStorageKey(key);
  const uploadUrl = await requestPresignedUrl("put", key);
  return { key, url: `/manus-storage/${key}`, uploadUrl };
}

export async function storagePutStream(
  prepared: PreparedStorageUpload,
  body: Readable,
  contentType: string,
  contentLength: number,
): Promise<void> {
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    throw new Error("Invalid streamed upload length.");
  }

  const response = await fetch(prepared.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
    },
    body: body as unknown as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!response.ok) {
    // Do not include the presigned URL or provider response body in the error.
    throw new Error(`Managed storage rejected the file (${response.status}).`);
  }
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const prepared = await storagePrepareUpload(relKey);
  const blob = typeof data === "string"
    ? new Blob([data], { type: contentType })
    : new Blob([data as any], { type: contentType });
  const response = await fetch(prepared.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Managed storage upload failed (${response.status}).`);
  }
  return { key: prepared.key, url: prepared.url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  return requestPresignedUrl("get", normalizeKey(relKey));
}
