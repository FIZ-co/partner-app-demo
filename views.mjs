import { escapeHtml as h } from "./oauth.mjs";
import { order, draftPath } from "./order.mjs";

const money = (amount) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
    amount,
  );
const icon = (name) => {
  const paths = {
    orders:
      '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/>',
    arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
  };
  return `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.orders}</svg>`;
};
export const STYLE = `
:root{font:15px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#192b3a;background:#f5f7fa;--muted:#667787;--line:#e3e9ee;--accent:#13796f;--nav:#152b39}*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:4px}button,input,select{font:inherit}button,a,input,select,summary{outline-offset:4px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #218e84}button{cursor:pointer}svg{flex-shrink:0}.app-shell{min-height:100vh;display:grid;grid-template-columns:224px minmax(0,1fr)}.sidebar{background:var(--nav);color:#d1dce3;padding:30px 20px;display:flex;flex-direction:column;gap:42px}.brand{display:flex;align-items:center;gap:11px;text-decoration:none;color:white;font-size:18px;font-weight:700;line-height:1.25;overflow-wrap:anywhere}.brand-mark{display:grid;place-items:center;background:#7ee0c3;color:#123e3a;border-radius:10px;width:34px;height:36px;flex-shrink:0;font-size:20px}.nav-label{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#8da4b5;padding:0 12px;margin-bottom:10px}.nav-item{display:flex;align-items:center;gap:12px;border-radius:8px;padding:12px;text-decoration:none;font-weight:600}.nav-item.active{background:#ffffff12;color:#fff}.sidebar-bottom{margin-top:auto;font-size:12px;color:#94a9b8;padding:12px}.sidebar-bottom a{display:block;margin-top:12px}.workspace{min-width:0}.topbar{height:76px;display:flex;align-items:center;justify-content:space-between;gap:14px;background:#fff;border-bottom:1px solid var(--line);padding:0 44px;font-size:13px;color:var(--muted)}.workspace-name{display:flex;align-items:center;gap:10px}.workspace-dot{width:9px;height:9px;border-radius:50%;background:#79b9ae}main{max-width:1260px;margin:auto;padding:40px 44px 26px}h1{font-size:32px;letter-spacing:-.035em;line-height:1.2;margin:6px 0 12px}h2{font-size:17px;letter-spacing:-.015em;margin:0}h3{font-size:14px;margin:0 0 8px}p{margin:8px 0}.muted{color:var(--muted)}.eyebrow{color:var(--muted);font-size:12px;margin-bottom:16px}.page-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:28px}.badge{display:inline-flex;align-items:center;gap:6px;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:650;white-space:nowrap;background:#eef2f6;color:#647486}.badge.green{background:#e4f3ec;color:#276746}.badge.amber{background:#fff3d9;color:#8a6015}.badge.blue{background:#e8f0fa;color:#34658c}.columns{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:24px;align-items:start}.card{background:#fff;border:1px solid var(--line);border-radius:12px;min-width:0;overflow:hidden}.card-title{padding:22px 26px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:12px}.card-body{padding:26px}.customer{display:flex;align-items:center;gap:13px;margin-bottom:28px}.avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#e9eef7;color:#556c96;font-weight:650}.small{font-size:12px}.customer strong{font-size:15px}.line-items{width:100%;border-collapse:collapse;text-align:left;font-size:13px}.line-items th{padding:12px 0;border-bottom:1px solid var(--line);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600}.line-items td{padding:20px 0;border-bottom:1px solid var(--line)}.line-items th:last-child,.line-items td:last-child{text-align:right}.line-items th:nth-child(2),.line-items td:nth-child(2){text-align:center}.line-items strong{display:block;font-size:14px}.total{display:flex;align-items:center;justify-content:flex-end;gap:38px;padding:22px 0 0;font-size:13px}.total strong{font-size:22px;letter-spacing:-.03em}.section-divider{border-top:1px solid var(--line);margin:26px -26px 24px}.invoice-status{display:flex;align-items:center;gap:12px}.status-icon{width:36px;height:36px;border-radius:9px;background:#edf4f6;color:#527b83;display:grid;place-items:center}.status-icon.saved{background:#e4f3ec;color:#276746}.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:22px 0}label{display:block;font-size:12px;font-weight:600;margin-bottom:7px}select,input:not([type=hidden]){width:100%;padding:10px;border:1px solid #cfd9e1;border-radius:7px;background:#fff;color:#263b4a;min-height:42px}input:read-only{background:#f5f7fa}.field-wide{grid-column:1/-1}.button,button{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:43px;border:1px solid transparent;border-radius:7px;background:var(--accent);color:#fff;font-size:13px;font-weight:600;padding:11px 17px;text-decoration:none}.button.secondary,button.secondary{background:#fff;border-color:#d4dee5;color:#344b5d}.full{width:100%}.button:disabled,button:disabled{cursor:not-allowed;background:#e8edf0;color:#85949f}.link-button{background:none;color:var(--muted);border:0;padding:0;min-height:0;font-size:12px;text-decoration:underline;font-weight:400}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.provider{display:flex;align-items:center;gap:12px;margin-bottom:20px}.fiz-mark{font-weight:950;font-style:italic;font-size:23px;letter-spacing:-1.5px;background:#ffe090;color:#141e24;display:grid;place-items:center;width:48px;height:48px;border-radius:10px}.provider h2{font-size:16px}.integration-description{font-size:13px;color:var(--muted);margin:18px 0}.integration-actions{display:grid;gap:10px}.integration-actions .small{text-align:center;margin-top:4px}.company-box{border:1px solid var(--line);border-radius:8px;padding:14px;margin:18px 0;font-size:13px;overflow-wrap:anywhere}.company-box strong{display:block;margin-bottom:3px}.hint{font-size:12px;color:var(--muted);margin-top:12px}.notice{padding:14px 18px;border:1px solid #bbdfce;background:#eef8f3;border-radius:9px;margin-bottom:24px;font-size:13px;overflow-wrap:anywhere}.notice.error{background:#fff1ef;border-color:#ebc3be;color:#963f35}.draft-id{display:block;overflow-wrap:anywhere;font:12px/1.7 ui-monospace,monospace;color:var(--muted);margin-top:8px}.context-note{font-size:12px;color:var(--muted);padding:18px 2px;max-width:700px}footer{max-width:1260px;margin:auto;padding:0 44px 28px;color:var(--muted);font-size:11px;display:flex;justify-content:space-between;gap:14px}footer a{margin-left:15px}.setup{max-width:780px}.setup .card{padding:26px;margin:20px 0}.setup h2{margin-bottom:12px}.setup pre{padding:18px;background:#f5f7fa;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.setup dl{display:grid;grid-template-columns:140px minmax(0,1fr);gap:10px;font-size:13px}.setup dd{margin:0;overflow-wrap:anywhere}.setup dt{color:var(--muted)}.setup code{overflow-wrap:anywhere}.setup ol{padding-left:20px}.setup li{margin-bottom:12px}
@media(min-width:1500px){main{padding-top:56px}.columns{grid-template-columns:minmax(0,1fr) 360px;gap:28px}}
@media(max-width:1100px){.app-shell{grid-template-columns:185px minmax(0,1fr)}main{padding:28px 24px}.topbar{padding:0 24px}footer{padding:0 24px 24px}.columns{grid-template-columns:minmax(0,1fr) 290px;gap:18px}.card-body,.card-title{padding:20px}.section-divider{margin-left:-20px;margin-right:-20px}}
@media(max-width:850px){.app-shell{display:block}.sidebar{padding:16px 24px;flex-direction:row;align-items:center;gap:20px}.sidebar nav{margin-left:auto}.nav-label,.sidebar-bottom{display:none}.nav-item{padding:8px 12px;font-size:12px}.brand{font-size:16px}.topbar{height:54px}.columns{grid-template-columns:minmax(0,1fr) 290px}h1{font-size:28px}}
@media(max-width:650px){main{padding:24px 16px}.sidebar{padding:16px}.topbar{padding:0 16px;font-size:12px}.columns{display:flex;flex-direction:column}.columns>.card,.connection{width:100%}.connection{order:-1}.card-body,.card-title{padding:20px}.integration-description{margin:12px 0}.provider{margin-bottom:12px}.page-heading{margin-bottom:18px}.page-heading>.badge{margin-top:9px}.fields{gap:10px}.setup dl{grid-template-columns:1fr;gap:4px}.setup dd{margin-bottom:10px}footer{padding:0 16px 24px;flex-wrap:wrap}.setup .card{padding:20px}.brand{max-width:230px}.nav-item svg{display:none}.line-items th:first-child{width:60%}}
`;

