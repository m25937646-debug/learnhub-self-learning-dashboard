import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/config", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      appId: ENV.appId,
      oauthPortalUrl: ENV.oAuthPortalUrl,
      configured: Boolean(ENV.appId && ENV.oAuthPortalUrl && ENV.oAuthServerUrl && ENV.cookieSecret),
    });
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const decodedState = decodeOAuthState(state);
    let redirectUri: URL | null = null;
    try {
      redirectUri = new URL(decodedState.redirectUri);
    } catch {
      // The origin/path check below rejects malformed state without throwing.
    }
    if (
      !redirectUri ||
      redirectUri.protocol !== "https:" ||
      redirectUri.pathname !== "/api/oauth/callback" ||
      redirectUri.search
    ) {
      res.status(400).json({ error: "invalid oauth redirect" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodedState;
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    const stateCookieOptions = getSessionCookieOptions(req);
    res.clearCookie(OAUTH_STATE_COOKIE, {
      path: stateCookieOptions.path,
      secure: stateCookieOptions.secure,
      sameSite: stateCookieOptions.sameSite,
    });

    try {
      if (!ENV.appId || !ENV.oAuthServerUrl || !ENV.cookieSecret) {
        res.status(503).json({ error: "OAuth platform configuration is unavailable" });
        return;
      }
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      const databaseError = error as { code?: string; errno?: number; sqlState?: string };
      if (
        databaseError.code === "ER_NO_SUCH_TABLE" ||
        databaseError.errno === 1146 ||
        databaseError.sqlState === "42S02"
      ) {
        res.status(503).json({ error: "Database schema is not ready; migrations must run before login" });
        return;
      }
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
