type AssetLike = {
  storageKey?: unknown;
  url?: unknown;
  dataUrl?: unknown;
};

const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_DATA_URL = /^data:[^;,\s]+;base64,[a-z0-9+/=\r\n]+$/i;

function isSafeStableStoragePath(value: string): boolean {
  if (!value.startsWith("/manus-storage/")) return false;
  const key = value.slice("/manus-storage/".length);
  return Boolean(key) && /^[A-Za-z0-9._/-]+$/.test(key) &&
    key.split("/").every(part => Boolean(part) && part !== "." && part !== "..");
}

export function safeAssetUrl(asset: AssetLike | string | null | undefined): string | null {
  if (!asset) return null;
  const record = typeof asset === "object" ? asset : null;
  const key = typeof record?.storageKey === "string" ? record.storageKey : "";
  if (UPLOAD_ID.test(key)) return `/api/storage/file/${key}`;

  const value = typeof asset === "string"
    ? asset.trim()
    : typeof record?.url === "string" && record.url.trim()
      ? record.url.trim()
      : typeof record?.dataUrl === "string"
        ? record.dataUrl.trim()
        : "";
  if (!value) return null;
  if (value.startsWith("/api/storage/file/")) {
    return UPLOAD_ID.test(value.slice("/api/storage/file/".length)) ? value : null;
  }
  if (isSafeStableStoragePath(value)) return value;
  if (SAFE_DATA_URL.test(value)) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "blob:") return parsed.href;
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
