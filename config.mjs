const origin = (value, name) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(`${name} must be an HTTPS origin (local HTTP is allowed).`);
  return url.origin;
};

export const DEMO_SCOPES = "company.read invoicing.read invoicing.write";

export function readConfig(env = process.env) {
  if (env.NODE_ENV === "production")
    throw new Error(
      "This local example uses memory storage. Add durable storage and app authentication before hosting it as a production service.",
    );
  if (env.DEMO_MODE || env.MOCK_PORT)
    throw new Error(
      "Remove DEMO_MODE and MOCK_PORT from .env. The app now connects directly to production FIZ.",
    );
  const port = Number(env.PORT ?? 3100);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("PORT must be an integer from 1024 to 65535.");
  const baseUrl = origin(
    env.DEMO_BASE_URL ?? `http://localhost:${port}`,
    "DEMO_BASE_URL",
  );
  const appName = env.APP_NAME?.trim() || "Acme Orders";
  if (appName.length > 80)
    throw new Error("APP_NAME must be at most 80 characters.");
  const credentials = ["FIZ_APP_ID", "FIZ_CLIENT_ID", "FIZ_CLIENT_SECRET"];
  for (const name of credentials)
    if (env[name] && env[name] !== env[name].trim())
      throw new Error(`Set ${name} in .env without surrounding whitespace.`);
  if (env.FIZ_APP_ID && !/^[a-f\d]{24}$/i.test(env.FIZ_APP_ID))
    throw new Error(
      "FIZ_APP_ID is the 24-character registry ID, not the client ID.",
    );
  if (env.FIZ_CLIENT_ID && !env.FIZ_CLIENT_ID.startsWith("fiz_app_"))
    throw new Error(
      "FIZ_CLIENT_ID must be the registered app client ID (fiz_app_…).",
    );
  const missingCredentials = credentials.filter((name) => !env[name]);
  return {
    appName,
    port,
    baseUrl,
    redirectUri: `${baseUrl}/callback`,
    scopes: DEMO_SCOPES,
    appUrl: origin(env.FIZ_APP_URL || "https://app.fiz.co", "FIZ_APP_URL"),
    issuer: origin(
      env.FIZ_OAUTH_ISSUER || "https://api.fiz.co",
      "FIZ_OAUTH_ISSUER",
    ),
    api: origin(env.FIZ_API_URL || "https://api.fiz.co", "FIZ_API_URL"),
    resource: origin(
      env.FIZ_OAUTH_RESOURCE || "https://api.fiz.co",
      "FIZ_OAUTH_RESOURCE",
    ),
    appId: env.FIZ_APP_ID,
    clientId: env.FIZ_CLIENT_ID,
    secret: env.FIZ_CLIENT_SECRET,
    missingCredentials,
    configured: missingCredentials.length === 0,
  };
}
