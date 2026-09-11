import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { readConfig } from "./config.mjs";
import { createDemoServer } from "./app.mjs";

const credentials = {
  FIZ_APP_ID: "a".repeat(24),
  FIZ_CLIENT_ID: "fiz_app_example",
  FIZ_CLIENT_SECRET: "synthetic",
};

test("production FIZ is the default; missing credentials never enable a simulated connection", async (t) => {
  const config = readConfig({ PORT: "3310", APP_NAME: "My <Partner>" });
  assert.equal(config.issuer, "https://api.fiz.co");
  assert.equal(config.api, "https://api.fiz.co");
  assert.equal(config.resource, "https://api.fiz.co");
  assert.equal(config.appUrl, "https://app.fiz.co");
  assert.equal(config.redirectUri, "http://localhost:3310/callback");
  assert.equal(config.configured, false);
  let calls = 0;
  const server = createDemoServer(config, () => {
    calls++;
    throw new Error("Unexpected request");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const html = await (await fetch(base)).text();
  assert.match(html, /My &lt;Partner&gt;/);
  assert.match(html, /Order #1042/);
  assert.match(html, /Setup required/);
  assert.doesNotMatch(html, /href="\/connect"/);
  for (const path of ["/connect", "/resume", "/signup", "/company"]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("location"), null);
    assert.match(await response.text(), /Still missing: FIZ_APP_ID/);
  }
  const setup = await (await fetch(base + "/setup")).text();
  assert.match(setup, /http:\/\/localhost:3310\/callback/);
  assert.equal(calls, 0);
});

test("a configured partner app starts real production OAuth and does not expose its secret", async (t) => {
  const config = readConfig({ ...credentials, APP_NAME: "My Partner" });
  assert.equal(config.configured, true);
  const server = createDemoServer(config);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await (await fetch(base)).text();
  assert.match(page, /Connect FIZ/);
  assert.match(page, /Create a FIZ account/);
  assert.doesNotMatch(page, /synthetic/);
  const response = await fetch(base + "/connect", { redirect: "manual" });
  const url = new URL(response.headers.get("location"));
  assert.equal(url.origin, "https://api.fiz.co");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), credentials.FIZ_CLIENT_ID);
  assert.equal(url.searchParams.get("resource"), "https://api.fiz.co");
  assert.equal(url.searchParams.get("client_secret"), null);
  const setup = await (await fetch(base + "/setup")).text();
  assert.doesNotMatch(setup, /synthetic/);
});

test("configuration rejects stale simulator settings and malformed credentials", () => {
  assert.throws(() => readConfig({ DEMO_MODE: "mock" }), /Remove DEMO_MODE/);
  assert.throws(
    () => readConfig({ ...credentials, FIZ_CLIENT_SECRET: "synthetic\n" }),
    /whitespace/,
  );
  assert.throws(
    () => readConfig({ ...credentials, FIZ_API_URL: "http://remote.example" }),
    /HTTPS/,
  );
  assert.throws(
    () => readConfig({ ...credentials, FIZ_APP_ID: "fiz_app_example" }),
    /registry ID/,
  );
  assert.throws(() => readConfig({ NODE_ENV: "production" }), /memory storage/);
});
