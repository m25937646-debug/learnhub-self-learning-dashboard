import { getSessionHeaders } from "@/lib/session-headers";

const PROTECTED_FILE_PATH = /^\/api\/storage\/file\/[0-9a-f-]+$/i;

function notify(detail: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-toast", { detail }));
  }
}

export function isProtectedAssetUrl(url: unknown): boolean {
  if (!url || typeof window === "undefined") return false;
  try {
    const parsed = new URL(String(url), window.location.href);
    return parsed.origin === window.location.origin && PROTECTED_FILE_PATH.test(parsed.pathname);
  } catch {
    return false;
  }
}

export async function getProtectedFileUrl(absoluteUrl: string): Promise<string> {
  const parsed = new URL(absoluteUrl, window.location.href);
  const id = parsed.pathname.slice("/api/storage/file/".length);
  const response = await fetch("/api/storage/file-access", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getSessionHeaders() },
    body: JSON.stringify({ id }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.url !== "string") {
    throw new Error(payload?.message || "تعذر تجهيز الملف؛ سجّل الدخول أو تحقق من صلاحيته.");
  }
  const accessUrl = new URL(payload.url, window.location.href);
  accessUrl.searchParams.set("view", "1");
  return accessUrl.href;
}

/** Resolve protected uploads to an owner-bound URL suitable for media elements. */
export async function resolveAssetPreviewUrl(url: string): Promise<string> {
  const absoluteUrl = new URL(String(url), window.location.href).href;
  return isProtectedAssetUrl(absoluteUrl) ? getProtectedFileUrl(absoluteUrl) : absoluteUrl;
}

/**
 * Open the shared in-page viewer. The App shell listens for this event, so no
 * popup, blank tab, or second navigation is involved in the click path.
 */
export async function openAssetInNewTab(url: unknown, name?: string, mime?: string): Promise<void> {
  if (!url || typeof window === "undefined") return;
  try {
    const absoluteUrl = new URL(String(url), window.location.href).href;
    window.dispatchEvent(new CustomEvent("learnhub:preview-file", {
      detail: { url: absoluteUrl, name: name || "معاينة الملف", mime: mime || "" },
    }));
  } catch {
    notify("رابط الملف غير صالح.");
  }
}
