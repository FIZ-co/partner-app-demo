// Synthetic OAuth/API fixture used only by automated tests. Never mounted by npm start.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { escapeHtml as h } from "../oauth.mjs";
import { shell } from "../views.mjs";

const id = () => randomBytes(12).toString("hex");
const digest = (value) =>
  createHash("sha256").update(value).digest("base64url");

export function createMockServer(config) {
  const pending = new Map(),
    codes = new Map(),
    access = new Set(),
    refresh = new Set(),
    writes = new Map();
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end(JSON.stringify(body));
  };
  const html = (res, body) => {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(config.redirectUri).origin}; base-uri 'none'; frame-ancestors 'none'`,
    });
    res.end(shell(config, body, "Local FIZ simulator"));
  };
  const redirect = (res, location) => {
    res.writeHead(303, { Location: location, "Cache-Control": "no-store" });
    res.end();
  };
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, config.issuer);
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16384)
          return json(res, 413, { error: "request_too_large" });
      }
      const form = new URLSearchParams(body);
      if (req.method === "GET" && url.pathname === "/auth/signup") {
        return html(
          res,
          `<h1>Try a new customer’s journey</h1><p class="notice">This is a local simulation. No account, email, company or AT connection will be created.</p><section class="card"><h2>In FIZ, your customer will:</h2><ol><li>Verify their email and create an account.</li><li>Set up their company.</li><li>Connect AT, or choose Later.</li><li>Return to your registered installation URL, then choose a company and grant access.</li></ol><div class="actions"><a class="button" href="${h(config.baseUrl)}/resume">Simulate signup and return to the app</a></div></section>`,
        );
      }
      if (req.method === "GET" && url.pathname === "/oauth/authorize") {
        const p = url.searchParams;
        if (
          p.get("client_id") !== config.clientId ||
          p.get("redirect_uri") !== config.redirectUri ||
          p.get("resource") !== config.resource ||
          p.get("response_type") !== "code" ||
          p.get("code_challenge_method") !== "S256" ||
          !p.get("state") ||
          !/^[\w-]{43}$/.test(p.get("code_challenge") ?? "") ||
          p.get("scope") !== config.scopes
        )
          return json(res, 400, { error: "invalid_request" });
        const requestId = id();
        pending.set(requestId, {
          state: p.get("state"),
          challenge: p.get("code_challenge"),
          expiresAt: Date.now() + 600000,
        });
        return html(
          res,
          `<h1>Connect the demo to a company</h1><p class="notice">Simulated consent. Production consent is shown by FIZ, never by your application.</p><section class="card"><h2>Example Company</h2><p>This local app asks to read company information and read/write its own invoice drafts, customers and items.</p><p>No fiscal issuance permission is requested.</p><form method="post" action="/decision"><input type="hidden" name="request" value="${requestId}"><div class="actions"><button name="decision" value="allow">Allow demo access</button><button class="secondary" name="decision" value="deny">Cancel</button></div></form></section>`,
        );
      }
      if (req.method === "POST" && url.pathname === "/decision") {
        const request = pending.get(form.get("request"));
        pending.delete(form.get("request"));
        if (!request || request.expiresAt <= Date.now())
          return json(res, 400, { error: "expired_request" });
        const callback = new URL(config.redirectUri);
        callback.searchParams.set("state", request.state);
        callback.searchParams.set("iss", config.issuer);
        if (form.get("decision") === "allow") {
          const code = id();
          codes.set(code, { ...request, expiresAt: Date.now() + 60000 });
          callback.searchParams.set("code", code);
        } else callback.searchParams.set("error", "access_denied");
        return redirect(res, callback.href);
      }
      if (req.method === "POST" && url.pathname === "/oauth/token") {
        if (
          form.get("client_id") !== config.clientId ||
          form.get("client_secret") !== config.secret
        )
          return json(res, 400, { error: "invalid_client" });
        if (form.get("resource") !== config.resource)
          return json(res, 400, { error: "invalid_target" });
        if (form.get("grant_type") === "authorization_code") {
          const code = codes.get(form.get("code"));
          if (
            !code ||
            code.expiresAt <= Date.now() ||
            form.get("redirect_uri") !== config.redirectUri ||
            digest(form.get("code_verifier") ?? "") !== code.challenge
          )
            return json(res, 400, { error: "invalid_grant" });
          codes.delete(form.get("code"));
        } else if (form.get("grant_type") === "refresh_token") {
          if (!refresh.delete(form.get("refresh_token")))
            return json(res, 400, { error: "invalid_grant" });
        } else return json(res, 400, { error: "unsupported_grant_type" });
        const accessToken = id(),
          refreshToken = id();
        access.add(accessToken);
        refresh.add(refreshToken);
        return json(res, 200, {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: "Bearer",
          expires_in: 3600,
          scope: config.scopes,
        });
      }
      if (!access.has(req.headers.authorization?.replace(/^Bearer /, "")))
        return json(res, 401, { error: "invalid_token" });
      if (req.method === "GET" && url.pathname === "/company")
        return json(res, 200, {
          id: "111111111111111111111111",
          name: "Example Company (simulated)",
          cae: ["62010"],
          readiness: {
            ready: false,
            checkedAt: new Date().toISOString(),
            reasons: [
              {
                code: "AT_CREDENTIALS_REQUIRED",
                actionUrl: `${config.appUrl}/auth/signup`,
              },
            ],
          },
        });
      if (
        req.method === "POST" &&
        ["/customers", "/items", "/invoices"].includes(url.pathname)
      ) {
        const key = req.headers["idempotency-key"];
        if (!key || !/^[!-~]{1,128}$/.test(key))
          return json(res, 400, { error: "idempotency_key_required" });
        const namespace = `${url.pathname}:${key}`,
          hash = digest(body),
          previous = writes.get(namespace);
        if (previous)
          return previous.hash !== hash
            ? json(res, 422, { error: "payload_conflict" })
            : json(res, 201, previous.result, {
                "Idempotent-Replayed": "true",
              });
        const payload = JSON.parse(body);
        if (
          url.pathname === "/invoices" &&
          (payload.type !== "INVOICE" ||
            payload.cae !== "62010" ||
            !payload.customerId ||
            !payload.items?.[0]?.id)
        )
          return json(res, 400, { error: "invalid_draft" });
        const result = {
          ...payload,
          id: id(),
          ...(url.pathname === "/invoices" && { status: "DRAFT" }),
          updatedAt: new Date().toISOString(),
        };
        writes.set(namespace, { hash, result });
        return json(res, 201, result);
      }
      json(res, 404, { error: "not_found" });
    } catch {
      json(res, 400, { error: "invalid_request" });
    }
  });
}