export function shell(config, body, title = "Orders") {
  const name = config.appName || "Acme Orders";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)} · ${h(name)}</title><style>${STYLE}</style></head><body><div class="app-shell"><aside class="sidebar"><a class="brand" href="/"><span class="brand-mark">${h(name.slice(0, 1).toUpperCase())}</span><span>${h(name)}</span></a><nav><div class="nav-label">Workspace</div><a class="nav-item active" href="/">${icon("orders")} Orders</a></nav><div class="sidebar-bottom">Your product.<br>Invoicing powered by FIZ.<a href="https://api.fiz.co/docs/apps" target="_blank" rel="noreferrer">Developer guide ↗</a></div></aside><div class="workspace"><header class="topbar"><span>Orders / #${order.number}</span><span class="workspace-name"><span class="workspace-dot"></span>Example workspace</span></header><main>${body}</main><footer><span>${h(name)} · Example partner application</span><span><a href="/privacy">Data handling</a><a href="/setup">Integration setup</a></span></footer></div></div></body></html>`;
}

function connection(config, session) {
  const connected = session.companyVerified && !session.refreshUncertain;
  const company = session.company;
  const settingsUrl = new URL("/settings/integrations", config.appUrl).href;
  let content;
  if (!config.configured) {
    content = `<span class="badge amber">Setup required</span><p class="integration-description">Add your app’s FIZ credentials to enable account connection and invoicing.</p><a class="button secondary full" href="/setup">Set up FIZ ${icon("arrow")}</a>`;
  } else if (connected) {
    content = `<span class="badge green">${icon("check")} Connected</span><div class="company-box"><strong>${h(company.name || "Your company")}</strong><span class="muted">${h(company.taxpayerNumber || "Company connected through FIZ")}</span></div><p class="integration-description">Invoice drafts from this workspace are saved to this company.</p><div class="actions"><a class="button secondary" href="/company">Refresh connection</a></div><p class="hint"><a href="${h(settingsUrl)}" target="_blank" rel="noreferrer">Manage access in FIZ ↗</a></p>`;
  } else {
    content = `<span class="badge">Not connected</span><p class="integration-description">Connect your company to turn orders into invoice drafts, directly from ${h(config.appName || "Acme Orders")}.</p><div class="integration-actions"><a class="button full" href="/connect">${icon("link")} ${session.tokens ? "Reconnect FIZ" : "Connect FIZ"}</a>${session.tokens ? '<a class="button secondary full" href="/company">Check connection again</a>' : '<p class="small muted">New to FIZ? <a href="/signup">Create a FIZ account ↗</a></p>'}</div><p class="hint">You’ll choose your company and permissions in FIZ, then return to this order.</p>`;
  }
  return `<aside class="card connection"><div class="card-body"><div class="provider"><span class="fiz-mark">FIZ</span><div><h2>Invoicing</h2><span class="small muted">Invoice provider</span></div></div>${content}</div></aside>`;
}

