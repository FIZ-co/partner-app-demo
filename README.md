# Your partner app, connected to FIZ

A small order-management app showing how **your product** can use FIZ for invoicing. Its example order belongs to Alex Morgan: €10 for website maintenance. Your customer connects their FIZ company, returns to that order, and creates an invoice draft from it.

Name the app after your own product with `APP_NAME`. The same name should appear in your FIZ application settings and on the consent screen. FIZ appears as an invoicing provider inside your product.

**[Integration guide](https://api.fiz.co/docs/apps)** · [API reference](https://api.fiz.co/) · [Português](https://api.fiz.co/docs/apps?lang=pt)

## What runs where

- **`localhost:3100` is the partner application** on your computer. Change `PORT` if needed; it is not a FIZ environment.
- **`app.fiz.co` is real FIZ**, where your customer signs in, registers and chooses a company.
- **`api.fiz.co` is the production OAuth server and REST API**, called by this app’s server.

There is no simulator in `npm start`. Without credentials, the app shows the order and an integration setup page. It cannot connect or create records until configured.

Creating a draft saves a **real customer, service item and invoice draft** in the selected company. The app does not request issuance permission and has no action that issues an invoice or sends it to AT.

## 1. Register your application

Sign in at [app.fiz.co](https://app.fiz.co), open **Settings → Integrations → Developer apps**, and create a **Development** application. Complete account/company setup if FIZ asks you to before opening Settings.

| Setting                 | Value                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| Name                    | Your product’s name; use the same value in `APP_NAME`                |
| Developer               | Your name or business                                                |
| Website                 | `http://localhost:3100`                                              |
| Privacy policy          | `http://localhost:3100/privacy`                                      |
| Installation URL        | `http://localhost:3100/resume`                                       |
| Redirect / callback URL | `http://localhost:3100/callback`                                     |
| Allowed scopes          | `company.read`, `invoicing.read`, `invoicing.write`                  |
| Testers                 | Up to 20 email addresses, including people without a FIZ account yet |

Development applications connect to production FIZ for the creator and configured testers only. Each person still needs to own the company they connect. Development OAuth testing does not require a paid API plan. Testers verify their email through normal FIZ signup; no separate tester confirmation is needed.

Copy the **application ID** (24-character registry ID), **client ID** (`fiz_app_…`) and one-time **client secret**. These are three distinct values; no API key is used.

## 2. Configure and run your app

Install **Node.js 22.17+** and Git. No package dependencies are needed.

```sh
git clone https://github.com/FIZ-co/partner-app-demo.git
cd partner-app-demo
cp .env.example .env
```

Fill in `.env` using the app you just registered:

```dotenv
APP_NAME="Your product name"
FIZ_APP_ID=YOUR_APPLICATION_ID
FIZ_CLIENT_ID=YOUR_CLIENT_ID
FIZ_CLIENT_SECRET=YOUR_CLIENT_SECRET
```

```sh
npm start
```

Open **http://localhost:3100**. The header displays your app name. If credentials are missing, **Set up FIZ** shows the exact URLs and settings for your chosen port. Secrets are only read from the server environment and never displayed there.

If you change `PORT`, update the registered website, privacy, install and callback URLs. Matching includes the hostname, exact port, path and trailing slash. `DEMO_BASE_URL` defaults to `http://localhost:PORT`; override it only if necessary.

Older versions used `DEMO_MODE` and `MOCK_PORT`. Remove those settings from an existing `.env`: startup now always uses real FIZ, defaulting to production. Optional FIZ deployment URL overrides are documented in `.env.example`.

## 3. Try it as your customer

1. Open the example order and click **Connect FIZ**.
2. Sign in at FIZ as the app creator or a listed tester. Choose the company and allow draft creation.
3. Return to your app. The FIZ card now shows the actual connected company.
4. Choose that company’s activity (CAE) and the applicable VAT category. Click **Create invoice draft**.
5. The order now shows **Draft saved in FIZ**, with its document ID. Open FIZ to review it in the connected company.

The app sends the order’s customer and service to FIZ, then creates an `INVOICE` draft referencing those records. The VAT category must be chosen by the user; this example does not determine the appropriate tax treatment.

To test a **new customer**, add their email to the app’s testers first, then use **Create a FIZ account**. Keep the journey in the same browser. FIZ handles email verification, company creation and AT setup (or Later), then returns to the registered `/resume` URL. Your app starts fresh OAuth state and PKCE and returns to the order. AT credentials never reach the partner app.

A Production application is a separate registration with public HTTPS URLs and FIZ approval before other customers can connect. Its companies need a plan with API access. Development grants do not transfer to the Production client ID.

## Adapt it to your product

| File            | Responsibility                                                                     |
| --------------- | ---------------------------------------------------------------------------------- |
| `order.mjs`     | Your product’s example order, customer and service; replace with your own database |
| `views.mjs`     | Partner app screens: order, FIZ connection, draft result and developer setup       |
| `oauth.mjs`     | PKCE S256, state, issuer/callback validation and signup link                       |
| `app.mjs`       | Server sessions, token exchange/refresh, company binding and order-to-draft action |
| `rest.mjs`      | Bearer requests, timeouts, idempotency keys and API error hints                    |
| `config.mjs`    | Product name, production FIZ defaults and credential validation                    |
| `server.mjs`    | Local app startup; no fake FIZ server                                              |
| `test-support/` | Synthetic OAuth/API fixture used only by automated tests                           |

An order calls `POST /customers`, `POST /items`, then `POST /invoices`. The returned item ID belongs in **`items[].id`**. Customer and item IDs are cached after each successful step. Draft creation is blocked until `GET /company` verifies the connection and the granted scope includes `invoicing.write`.

Each step retains a stable `Idempotency-Key` for the order. After a lost write response, retry the same action to discover the recorded outcome. A completed result can replay for 30 days. While the 90-second execution lease is active, a 409 with `Retry-After` asks you to retry the same key later. An expired lease without a reported result, or a failure after execution may have started, produces an abandoned/unknown outcome: stop retries and reconcile first. The app preserves the original inputs and rejects changed settings once creation has started. It never automatically issues a fiscal document.

## Retry and recovery

- **`temporarily_unavailable` at `/oauth/token`:** keep credentials and retry later. A pause is not a disconnect.
- **`invalid_client`:** check client ID, current secret and form encoding.
- **`invalid_grant`:** reconnect explicitly; do not loop refresh with a consumed token.
- **Lost refresh response:** this server refuses to reuse the potentially consumed refresh token. Reconnect explicitly.
- **REST 401:** check expiry, audience and app availability. One 401 does not erase the connection.
- **REST 403:** check granted scope, company ownership/plan and OAuth support for the route.
- **REST 409 with `Retry-After` (IN_PROGRESS):** wait, then retry the same operation/key.
- **REST 409 with unknown outcome (ABANDONED):** the key cannot start another execution. The app stops retries and asks you to check FIZ. An explicitly abandoned record cannot replay a result. Only use a new key after confirming the original operation had no effect and is no longer running; contact support if uncertain. Do not reset the order blindly.
- **REST 422:** the same key was used for a different payload.
- **429:** respect `Retry-After` and stagger jobs.

The company is pinned within the session. Reconnecting to a different company refuses writes. **Reset example** deliberately creates a separate copy of the order and clears local connection data. It does not delete FIZ records or revoke access; revoke in FIZ → Settings → Integrations.

## Before hosting this for customers

The default FIZ target is production. The example itself remains a **local, single-process app**: it binds to loopback and refuses `NODE_ENV=production` until you replace its memory storage and add your own authentication. These are separate concerns.

Add durable, encrypted per-customer connections and server sessions. Persist order/document mappings and operation keys. Serialize refresh across replicas and save the new token pair atomically. Add your product’s authentication and authorization. Keep secrets in server secret storage, not source control or client bundles.

Sessions expire after one hour. Restarting loses tokens and request keys while FIZ records remain. The example order starts fresh in another session, so running it again can create another draft. A real product must retain the same order identity and keys across browser sessions and server restarts.

## Checks

```sh
npm test
```

Tests use an isolated HTTP fixture for OAuth redirects and API writes. They verify production URL defaults, missing-credential behavior, callback validation, CSRF, server-only tokens, company binding, granted permissions and recovery after lost responses. CI runs on Node 22 and 24. The fixture is never started by the app.

For integration help, contact **support@fiz.co** with your application ID, endpoint, UTC time, status and request ID. Never send secrets, tokens or AT credentials.

## License

[MIT](LICENSE) © 2026 FIZ.
