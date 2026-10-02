import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

type OAuthConfig = { appId: string; oauthPortalUrl: string };

let oauthConfigPromise: Promise<OAuthConfig> | null = null;

async function loadOAuthConfig(): Promise<OAuthConfig> {
  const buildConfig = {
    appId: import.meta.env.VITE_APP_ID || "",
    oauthPortalUrl: import.meta.env.VITE_OAUTH_PORTAL_URL || "",
  };
  if (buildConfig.appId && buildConfig.oauthPortalUrl) return buildConfig;
  if (oauthConfigPromise) return oauthConfigPromise;

  oauthConfigPromise = fetch("/api/oauth/config", {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then(async response => {
      const runtimeConfig = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`OAuth config request failed (${response.status})`);
      }
      return {
        appId: buildConfig.appId || (typeof runtimeConfig?.appId === "string" ? runtimeConfig.appId : ""),
        oauthPortalUrl: buildConfig.oauthPortalUrl || (typeof runtimeConfig?.oauthPortalUrl === "string" ? runtimeConfig.oauthPortalUrl : ""),
      };
    })
    .catch(() => buildConfig);
  return oauthConfigPromise;
}

// Start the Manus OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns a Promise because the public runtime
// configuration may be loaded from the server when build-time values are absent.
export const startLogin = async () => {
  let config: OAuthConfig;
  try {
    config = await loadOAuthConfig();
  } catch (error) {
    console.error("[OAuth] Could not load runtime configuration", error);
    window.dispatchEvent(
      new CustomEvent("app-toast", {
        detail: "تعذر الوصول إلى إعدادات تسجيل الدخول من الخادم. أعد تحميل الصفحة وحاول مرة أخرى.",
      }),
    );
    return;
  }
  const { oauthPortalUrl, appId } = config;
  if (!oauthPortalUrl || !appId) {
    console.info("[OAuth] Preview guest mode: platform login is unavailable until the managed runtime is configured.", {
      hasAppId: Boolean(appId),
      hasPortalUrl: Boolean(oauthPortalUrl),
    });
    window.dispatchEvent(
      new CustomEvent("app-toast", {
        detail: "المعاينة تعمل بوضع الزائر. سيتم تفعيل تسجيل الدخول تلقائيًا بعد نشر الموقع بإعدادات المنصة.",
      }),
    );
    return;
  }
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  const nonce = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Lax is sufficient for the top-level OAuth GET callback and works in
  // Safari/WebViews that block SameSite=None cookies during cross-site login.
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=Lax; Secure`;
  const stateCookieWasSet = document.cookie
    .split("; ")
    .some(cookie => cookie.startsWith(`${OAUTH_STATE_COOKIE}=`));
  if (!stateCookieWasSet) {
    window.dispatchEvent(
      new CustomEvent("app-toast", {
        detail: "تعذر بدء تسجيل الدخول لأن المتصفح منع ملف جلسة الدخول. افتح الموقع في نافذة عادية ثم حاول مرة أخرى.",
      }),
    );
    return;
  }
  const state = encodeOAuthState({ redirectUri, nonce });

  const url = new URL("app-auth", oauthPortalUrl.endsWith("/") ? oauthPortalUrl : `${oauthPortalUrl}/`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("responseType", "code");

  // OAuth pages must be top-level pages. Opening the provider in a separate
  // tab avoids the blank screen caused by the cross-site Preview iframe.
  const authWindow = window.open(url.toString(), "_blank", "noopener,noreferrer");
  if (authWindow) {
    authWindow.focus();
  } else {
    // Fallback for browsers that block popups even when initiated by a click.
    window.location.assign(url.toString());
  }
};