export function dashboard(config, session, message = "", failed = false) {
  const csrf = `<input type="hidden" name="csrf" value="${h(session.csrf)}">`;
  const company = session.company;
  const saved = session.orderDraft;
  const input = session.orderInput;
  const caes = company?.cae ?? [];
  const canWrite =
    session.companyVerified &&
    !session.refreshUncertain &&
    session.tokens?.scope?.split(" ").includes("invoicing.write");
  let invoice;
  if (saved) {
    invoice = `<div class="invoice-status"><span class="status-icon saved">${icon("check")}</span><div><h3>Draft saved in FIZ</h3><span class="small muted">${h(company.name || "Your company")} · Not issued</span></div></div><span class="draft-id">Document ID: ${h(saved.id)}</span><p class="hint">The order’s customer, service and draft are saved in your FIZ company. Review the draft in FIZ when you’re ready.</p><div class="actions"><a class="button secondary" href="${h(new URL("/invoices", config.appUrl).href)}" target="_blank" rel="noreferrer">Open FIZ ${icon("arrow")}</a></div>`;
  } else if (session.orderUncertain) {
    invoice = `<div class="invoice-status"><span class="status-icon">${icon("orders")}</span><div><h3>Check the result in FIZ</h3><span class="small muted">The earlier request may have been saved.</span></div></div><p class="hint">Automatic retries are stopped. Check the company’s existing records before trying again. If the outcome is unclear, contact support to avoid creating a duplicate.</p><div class="actions"><a class="button secondary" href="${h(new URL("/invoices", config.appUrl).href)}" target="_blank" rel="noreferrer">Open FIZ ${icon("arrow")}</a></div>`;
  } else {
    invoice = `<div class="invoice-status"><span class="status-icon">${icon("orders")}</span><div><h3>${input ? "Draft needs a retry" : "Ready to invoice"}</h3><span class="small muted">${input ? "Retry this order to recover the saved result." : "Create a draft from this order’s customer and service."}</span></div></div>`;
    if (canWrite) {
      invoice += `<form action="${h(draftPath)}" method="post">${csrf}<div class="fields"><div><label for="cae">Company activity (CAE)</label><select id="cae" name="cae" required>${!caes.length ? '<option value="">No activity configured</option>' : caes.map((cae) => `<option value="${h(cae)}" ${input?.cae === cae ? "selected" : ""}>${h(cae)}</option>`).join("")}</select></div><div><label for="vatRate">VAT category</label><select id="vatRate" name="vatRate" required><option value="">Choose a category</option>${Object.entries(
        {
          NORMAL: "Standard",
          INTERMEDIATE: "Intermediate",
          REDUCED: "Reduced",
          EXEMPT: "Exempt",
        },
      )
        .map(
          ([value, label]) =>
            `<option value="${value}" ${input?.vatRate === value ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></div><div class="field-wide"><label for="vatExemptionReason">Exemption code <span class="muted">(only for exempt VAT)</span></label><input id="vatExemptionReason" name="vatExemptionReason" value="${h(input?.vatExemptionReason ?? "")}" placeholder="e.g. M10"></div></div><button ${!caes.length ? "disabled" : ""}>${icon("orders")} ${input ? "Retry draft creation" : "Create invoice draft"}</button><p class="hint">Saves a real customer, service and invoice draft in ${h(company.name || "your company")}. Nothing is issued or sent to AT.</p></form>`;
      if (!caes.length)
        invoice +=
          '<p class="hint">Add your company’s activity in FIZ, then refresh the connection.</p>';
      if (company.readiness?.ready === false)
        invoice +=
          '<p class="hint">You can create drafts now. Complete company setup in FIZ before issuing invoices.</p>';
    } else {
      invoice += `<div class="actions"><button disabled>Create invoice draft</button></div><p class="hint">${session.companyVerified ? '<a href="/connect">Reconnect FIZ</a> and allow draft creation to continue.' : "Connect FIZ to enable invoicing for this order."}</p>`;
    }
  }
  return shell(
    config,
    `<div class="eyebrow">Orders / Order details</div><div class="page-heading"><div><h1>Order #${order.number}</h1><p class="muted">${h(order.item.name)} for ${h(order.customer.name)}</p></div><span class="badge ${saved ? "green" : "blue"}">${saved ? "Invoice draft saved" : "Awaiting invoice"}</span></div>${message ? `<p role="${failed ? "alert" : "status"}" class="notice ${failed ? "error" : ""}">${h(message)}</p>` : ""}<div class="columns"><section class="card"><div class="card-title"><h2>Order details</h2><span class="badge">Example order</span></div><div class="card-body"><div class="customer"><span class="avatar">AM</span><div><div class="small muted">Customer</div><strong>${h(order.customer.name)}</strong><div class="small muted">Portugal</div></div></div><table class="line-items"><thead><tr><th>Service</th><th>Qty</th><th>Amount</th></tr></thead><tbody><tr><td><strong>${h(order.item.name)}</strong><span class="small muted">Service · ${money(order.item.unitPrice)} each</span></td><td>${order.quantity}</td><td>${money(order.item.unitPrice * order.quantity)}</td></tr></tbody></table><div class="total"><span class="muted">Subtotal before VAT</span><strong>${money(order.item.unitPrice * order.quantity)}</strong></div><div class="section-divider"></div>${invoice}</div></section>${connection(config, session)}</div><p class="context-note">This workspace contains one example order. Connecting FIZ uses your real account; creating a draft saves real records in the company you select.</p>${session.orderInput || session.tokens ? `<details><summary class="small muted">Reset example</summary><p class="hint">Starts a separate copy of this order and clears the local connection. Existing FIZ records and access remain. Use FIZ Settings → Integrations to revoke access.</p><form action="/reset" method="post">${csrf}<button class="secondary">Reset order and connection</button></form></details>` : ""}`,
  );
}

export function setupPage(config) {
  const base = config.baseUrl;
  return shell(
    config,
    `<div class="setup"><a class="small muted" href="/">← Back to orders</a><h1>Set up FIZ for ${h(config.appName)}</h1><p class="muted">This server is your partner app. Customers sign in and register at FIZ, then return here to invoice their orders.</p><div class="card"><h2>1. Register your app in FIZ</h2><p>Open <a href="${h(new URL("/settings/integrations", config.appUrl).href)}" target="_blank" rel="noreferrer">Settings → Integrations → Developer apps ↗</a>. Create a Development app, using your product’s name.</p><dl><dt>App name</dt><dd>${h(config.appName)}</dd><dt>Website</dt><dd>${h(base)}</dd><dt>Privacy policy</dt><dd>${h(base)}/privacy</dd><dt>Installation URL</dt><dd>${h(base)}/resume</dd><dt>Callback URL</dt><dd>${h(config.redirectUri)}</dd><dt>Scopes</dt><dd>${h(config.scopes)}</dd></dl><p class="hint">Use your creator account or add the email addresses of your testers. Testers can register a new FIZ account after being added.</p></div><div class="card"><h2>2. Add credentials to your server</h2><p>Copy <code>.env.example</code> to <code>.env</code> in this app’s folder. Set the same name as in FIZ, then fill in the three credentials from your registered application:</p><pre>APP_NAME="${h(config.appName)}"
FIZ_APP_ID=YOUR_APPLICATION_ID
FIZ_CLIENT_ID=YOUR_CLIENT_ID
FIZ_CLIENT_SECRET=YOUR_CLIENT_SECRET</pre><p>The application ID is the 24-character registry ID. The client ID starts with <code>fiz_app_</code>. Keep the secret in the server’s <code>.env</code>.</p>${config.configured ? '<p class="badge green">Credentials configured</p>' : `<p class="hint">Still missing: ${h(config.missingCredentials.join(", "))}</p>`}</div><div class="card"><h2>3. Connect your real FIZ company</h2><p>Restart <code>npm start</code>, open the order and choose <strong>Connect FIZ</strong>. To test signup, choose <strong>Create a FIZ account</strong>.</p><p>Your partner app runs at <code>${h(base)}</code>. OAuth and invoice requests go to <code>${h(config.api)}</code>. This is real FIZ data.</p><div class="actions"><a class="button" href="/">Back to order</a><a class="button secondary" href="https://api.fiz.co/docs/apps" target="_blank" rel="noreferrer">Full integration guide ↗</a></div></div></div>`,
    "Integration setup",
  );
}
