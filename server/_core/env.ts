/**
 * Runtime configuration.
 *
 * These are getters rather than a snapshot so managed Webdev can inject or
 * rotate values during startup and tests can safely stub process.env. Secrets
 * remain server-only; this module is never imported by browser code.
 */
export const ENV = {
  get appId() { return process.env.MANUS_PROJECT_ID ?? process.env.VITE_APP_ID ?? ""; },
  get cookieSecret() { return process.env.MANUS_JWT_SECRET ?? process.env.JWT_SECRET ?? ""; },
  set cookieSecret(value: string) { process.env.MANUS_JWT_SECRET = value; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get oAuthServerUrl() { return process.env.MANUS_OAUTH_API_URL ?? process.env.OAUTH_SERVER_URL ?? ""; },
  get oAuthPortalUrl() { return process.env.MANUS_OAUTH_PORTAL_URL ?? process.env.VITE_OAUTH_PORTAL_URL ?? ""; },
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get manusApiUrl() { return process.env.MANUS_API_URL ?? ""; },
  get manusApiKey() { return process.env.MANUS_API_KEY ?? ""; },
  get forgeApiUrl() { return process.env.BUILT_IN_FORGE_API_URL ?? ""; },
  get forgeApiKey() { return process.env.BUILT_IN_FORGE_API_KEY ?? ""; },
  get geminiApiKey() { return process.env.GEMINI_API_KEY ?? ""; },
  get geminiModel() { return process.env.GEMINI_MODEL ?? "gemini-flash-latest"; },
};
