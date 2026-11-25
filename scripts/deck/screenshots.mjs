// Screenshots of the demo instance (:3016, demo database nexus-maut-demo only) for the sales deck,
// via headless Chrome and the DevTools protocol (Chrome started with --remote-debugging-port=9333).
//   node scripts/deck/screenshots.mjs scripts/deck/screenshots [mau-name …]
// Writes mau-*.png into the directory given; optional names retake only those.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { MongoClient } from "mongodb";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const B = "http://localhost:3016";
const SID = readFileSync(`${process.env.DEMO_DIR ?? tmpdir()}/nexus-maut-demo-session.txt`, "utf8").trim();
const W = 1440, H = 940, DSF = 1.5;
const only = process.argv.slice(3);

const mongo = new MongoClient("mongodb://localhost:27019");
await mongo.connect();
const db = mongo.db("nexus-maut-demo");
const journey = (name) => db.collection("journeys").findOne({ name });
const withPositions = await db.collection("customerPositions").aggregate([{ $group: { _id: "$customerId", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 1 }]).next();

const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) rej(new Error(JSON.stringify(m.error)));
    else res(m.result);
  } else if (m.method) listeners.forEach((l) => l(m));
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "js error");
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });

async function nav(path, wait = 1800) {
  const loaded = new Promise((r) => {
    const l = (m) => {
      if (m.method === "Page.loadEventFired") {
        listeners.splice(listeners.indexOf(l), 1);
        r();
      }
    };
    listeners.push(l);
  });
  await send("Page.navigate", { url: B + path });
  await loaded;
  await sleep(wait);
}
async function waitFor(cond, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await js(`!!(${cond})`)) return;
    await sleep(250);
  }
  throw new Error(`timeout: ${cond}`);
}
/** Clicks the nth element matching `sel` whose text contains `text`. */
async function click(sel, text = "", nth = 0) {
  const ok = await js(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.textContent.includes(${JSON.stringify(text)})); const e = els[${nth}]; if (!e) return false; e.scrollIntoView({block: "center"}); e.click(); return true; })()`);
  if (!ok) throw new Error(`no ${sel} with «${text}» #${nth}`);
  await sleep(900);
}
async function capture(name, clip) {
  if (only.length && !only.includes(name)) return;
  // the Next.js dev indicator isn't part of the app
  await js("document.querySelectorAll('nextjs-portal').forEach(e => e.remove())");
  const r = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: true });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
  console.log("shot", name, Math.round(clip.width), "×", Math.round(clip.height));
}
const viewport = (name, h = H) => capture(name, { x: 0, y: 0, width: W, height: h });
/** The element's box (document coordinates), with a margin. */
async function element(name, sel, pad = 0, idx = -1) {
  const rect = await js(`(() => { const els = document.querySelectorAll(${JSON.stringify(sel)}); const e = els[${idx} < 0 ? els.length + ${idx} : ${idx}]; const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`);
  await capture(name, { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.width + 2 * pad, height: rect.height + 2 * pad });
}
const modalOpenScroll = () => js(`document.querySelectorAll('.modal').forEach(m => { m.style.maxHeight = 'none'; m.scrollTop = 0; })`);

// ---- logged out ----
await send("Network.enable");
await send("Network.clearBrowserCookies");
await nav("/");
await viewport("mau-landing", 900);
await nav("/impressum");
await viewport("mau-impressum", 700);

// ---- as Lea Keller (admin) ----
await send("Network.setCookie", { name: "sid", value: SID, domain: "localhost", path: "/", httpOnly: true });
await nav("/", 2500);
await viewport("mau-start");

await nav("/customers", 2500);
await click("button.accordion-toggle", "", 1);
await sleep(1500);
await js("scrollTo(0, 0)");
await viewport("mau-customers");

await nav(`/customers/${withPositions._id.toHexString()}`, 2500);
await viewport("mau-customer");

await nav("/rules", 2500);
await viewport("mau-rules", 620);
await click("button", "Bearbeiten", 3);
await sleep(1500);
if (await js("!!document.querySelector('.modal')")) {
  await modalOpenScroll();
  await element("mau-rule-editor", ".modal", 0);
} else {
  await viewport("mau-rule-editor");
}

const willkommen = await journey("Willkommen Neukunden");
await nav("/journeys", 2500);
await click("button", "Schritte (3)", 0);
await waitFor("document.querySelector('.modal') && document.querySelector('.modal').textContent.includes('Optionen')");
await sleep(800);
await modalOpenScroll();
await element("mau-journey-steps", ".modal", 0);
await click(".modal button", "Optionen (6)", 0);
await waitFor("document.querySelectorAll('.modal').length === 2");
await sleep(600);
await element("mau-feedback-options", ".modal", 0, -1);
await click(".modal button", "Schliessen", 0);
await waitFor("document.querySelectorAll('.modal').length === 1");
await click(".modal button", "Testen", 1);
await waitFor("document.querySelectorAll('.modal').length === 2");
await sleep(1200);
await js("document.querySelectorAll('.modal')[1].querySelector('.btn-primary').click()");
await waitFor("document.querySelectorAll('.modal')[1].querySelector('.step-preview')", 20000);
await sleep(3500);
await js(`document.querySelectorAll('.modal')[1].style.maxHeight = 'none'`);
await element("mau-step-test", ".modal", 0, -1);

await send("Emulation.setDeviceMetricsOverride", { width: 1760, height: H, deviceScaleFactor: DSF, mobile: false });
await nav(`/customer-journeys?journey=${willkommen._id.toHexString()}`, 3000);
await capture("mau-cj", { x: 0, y: 0, width: 1760, height: H });
await click("button.accordion-toggle", "", 3);
await waitFor("document.querySelector('.accordion-body select.step-status')");
await sleep(1200);
await element("mau-cj-steps", ".accordion-body", 0, 0);
await click(".accordion-body button", "API", 1);
await waitFor("document.querySelector('.modal') && document.querySelector('.modal').textContent.includes('feedbackUrl')", 20000);
await sleep(800);
await modalOpenScroll();
await element("mau-api", ".modal", 0);
await click(".modal button", "Schliessen", 0);
await click("button.btn-danger-solid", "Ausführen", 0);
await waitFor("document.querySelector('.modal') && document.querySelector('.modal').textContent.includes('werden ausgeführt')");
await sleep(600);
await element("mau-execute", ".modal", 0);
await click(".modal button", "Abbrechen", 0);

// Event journey «Hypothek verlängern»: its event (trigger service, last call, «Journeys starten») above the runs
const hypo = await journey("Hypothek verlängern");
await nav(`/customer-journeys?journey=${hypo._id.toHexString()}`, 3000);
await capture("mau-event", { x: 0, y: 0, width: 1760, height: H });

await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
// Data Management: Initial Upload with the list of earlier uploads («Upload Daten löschen» switched on)
await nav("/admin?tab=data", 2500);
await click("label.switch-field", "Upload Daten löschen", 0);
await waitFor("document.querySelector('[role=tabpanel]:not([hidden])').textContent.includes('Kernsystem Neukunden')");
await sleep(800);
await element("mau-data", "[role=tabpanel]:not([hidden]) .card", 0, 0);

for (const [tab, name] of [["services", "mau-services"], ["actions", "mau-actions"], ["auth", "mau-auth"]]) {
  await nav(`/admin?tab=${tab}`, 2500);
  await element(name, name === "mau-actions" ? "[role=tabpanel]:not([hidden]) .card .table-wrap" : "[role=tabpanel]:not([hidden]) .card", name === "mau-actions" ? 12 : 0, 0);
}

ws.close();
await mongo.close();
