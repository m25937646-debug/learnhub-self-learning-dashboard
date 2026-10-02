import { COOKIE_NAME } from "@shared/const";

/**
 * Cloud Preview can block third-party iframe cookies while it forwards custom
 * application headers. Reuse its sessionStorage mirror for non-tRPC requests.
 */
export function getSessionHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem("manus-cookie");
    if (!raw) return {};
    const prefix = `${COOKIE_NAME}=`;
    const pair = raw.split(";").find(value => value.trim().startsWith(prefix));
    const token = pair?.trim().slice(prefix.length);
    return token ? { "X-Webdev-Session": token } : {};
  } catch {
    return {};
  }
}
