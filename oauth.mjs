import { Buffer } from "node:buffer";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createAuthorization(config) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const url = new URL("/oauth/authorize", config.issuer);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    scope: config.scopes,
    resource: config.resource,
  }).toString();
  return {
    state,
    verifier,
    url: url.href,
    expiresAt: Date.now() + 10 * 60_000,
  };
}

export function validateCallback(url, pending, issuer) {
  if (!pending || pending.expiresAt <= Date.now())
    throw new Error("Connection expired. Connect again.");
  for (const key of ["state", "iss"]) {
    if (url.searchParams.getAll(key).length !== 1)
      throw new Error("Invalid OAuth callback.");
  }
  const actual = Buffer.from(url.searchParams.get("state"));
  const expected = Buffer.from(pending.state);
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected) ||
    url.searchParams.get("iss") !== issuer
  ) {
    throw new Error("Invalid OAuth callback.");
  }
  const errors = url.searchParams.getAll("error");
  const codes = url.searchParams.getAll("code");
  if (errors.length === 1 && !codes.length) {
    throw new Error(
      errors[0] === "access_denied"
        ? "Connection cancelled. No new access was granted."
        : "Authorization was refused. Start a new connection.",
    );
  }
  if (errors.length || codes.length !== 1 || !codes[0])
    throw new Error("Invalid OAuth callback.");
  return codes[0];
}

export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

/** Registry app ID is the only partner context sent through signup. OAuth starts later. */
export function createSignupUrl(config) {
  if (!/^[a-f\d]{24}$/i.test(config.appId ?? ""))
    throw new Error("Set FIZ_APP_ID to the application ID shown in FIZ.");
  const url = new URL("/auth/signup", config.appUrl);
  url.searchParams.set(
    "path",
    "/auth/app-return?" + new URLSearchParams({ app: config.appId }),
  );
  return url.href;
}
