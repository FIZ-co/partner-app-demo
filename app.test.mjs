import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";

import { createDemoServer } from "./app.mjs";

const config = {
  configured: true,
  appName: "Partner Orders",
  issuer: "https://issuer.example",
  api: "https://api.example",
  appUrl: "https://app.example",
  appId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  clientId: "fiz_app_synthetic",
  secret: "synthetic-secret",
  redirectUri: "http://localhost:3100/callback",
  resource: "https://api.fiz.co",
  scopes: "company.read invoicing.read invoicing.write",
};

async function setup(
  t,
  {
    refreshError,
    shortToken = false,
    companyError,
    companyId = "company-a",
    scope = config.scopes,
    lostDraft = false,
    draftConflict,
  } = {},
) {
  const calls = [];
  const server = createDemoServer(config, async (url, init) => {
    calls.push({ url: url.href, ...init });
    if (url.pathname === "/oauth/token") {
      if (
        new URLSearchParams(init.body).get("grant_type") === "refresh_token" &&
        refreshError
      ) {
        const error = refreshError;
        refreshError = undefined;
        if (error === "transport") throw new Error("Synthetic response lost");
        return Response.json({ error }, { status: 400 });
      }
      const expires = shortToken ? 0 : 3600;
      shortToken = false;
      return Response.json({
        access_token: "synthetic-access",
        refresh_token: "synthetic-refresh",
        expires_in: expires,
        scope,
      });
    }
    if (url.pathname === "/company" && companyError) {
      const status = companyError;
      companyError = undefined;
      return Response.json({ message: "Unavailable" }, { status });
    }
    if (url.pathname === "/company")
      return Response.json({
        id: companyId,
        name: "Connected company",
        cae: ["62010"],
        readiness: {
          ready: false,
          reasons: [{ code: "AT_CREDENTIALS_REQUIRED" }],
        },
      });
    if (url.pathname === "/customers")
      return Response.json({ id: "customer-a" });
    if (url.pathname === "/items") return Response.json({ id: "item-a" });
    if (url.pathname === "/invoices") {
      if (draftConflict) {
        const retryAfter = draftConflict === "running" ? "3" : undefined;
        draftConflict = undefined;
        return Response.json(
          { message: "Synthetic operation conflict" },
          {
            status: 409,
            headers: retryAfter ? { "Retry-After": retryAfter } : {},
          },
        );
      }
      if (lostDraft) {
        lostDraft = false;
        throw new Error("Synthetic response lost");
      }
      return Response.json({ id: "draft-a", status: "DRAFT" }, { status: 201 });
    }
    throw new Error("Unexpected API call");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const first = await fetch(base);
  const cookie = first.headers.get("set-cookie").split(";")[0];
  const request = (path, init = {}) =>
    fetch(base + path, {
      ...init,
      redirect: "manual",
      headers: { Cookie: cookie, ...init.headers },
    });
  const connect = async () => {
    const response = await request("/connect");
    const authorization = new URL(response.headers.get("location"));
    return request(
      "/callback?" +
        new URLSearchParams({
          code: "synthetic-code",
          state: authorization.searchParams.get("state"),
          iss: config.issuer,
        }),
    );
  };
  return {
    calls,
    request,
    connect,
    setCompany: (id) => {
      companyId = id;
    },
  };
}

test("signup round trip starts fresh OAuth and only sends the registry identity through FIZ registration", async (t) => {
  const { calls, request } = await setup(t);
  const previous = new URL((await request("/connect")).headers.get("location"));
  const signup = new URL((await request("/signup")).headers.get("location"));
  assert.equal(signup.origin, config.appUrl);
  assert.equal(signup.pathname, "/auth/signup");
  assert.deepEqual([...signup.searchParams.keys()], ["path"]);
  assert.equal(
    signup.searchParams.get("path"),
    `/auth/app-return?app=${config.appId}`,
  );
  const resumed = new URL((await request("/resume")).headers.get("location"));
  assert.notEqual(
    previous.searchParams.get("state"),
    resumed.searchParams.get("state"),
  );
  assert.notEqual(
    previous.searchParams.get("code_challenge"),
    resumed.searchParams.get("code_challenge"),
  );
  const stale = await request(
    "/callback?" +
      new URLSearchParams({
        code: "old-code",
        state: previous.searchParams.get("state"),
        iss: config.issuer,
      }),
  );
  assert.equal(stale.status, 400);
  assert.equal(calls.length, 0);
});

test("real HTTP callback, company readiness and explicit draft POST keep tokens server-side and reuse the request key", async (t) => {
  const { calls, request, connect } = await setup(t);
  assert.equal((await connect()).status, 303);
  assert.match(
    await (await request("/company")).text(),
    /Complete company setup/,
  );
  const page = await (await request("/")).text();
  assert.ok(
    !page.includes("synthetic-access") && !page.includes(config.secret),
  );
  const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
  const fields = { cae: "62010", vatRate: "NORMAL" };
  assert.equal(
    (
      await request("/orders/1042/draft", {
        method: "POST",
        body: new URLSearchParams({ csrf: "wrong", ...fields }),
      })
    ).status,
    403,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request("/orders/1042/draft", {
          method: "POST",
          body: new URLSearchParams({ csrf, ...fields }),
        })
      ).status,
      200,
    );
  const drafts = calls.filter((call) => call.url.endsWith("/invoices"));
  assert.equal(drafts.length, 2);
  assert.equal(
    drafts[0].headers["Idempotency-Key"],
    drafts[1].headers["Idempotency-Key"],
  );
  assert.equal(drafts[0].headers.Authorization, "Bearer synthetic-access");
  assert.deepEqual(JSON.parse(drafts[0].body), {
    type: "INVOICE",
    cae: "62010",
    customerId: "customer-a",
    items: [{ id: "item-a", quantity: 1 }],
  });
  assert.equal(
    calls.filter((call) => call.url.endsWith("/customers")).length,
    1,
  );
  assert.equal(calls.filter((call) => call.url.endsWith("/items")).length, 1);
  assert.equal(
    JSON.parse(calls.find((call) => call.url.endsWith("/customers")).body).name,
    "Alex Morgan",
  );
  assert.equal(
    JSON.parse(calls.find((call) => call.url.endsWith("/items")).body).name,
    "Website maintenance",
  );
  assert.ok(
    calls.every((call) => !new URL(call.url).pathname.includes("/issue")),
  );
});

test("temporary unavailability keeps refresh credentials for a later explicit retry", async (t) => {
  const { calls, request, connect } = await setup(t, {
    shortToken: true,
    refreshError: "temporarily_unavailable",
  });
  await connect();
  assert.equal((await request("/company")).status, 400);
  assert.equal((await request("/company")).status, 200);
  const refreshes = calls.filter(
    (call) =>
      call.url.endsWith("/oauth/token") &&
      new URLSearchParams(call.body).get("grant_type") === "refresh_token",
  );
  assert.equal(refreshes.length, 2);
  assert.equal(
    new URLSearchParams(refreshes[0].body).get("refresh_token"),
    new URLSearchParams(refreshes[1].body).get("refresh_token"),
  );
});

test("lost refresh response never retries a potentially consumed refresh token automatically", async (t) => {
  const { calls, request, connect } = await setup(t, {
    shortToken: true,
    refreshError: "transport",
  });
  await connect();
  assert.equal((await request("/company")).status, 400);
  assert.match(
    await (await request("/company")).text(),
    /Refresh outcome unknown/,
  );
  assert.equal(
    calls.filter((call) => call.url.endsWith("/oauth/token")).length,
    2,
  );
});

test("a temporary REST 401 does not erase credentials", async (t) => {
  const { calls, request, connect } = await setup(t, { companyError: 401 });
  await connect();
  assert.equal((await request("/company")).status, 400);
  assert.equal((await request("/company")).status, 200);
  assert.equal(
    calls.filter((call) => call.url.endsWith("/oauth/token")).length,
    1,
  );
});

test("a new authorization cannot write until its company has been checked", async (t) => {
  const { calls, request, connect } = await setup(t);
  await connect();
  const page = await (await request("/")).text();
  const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
  const response = await request("/orders/1042/draft", {
    method: "POST",
    body: new URLSearchParams({
      csrf,
      cae: "62010",
      vatRate: "NORMAL",
    }),
  });
  assert.equal(response.status, 400);
  assert.match(await response.text(), /verify the connected company/);
  assert.equal(
    calls.filter((call) => call.url.endsWith("/invoices")).length,
    0,
  );
});

test("re-consent to a different company cannot write under the previous session binding", async (t) => {
  const { calls, request, connect, setCompany } = await setup(t);
  await connect();
  assert.equal((await request("/company")).status, 200);
  setCompany("company-b");
  await connect();
  assert.match(await (await request("/company")).text(), /Unexpected issuer/);
  const page = await (await request("/")).text();
  const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
  assert.equal(
    (
      await request("/orders/1042/draft", {
        method: "POST",
        body: new URLSearchParams({
          csrf,
          cae: "62010",
          vatRate: "NORMAL",
        }),
      })
    ).status,
    400,
  );
  assert.equal(
    calls.filter((call) => call.url.endsWith("/invoices")).length,
    0,
  );
});

test("an order cannot create records when draft permission was declined", async (t) => {
  const { calls, request, connect } = await setup(t, {
    scope: "company.read invoicing.read",
  });
  await connect();
  const html = await (await request("/company")).text();
  assert.doesNotMatch(html, /<form action="\/orders\/1042\/draft"/);
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  const response = await request("/orders/1042/draft", {
    method: "POST",
    body: new URLSearchParams({ csrf, cae: "62010", vatRate: "NORMAL" }),
  });
  assert.equal(response.status, 400);
  assert.match(
    await response.text(),
    /Permission to create drafts was not granted/,
  );
  assert.equal(
    calls.filter((call) => call.url.endsWith("/customers")).length,
    0,
  );
});

test("lost draft response keeps the order retryable with the original key and inputs", async (t) => {
  const { calls, request, connect } = await setup(t, { lostDraft: true });
  await connect();
  const html = await (await request("/company")).text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  const post = () =>
    request("/orders/1042/draft", {
      method: "POST",
      body: new URLSearchParams({ csrf, cae: "62010", vatRate: "NORMAL" }),
    });
  const failed = await post();
  assert.equal(failed.status, 400);
  assert.match(await failed.text(), /Retry draft creation/);
  const recovered = await post();
  assert.equal(recovered.status, 200);
  assert.match(await recovered.text(), /Document ID: draft-a/);
  const drafts = calls.filter((call) => call.url.endsWith("/invoices"));
  assert.equal(drafts.length, 2);
  assert.equal(
    drafts[0].headers["Idempotency-Key"],
    drafts[1].headers["Idempotency-Key"],
  );
  assert.equal(drafts[0].body, drafts[1].body);
  assert.equal(
    calls.filter((call) => call.url.endsWith("/customers")).length,
    1,
  );
});

for (const outcome of ["running", "abandoned"]) {
  test(`409 ${outcome} keeps only in-progress orders retryable`, async (t) => {
    const { calls, request, connect } = await setup(t, {
      draftConflict: outcome,
    });
    await connect();
    const page = await (await request("/company")).text();
    const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
    const post = () =>
      request("/orders/1042/draft", {
        method: "POST",
        body: new URLSearchParams({ csrf, cae: "62010", vatRate: "NORMAL" }),
      });
    const response = await post();
    assert.equal(response.status, 400);
    const html = await response.text();
    if (outcome === "running") {
      assert.match(html, /Retry draft creation/);
      assert.match(html, /Retry-After: 3/);
      assert.equal((await post()).status, 200);
      assert.equal(
        calls.filter((call) => call.url.endsWith("/invoices")).length,
        2,
      );
    } else {
      assert.match(html, /Check the result in FIZ/);
      assert.doesNotMatch(html, /<form action="\/orders\/1042\/draft"/);
      assert.equal((await post()).status, 400);
      assert.equal(
        calls.filter((call) => call.url.endsWith("/invoices")).length,
        1,
      );
    }
  });
}
