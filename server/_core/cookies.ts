import { parse as parseCookieHeader } from "cookie";
import type { CookieOptions, Request } from "express";
import { COOKIE_NAME } from "../../shared/const";

type SessionRequest = Pick<Request, "headers" | "protocol">;

function isSecureRequest(req: SessionRequest) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return Boolean(process.env.MANUS_PROJECT_ID);

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  // Cloud Preview terminates HTTPS outside the app; its internal request can
  // still appear as HTTP, so the managed-project marker is also authoritative.
  return (
    protoList.some(proto => proto.trim().toLowerCase() === "https") ||
    Boolean(process.env.MANUS_PROJECT_ID)
  );
}

/**
 * Read the app session from its cookie first. Cloud Preview can block cookies in
 * its cross-site iframe and strips Authorization, but forwards custom app
 * headers; the signed token is still fully validated by the SDK either way.
 */
export function readApplicationSessionToken(
  req: Pick<Request, "headers">
): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const cookieToken = cookies[COOKIE_NAME];
  if (cookieToken) return cookieToken;

  const previewToken = req.headers["x-webdev-session"];
  if (typeof previewToken === "string" && previewToken.trim()) {
    return previewToken.trim();
  }

  // Retain the legacy bearer path for direct clients; Cloud Preview removes it.
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const bearerToken = authorization.slice("Bearer ".length).trim();
    if (bearerToken) return bearerToken;
  }

  return undefined;
}

export function getSessionCookieOptions(
  req: SessionRequest
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    // Cloud Preview is HTTPS outside Node and cross-site in the Dashboard.
    // MANUS_PROJECT_ID keeps its cookie Secure even when the proxy sends HTTP.
    // Unmanaged plain-HTTP local development keeps SameSite=Lax.
    sameSite: secure ? "none" : "lax",
    secure,
  };
}
