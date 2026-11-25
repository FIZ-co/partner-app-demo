import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { Fiz, FizApiError, FizConflictError } from "@fiz-co/sdk";

import {
  createAuthorization,
  createSignupUrl,
  validateCallback,
} from "./oauth.mjs";
import { dashboard, shell, setupPage } from "./views.mjs";
import { order, draftPath } from "./order.mjs";

export function createDemoServer(config, fetchImpl = fetch) {
  const sessions = new Map();
  const cookieName = "fiz_demo_session";
  const sessionTtl = 60 * 60_000;

  async function exchangeToken(parameters) {
    const response = await fetchImpl(new URL("/oauth/token", config.issuer), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...parameters,
        client_id: config.clientId,
        client_secret: config.secret,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Object.assign(
        new Error(`Token exchange refused: ${error.error ?? response.status}`),
        {
          oauthError: error.error,
        },
      );
    }
    const tokens = await response.json();
    const validTokens = [tokens?.access_token, tokens?.refresh_token].every(
      (token) => typeof token === "string" && token.trim().length > 0,
    );
    if (!validTokens)
      throw new Error("Invalid token response.");
    return { ...tokens, expiresAt: Date.now() + tokens.expires_in * 1000 };
  }

  async function accessToken(session) {
    if (session.refreshUncertain)
      throw new Error(
        "Refresh outcome unknown. Reconnect explicitly; do not reuse the old refresh token.",
      );
    if (!session.tokens) throw new Error("Connect your FIZ company first.");
    if (session.tokens.expiresAt > Date.now() + 30_000)
      return session.tokens.access_token;
    // Only one refresh at a time: rotation detects reuse and revokes the grant.
    session.refresh ??= exchangeToken({
      grant_type: "refresh_token",
      refresh_token: session.tokens.refresh_token,
      resource: config.resource,
    })
      .then((tokens) => {
        session.tokens = tokens;
        return tokens.access_token;
      })
      .catch((error) => {
        if (error.oauthError === "invalid_grant") delete session.tokens;
        // A transport failure may have consumed the refresh token: never automatically reuse it.
        if (!error.oauthError) session.refreshUncertain = true;
        throw error;
      })
      .finally(() => {
        delete session.refresh;
      });
    return session.refresh;
  }

  async function clientFor(session) {
    return new Fiz({
      accessToken: await accessToken(session),
      baseUrl: config.api,
      fetch: fetchImpl,
      timeout: 15_000,
      maxRetries: 0, // The user retries the order with its original keys.
    });
  }

  function render(res, session, message = "", status = 200, page) {
    res.writeHead(status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    res.end(page ?? dashboard(config, session, message, status >= 400));
  }

  const server = createServer(async (req, res) => {
    let session = { csrf: "" };
    let writePath;
    try {
      if (
        req.method !== "GET" &&
        !(req.method === "POST" && [draftPath, "/reset"].includes(req.url))
      )
        return render(res, session, "Method not allowed", 405);
      const url = new URL(req.url, config.baseUrl ?? config.redirectUri);
      const id = req.headers.cookie
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1);
      session = id && sessions.get(id);
      if (session && session.expiresAt <= Date.now()) {
        sessions.delete(id);
        session = undefined;
      }
      if (!session && url.pathname === "/callback")
        throw new Error(
          "Browser session missing. Connect again in the same browser.",
        );
      if (!session) {
        const sessionId = randomBytes(32).toString("hex");
        session = {
          expiresAt: Date.now() + sessionTtl,
          csrf: randomBytes(32).toString("hex"),
          requestId: randomBytes(16).toString("hex"),
        };
        sessions.set(sessionId, session);
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${config.redirectUri.startsWith("https:") ? "; Secure" : ""}`,
        );
      }
      if (url.pathname === "/setup")
        return render(res, session, "", 200, setupPage(config));
      if (
        ["/connect", "/resume", "/signup", "/callback", "/company"].includes(
          url.pathname,
        ) &&
        !config.configured
      )
        return render(
          res,
          session,
          "Set up the FIZ integration before connecting an account.",
          503,
          setupPage(config),
        );
      if (url.pathname === "/privacy") {
        return render(
          res,
          session,
          "",
          200,
          shell(
            config,
            '<h1>Data handling</h1><p>This local app keeps your browser session, FIZ tokens, connected company and order’s FIZ record IDs in memory for up to one hour. Restarting clears that memory. An HttpOnly cookie links your browser to the session. Tokens and the client secret stay on the server.</p><p>Connecting uses real FIZ. Creating a draft sends the order customer, service and invoice data to your selected FIZ company, where those records remain after this app stops. You can revoke access in FIZ Settings → Integrations. This example contains no analytics.</p><p>This describes the unmodified local example. Replace it with your own policy before onboarding customers.</p><a href="/">Back to orders</a>',
            "Data handling",
          ),
        );
      }
      if (url.pathname === "/signup") {
        delete session.pending;
        res.writeHead(302, {
          Location: createSignupUrl(config),
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        });
        return res.end();
      }
      // The registered installation URL is /resume. Always start new state + PKCE here.
      if (url.pathname === "/connect" || url.pathname === "/resume") {
        session.pending = createAuthorization(config);
        res.writeHead(302, {
          Location: session.pending.url,
          "Cache-Control": "no-store",
        });
        return res.end();
      }
      if (url.pathname === "/callback") {
        const pending = session.pending;
        const code = validateCallback(url, pending, config.issuer);
        delete session.pending;
        session.tokens = await exchangeToken({
          grant_type: "authorization_code",
          code,
          redirect_uri: config.redirectUri,
          code_verifier: pending.verifier,
          resource: config.resource,
        });
        delete session.refreshUncertain;
        session.companyVerified = false;
        res.writeHead(303, {
          Location: config.resource.endsWith("/mcp") ? "/" : "/company",
          "Cache-Control": "no-store",
        });
        return res.end();
      }
      if (req.method === "POST") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 16_384)
            return render(res, session, "Request too large", 413);
        }
        const form = new URLSearchParams(body);
        if (form.get("csrf") !== session.csrf)
          return render(res, session, "Invalid form token", 403);
        if (url.pathname === "/reset") {
          if (session.writing)
            throw new Error(
              "A write is still in progress. Wait before clearing this session.",
            );
          sessions.delete(id);
          res.writeHead(303, {
            Location: "/",
            "Set-Cookie": `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
            "Cache-Control": "no-store",
          });
          return res.end();
        }
        if (!session.companyVerified)
          throw new Error(
            "View and verify the connected company before creating a draft.",
          );
        if (session.writing)
          throw new Error(
            "A write is already in progress. Wait, then retry the same request.",
          );
        if (session.uncertainWritePath)
          throw new Error(
            `The outcome of POST ${session.uncertainWritePath} is unknown. Check the record in FIZ before resetting this order.`,
          );
        session.writing = true;
        try {
          const fiz = await clientFor(session);
          if (!session.tokens.scope?.split(" ").includes("invoicing.write"))
            throw new Error(
              "Permission to create drafts was not granted. Reconnect and allow draft creation.",
            );
          const key = `order-${order.number}:${session.requestId}`;
          const input = {
            cae: form.get("cae"),
            vatRate: form.get("vatRate"),
          };
          if (!session.company.cae?.includes(input.cae))
            throw new Error("Choose a CAE from the connected company.");
          if (
            !["NORMAL", "INTERMEDIATE", "REDUCED", "EXEMPT"].includes(
              input.vatRate,
            )
          )
            throw new Error("Choose a VAT category.");
          if (input.vatRate === "EXEMPT") {
            input.vatExemptionReason = form.get("vatExemptionReason")?.trim();
            if (!input.vatExemptionReason)
              throw new Error("Supply the applicable exemption code.");
          }
          if (
            session.orderInput &&
            JSON.stringify(session.orderInput) !== JSON.stringify(input)
          )
            throw new Error(
              "This action already started. Keep the same settings to retry it. Reset the example to start a separate order.",
            );
          session.orderInput = input;
          // Persist every successful step. Stable keys also cover a lost HTTP response.
          writePath = "/customers";
          session.orderCustomer ??= await fiz.customers.create(order.customer, {
            idempotencyKey: `${key}:customer`,
          });
          writePath = "/items";
          session.orderItem ??= await fiz.items.create(
            {
              ...order.item,
              vatRate: input.vatRate,
              ...(input.vatExemptionReason && {
                vatExemptionReason: input.vatExemptionReason,
              }),
            },
            { idempotencyKey: `${key}:item` },
          );
          if (!session.orderCustomer.id || !session.orderItem.id)
            throw new Error(
              "The API response is missing a customer or item ID.",
            );
          const payload = {
            type: "INVOICE",
            cae: input.cae,
            customerId: session.orderCustomer.id,
            items: [{ id: session.orderItem.id, quantity: order.quantity }],
          };
          writePath = "/invoices";
          const result = await fiz.invoices.create(payload, {
            idempotencyKey: `${key}:draft`,
          });
          if (!result.id)
            throw new Error(
              "FIZ did not return a draft ID. Retry this same order to recover the result.",
            );
          session.orderDraft = result;
          return render(
            res,
            session,
            `Order #${order.number} saved as a draft in FIZ.`,
          );
        } catch (error) {
          if (
            error instanceof FizConflictError &&
            !error.headers.get("retry-after")
          )
            session.uncertainWritePath = writePath;
          throw error;
        } finally {
          session.writing = false;
        }
      }
      if (url.pathname === "/company") {
        const fiz = await clientFor(session);
        const company = await fiz.company.retrieve();
        // A real marketplace must compare this issuer with its expected company.
        if (session.tenantId && company.id !== session.tenantId)
          throw new Error("Unexpected issuer. Confirm the selected company.");
        if (!company.id)
          throw new Error("Company response is missing its identity.");
        session.tenantId = company.id;
        session.companyVerified = true;
        session.company = company;
        return render(res, session);
      }
      if (url.pathname !== "/")
        return render(res, session, "Page not found", 404);
      render(res, session);
    } catch (error) {
      const message =
        error instanceof FizApiError ? apiErrorHint(error, writePath) : error.message;
      render(res, session ?? { csrf: "" }, message, 400);
    }
  });
  const sweep = setInterval(() => {
    for (const [id, session] of sessions)
      if (session.expiresAt <= Date.now()) sessions.delete(id);
  }, 60_000);
  sweep.unref();
  server.on("close", () => clearInterval(sweep));
  return server;
}

function apiErrorHint(error, writePath) {
  const retry = error.headers.get("retry-after");
  const hints = {
    401: "Check expiry, app availability and the token resource. Reconnect if the grant was revoked.",
    403: "Check the granted scopes, company membership and API entitlement.",
    409: retry
      ? "The request is still running. Wait, then retry this same order with its existing key."
      : "The earlier request may have taken effect. Check the result in FIZ before starting another operation.",
    422: "This key was used with another payload. Keep the original payload for a retry.",
    429: "Wait before trying again.",
  };
  const hint =
    hints[error.status] ?? "Check the request against the API reference.";
  const operation = writePath ? `POST ${writePath}` : "FIZ";
  return `${operation} returned HTTP ${error.status}. ${hint}${retry ? ` Retry-After: ${retry}.` : ""}`;
}
