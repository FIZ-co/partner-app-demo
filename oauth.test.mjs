import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { createAuthorization, escapeHtml, validateCallback } from "./oauth.mjs";
const config = {
  issuer: "http://localhost:3000",
  clientId: "fiz_app_synthetic_demo",
  redirectUri: "http://localhost:3100/callback",
  scopes: "company.read invoicing.read",
  resource: "https://api.fiz.co",
};

test("fresh authorization carries S256, state and a fixed redirect/resource", () => {
  const first = createAuthorization(config),
    second = createAuthorization(config);
  const url = new URL(first.url);
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.verifier, second.verifier);
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(first.verifier).digest("base64url"),
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(url.searchParams.get("resource"), config.resource);
});

test("callback requires the browser-bound state, exact issuer and one code", () => {
  const pending = createAuthorization(config);
  const url = new URL(config.redirectUri);
  url.search = new URLSearchParams({
    state: pending.state,
    iss: config.issuer,
    code: "synthetic-code",
  });
  assert.equal(validateCallback(url, pending, config.issuer), "synthetic-code");
  assert.throws(() => validateCallback(url, undefined, config.issuer));
  assert.throws(() =>
    validateCallback(url, { ...pending, expiresAt: 0 }, config.issuer),
  );
  assert.throws(() =>
    validateCallback(url, { ...pending, state: "other-state" }, config.issuer),
  );
  assert.throws(() => validateCallback(url, pending, "https://other.example"));
  url.searchParams.append("code", "second-code");
  assert.throws(() => validateCallback(url, pending, config.issuer));
});

test("escapes API data before displaying HTML", () => {
  assert.equal(escapeHtml("<script>\"&'"), "&lt;script&gt;&quot;&amp;&#39;");
});
