import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createDemoServer } from "./app.mjs";
import { createMockServer } from "./test-support/fiz-server.mjs";
import { readConfig } from "./config.mjs";

async function setup(t) {
  const config = readConfig({
    FIZ_APP_ID: "a".repeat(24),
    FIZ_CLIENT_ID: "fiz_app_synthetic",
    FIZ_CLIENT_SECRET: "synthetic",
  });
  const mock = createMockServer(config),
    demo = createDemoServer(config);
  for (const server of [mock, demo]) {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));
  }
  config.issuer =
    config.api =
    config.appUrl =
      `http://127.0.0.1:${mock.address().port}`;
  config.baseUrl = `http://127.0.0.1:${demo.address().port}`;
  config.redirectUri = `${config.baseUrl}/callback`;
  let cookie;
  const request = async (path, options = {}) => {
    const response = await fetch(new URL(path, config.baseUrl), {
      redirect: "manual",
      ...options,
      headers: { ...(cookie && { Cookie: cookie }), ...options.headers },
    });
    if (response.headers.has("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return response;
  };
  async function authorize(decision = "allow") {
    const auth = await request("/connect");
    const consentResponse = await fetch(auth.headers.get("location"));
    assert.ok(
      consentResponse.headers
        .get("content-security-policy")
        .includes(config.baseUrl),
    );
    const consent = await consentResponse.text();
    const requestId = consent.match(/name="request" value="([^"]+)"/)[1];
    const callback = await fetch(`${config.issuer}/decision`, {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({ request: requestId, decision }),
    });
    return request(callback.headers.get("location"));
  }
  return { config, request, authorize };
}

test("full local OAuth round trip creates only one order draft across repeat requests", async (t) => {
  const { request, authorize } = await setup(t);
  assert.equal((await authorize()).status, 303);
  assert.equal((await request("/company")).status, 200);
  let html = await (await request("/")).text();
  assert.match(html, /Example Company/);
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  const post = () =>
    request("/orders/1042/draft", {
      method: "POST",
      body: new URLSearchParams({ csrf, cae: "62010", vatRate: "NORMAL" }),
    });
  const first = await post();
  assert.equal(first.status, 200);
  const firstHtml = await first.text();
  const draftId = firstHtml.match(/Document ID: ([a-f0-9]{24})/)[1];
  assert.match(firstHtml, /Draft saved in FIZ/);
  assert.match(
    await (await post()).text(),
    new RegExp(`Document ID: ${draftId}`),
  );
  assert.equal(
    (
      await request("/orders/1042/draft", {
        method: "POST",
        body: new URLSearchParams({ csrf, cae: "62010", vatRate: "REDUCED" }),
      })
    ).status,
    400,
  );
  assert.equal((await request("/orders/1042/draft")).status, 404);
  const reset = await request("/reset", {
    method: "POST",
    body: new URLSearchParams({ csrf }),
  });
  assert.equal(reset.status, 303);
  html = await (await request("/")).text();
  assert.ok(!html.includes(draftId));
});

test("local signup resumes at the registered install URL and cancellation does not grant access", async (t) => {
  const { config, request, authorize } = await setup(t);
  const signup = await request("/signup");
  const html = await (await fetch(signup.headers.get("location"))).text();
  assert.ok(html.includes(`${config.baseUrl}/resume`));
  const denied = await authorize("deny");
  assert.equal(denied.status, 400);
  assert.match(await denied.text(), /Connection cancelled/);
  assert.equal((await request("/company")).status, 400);
});

test("local simulator rejects unauthenticated tokens and unregistered callbacks without redirecting", async (t) => {
  const { config } = await setup(t);
  assert.equal((await fetch(`${config.api}/company`)).status, 401);
  const response = await fetch(
    `${config.issuer}/oauth/authorize?redirect_uri=https://other.example`,
    { redirect: "manual" },
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("location"), null);
});
