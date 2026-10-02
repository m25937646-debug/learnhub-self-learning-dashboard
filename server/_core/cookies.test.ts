import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions, readApplicationSessionToken } from "./cookies";

afterEach(() => vi.unstubAllEnvs());

const requestHeaders = (headers: Request["headers"]) => ({ headers });
const secureRequest = (protocol: string, headers: Request["headers"]) => ({
  protocol,
  headers,
});

describe("application session transport", () => {
  it("prefers the regular app session cookie", () => {
    const req = requestHeaders({
      cookie: `${COOKIE_NAME}=cookie-session`,
      "x-webdev-session": "preview-session",
      authorization: "Bearer legacy-session",
    });

    expect(readApplicationSessionToken(req)).toBe("cookie-session");
  });

  it("uses the Preview custom application header when cookies are unavailable", () => {
    const req = requestHeaders({ "x-webdev-session": "  preview-session  " });

    expect(readApplicationSessionToken(req)).toBe("preview-session");
  });

  it("retains the legacy bearer fallback for direct clients", () => {
    const req = requestHeaders({ authorization: "Bearer legacy-session" });

    expect(readApplicationSessionToken(req)).toBe("legacy-session");
  });

  it("returns no session when no supported transport supplied a token", () => {
    expect(readApplicationSessionToken(requestHeaders({}))).toBeUndefined();
  });
});

describe("application session cookie attributes", () => {
  it("allows the secure session cookie in Cloud Preview's cross-site iframe", () => {
    vi.stubEnv("MANUS_PROJECT_ID", "test-project");
    const req = secureRequest("http", {});

    expect(getSessionCookieOptions(req)).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
    });
  });

  it("keeps plain-HTTP local development on a compatible Lax cookie", () => {
    vi.stubEnv("MANUS_PROJECT_ID", "");
    const req = secureRequest("http", {});

    expect(getSessionCookieOptions(req)).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });
});
