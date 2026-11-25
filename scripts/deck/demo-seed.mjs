// Fills the demo database nexus-maut-demo (local MongoDB 27019) through a demo instance of the app
// on :3016 – fictional data only («Musterbank», demo users Lea Keller / Marco Brunner), for the
// sales deck screenshots. Run from the repo root while the demo instance runs (see CLAUDE.md →
// «Sales deck»):  node scripts/deck/demo-seed.mjs
// The demo users' generated passwords and Lea's session go to $DEMO_DIR (default: the OS temp dir).
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { MongoClient } from "mongodb";

const B = "http://localhost:3016";
const DIR = process.env.DEMO_DIR ?? tmpdir();
const DB = "nexus-maut-demo";
const client = new MongoClient("mongodb://localhost:27019");
await client.connect();
const db = client.db(DB);
if (db.databaseName !== DB) throw new Error("wrong db");
await db.dropDatabase();

let cookie = "";
async function call(path, { method, body, sid = cookie } = {}) {
  const r = await fetch(B + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { ...(sid && { Cookie: `sid=${sid}` }), ...(body !== undefined && { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method ?? "POST"} ${path} → ${r.status} ${JSON.stringify(json)}`);
  const set = r.headers.get("set-cookie");
  return { json, sid: set ? /sid=([^;]+)/.exec(set)?.[1] : undefined };
}

// ---- demo users ----
const creds = {
  lea: { firstname: "Lea", lastname: "Keller", email: "lea.keller@musterbank.example", password: randomBytes(12).toString("base64url") },
  marco: { firstname: "Marco", lastname: "Brunner", email: "marco.brunner@musterbank.example", password: randomBytes(12).toString("base64url") },
};
writeFileSync(`${DIR}/nexus-maut-demo-credentials.json`, JSON.stringify(creds, null, 2));
cookie = (await call("/api/auth/register", { body: creds.lea })).sid;
await call("/api/auth/register", { body: creds.marco, sid: "" });
const marco = await db.collection("users").findOne({ email: creds.marco.email });
await call(`/api/users/${marco._id}`, { method: "PATCH", body: { role: "editor" } });

// ---- customer attributes, product types ----
await call("/api/customer-attributes", { body: { attribute: "Anrede", attributeType: "list", options: ["Frau", "Herr"] } });
const domain = async (d, code, label) => (await call("/api/domains", { body: { domain: d, code, label } })).json.id;
const attrs = async (typeId, kind, list) => {
  for (const [attribute, attributeType, options = []] of list) await call(`/api/domains/${typeId}/${kind}-attributes`, { body: { attribute, attributeType, options } });
};
const konto = await domain("productServiceType", "konto", "Privatkonto");
await attrs(konto, "position", [["IBAN", "alpha"], ["Saldo", "num"], ["Eröffnet am", "date"]]);
await attrs(konto, "trx", [["Datum", "date"], ["Buchungstext", "alpha"], ["Betrag", "num"]]);
const depot = await domain("productServiceType", "depot", "Wertschriftendepot");
await attrs(depot, "position", [["Depotnummer", "alpha"], ["Depotwert", "num"], ["Strategie", "list", ["Einkommen", "Ausgewogen", "Wachstum"]]]);
await attrs(depot, "trx", [["Datum", "date"], ["Titel", "alpha"], ["Betrag", "num"]]);
const hypo = await domain("productServiceType", "hypothek", "Hypothek");
await attrs(hypo, "position", [["Betrag", "num"], ["Zinssatz %", "num"], ["Laufzeit bis", "date"]]);
await attrs(hypo, "trx", [["Datum", "date"], ["Zins", "num"]]);

// ---- 100 sample customers (seeded) ----
execFileSync("node", ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--disable-warning=ExperimentalWarning", "scripts/sample-data.mts", "create"], {
  env: { ...process.env, MONGODB_URI: "mongodb://localhost:27019", MONGODB_DB: DB },
  stdio: "inherit",
});

// ---- «ID»s for the sample data (fictional Kunden-, Positions-, Transaktionsnummern) ----
const numberAll = async (col, prefix, digits, start) => {
  const docs = await db.collection(col).find({}, { projection: { _id: 1 } }).sort({ customerId: 1, lastname: 1, name: 1, sort: 1, _id: 1 }).toArray();
  if (docs.length)
    await db.collection(col).bulkWrite(docs.map((d, i) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { externalId: prefix + String(start + i).padStart(digits, "0") } } } })));
};
await numberAll("customers", "K", 6, 100001);
await numberAll("customerPositions", "P", 6, 1);
await numberAll("positionTransactions", "T", 7, 1);

// ---- service (mock) + «Service» customer attribute ----
await domain("serviceType", "bonitaet", "Bonität");
await domain("serviceType", "crm", "CRM");
const svc = (await call("/api/services", { body: { name: "Bonitätsprüfung", serviceType: "bonitaet", url: "https://bonitaet.example.com/api/pruefung", mock: true } })).json.id;
for (const a of ["Vorname", "Nachname", "Geburtsdatum"]) await call(`/api/services/${svc}/put-attributes`, { body: { attribute: a, attributeType: a === "Geburtsdatum" ? "date" : "alpha", options: [] } });
const stufe = (await call(`/api/services/${svc}/get-attributes`, { body: { attribute: "Bonitätsstufe", attributeType: "list", options: ["A", "B", "C"] } })).json.id;
await call(`/api/services/${svc}/get-attributes`, { body: { attribute: "Score", attributeType: "num", options: [] } });
const crm = (await call("/api/services", { body: { name: "CRM Kundenkontakte", serviceType: "crm", url: "https://crm.example.com/api/kontakte", mock: true } })).json.id;
await call(`/api/services/${crm}/put-attributes`, { body: { attribute: "Nachname", attributeType: "alpha", options: [] } });
await call(`/api/services/${crm}/get-attributes`, { body: { attribute: "Letzter Kontakt", attributeType: "date", options: [] } });
await call("/api/customer-attributes", { body: { attribute: "Bonität", attributeType: "list", options: [], service: { serviceId: svc, attrId: stufe } } });
await call("/api/customers/refresh-services", { body: {} });

// ---- actions ----
const action = async (name, description, url) => (await call("/api/actions", { body: { name, description, url } })).json.id;
const brief = await action("Willkommensbrief", "Persönlicher Brief, gedruckt und per Post versandt", "https://druck.example.com/api/briefe");
const anruf = await action("Beratungsanruf", "Anruf durch das Kundencenter", "https://kundencenter.example.com/api/anrufe");
const termin = await action("Einladung Finanz-Check", "E-Mail-Einladung zu einem Beratungstermin", "https://termine.example.com/api/einladungen");
const karte = await action("Geburtstagskarte", "Karte mit Gutschein zum Geburtstag", "");
await call(`/api/actions/${anruf}/api-key`, { body: {} });
await call(`/api/actions/${brief}/api-key`, { body: {} });

// ---- Kunden Selektionen ----
const types = (await call("/api/domains?domain=productServiceType")).json;
const typeId = (code) => types.find((t) => t.code === code).id;
const trxAttrs = (await call(`/api/domains/${typeId("kreditkarte")}/trx-attributes`)).json;
const trxAttr = (name) => trxAttrs.find((a) => a.attribute === name).id;
const bonitaet = (await call("/api/customer-attributes")).json.find((a) => a.attribute === "Bonität").id;
const rule = async (name, description, match, conditions) => (await call("/api/rules", { body: { name, description, match, conditions } })).json.id;
const geburtstag = await rule("Geburtstag in den nächsten 30 Tagen", "Für die Geburtstagskarte", "all", [{ level: "customer", field: "dateOfBirth", op: "anniversaryNext", value: 30 }]);
const jung = await rule("Junge Erwachsene 18–35", "Neue Kundinnen und Kunden am Anfang ihres Berufslebens", "all", [
  { level: "customer", field: "age", op: "gte", value: 18 },
  { level: "customer", field: "age", op: "lte", value: 35 },
]);
const sparer = await rule("Sparer ohne Depot", "Sparguthaben, aber noch keine Anlage", "all", [
  { level: "position", type: "sparkonto", filter: null, op: "gte", value: 1 },
  { level: "position", type: "depot", filter: null, op: "eq", value: 0 },
]);
await rule("Kartenumsatz ≥ CHF 1'000 in 90 Tagen", "Aktive Kartenkunden", "all", [
  { level: "trx", type: "kreditkarte", filter: null, period: { dateAttrId: trxAttr("Datum"), days: 90 }, measure: "sum", sumAttrId: trxAttr("Betrag"), op: "gte", value: 1000 },
]);
await rule("Top-Bonität", "Bonitätsstufe A aus der Bonitätsprüfung", "all", [{ level: "customer", field: "attribute", attrId: bonitaet, op: "eq", value: "A" }]);

// ---- journeys with steps and feedback options ----
const journey = async (name, description, steps, journeyType = "campaign") => {
  const id = (await call("/api/journeys", { body: { name, description, journeyType } })).json.id;
  for (const [actionId, content, options] of steps) {
    const sid = (await call(`/api/journeys/${id}/steps`, { body: { actionId, content } })).json.id;
    for (const [option, meaning] of options) await call(`/api/journeys/${id}/steps/${sid}/feedback-options`, { body: { option, meaning } });
  }
  return id;
};
const OPTS_CALL = [["Termin vereinbart", "LEAD"], ["Offerte gewünscht", "CHANCE"], ["Interessiert, später melden", "INTEREST"], ["Nicht erreicht", "INDIFFERENT"], ["Im Moment kein Bedarf", "NO_INTEREST_NOW"], ["Kein Interesse", "NO_INTEREST"]];
const willkommen = await journey("Willkommen Neukunden", "Begrüssung, erster Kontakt und Einladung zum Finanz-Check", [
  [brief, "Guten Tag {{Kunde.Anrede}} {{Kunde.Nachname}}\n\nHerzlich willkommen bei der Musterbank! Ihre Produkte: {{Produkt.Name}}.\nWir freuen uns, Sie zu begleiten.\n\nFreundliche Grüsse\nIhre Musterbank", [["Rückmeldung erhalten", "INTEREST"], ["Kein Interesse", "NO_INTEREST"]]],
  [anruf, "Anruf bei {{Kunde.Vorname}} {{Kunde.Nachname}} ({{Kunde.Alter}} Jahre): Fragen zum Start klären, Kreditkarte und Sparkonto anbieten. Bonität: {{Kunde.Bonität}}.", OPTS_CALL],
  [termin, "{{Kunde.Anrede}} {{Kunde.Nachname}}, wir laden Sie zu einem kostenlosen Finanz-Check ein – 30 Minuten, bei Ihnen oder online.", [["Termin gebucht", "LEAD"], ["Später", "NO_INTEREST_NOW"], ["Abgelehnt", "NO_INTEREST"]]],
]);
const anlage = await journey("Anlageberatung für Sparer", "Sparerinnen und Sparern den Einstieg ins Anlegen zeigen", [
  [anruf, "Anruf bei {{Kunde.Vorname}} {{Kunde.Nachname}}: Sparkonto {{Position.sparkonto.IBAN}}, Zinssatz {{Position.sparkonto.Zinssatz %}} % – Fondssparplan vorstellen.", OPTS_CALL],
  [termin, "Einladung zur Anlageberatung für {{Kunde.Anrede}} {{Kunde.Nachname}}.", [["Termin gebucht", "LEAD"], ["Unterlagen gewünscht", "CHANCE"], ["Kein Interesse", "NO_INTEREST"]]],
]);
const gebtag = await journey("Geburtstagsgruss", "Karte mit Gutschein zum Geburtstag", [
  [karte, "Liebe(r) {{Kunde.Vorname}}, herzlichen Glückwunsch zum {{Kunde.Alter}}. Geburtstag!", [["Gutschein eingelöst", "INTEREST"]]],
]);

// Event journey: started from the event «Hypothek läuft in 6 Monaten ab»
const hypoJourney = await journey("Hypothek verlängern", "Kundinnen und Kunden vor dem Ablauf ihrer Hypothek ansprechen", [
  [anruf, "Anruf bei {{Kunde.Anrede}} {{Kunde.Nachname}}: Die Hypothek läuft bald ab – Verlängerung und Zinsabsicherung besprechen.", OPTS_CALL],
  [termin, "Einladung zur Hypothekarberatung für {{Kunde.Anrede}} {{Kunde.Nachname}}.", [["Termin gebucht", "LEAD"], ["Offerte gewünscht", "CHANCE"], ["Kein Interesse", "NO_INTEREST"]]],
], "event");

// ---- KundenJourneys ----
await call("/api/customer-journeys", { body: { journeyId: willkommen, ruleId: jung } });
await call("/api/customer-journeys", { body: { journeyId: anlage, ruleId: sparer } });
await call("/api/customer-journeys", { body: { journeyId: gebtag, ruleId: geburtstag } });

const runsOf = async (journeyId) => {
  const l = (await call(`/api/customer-journeys?journeyId=${journeyId}`)).json;
  return l.runs ?? l;
};
const setStatus = (rid, sid, status) => call(`/api/customer-journeys/${rid}/steps/${sid}`, { method: "PATCH", body: { status } });
const feedback = (rid, sid, feedback, feedbackRating, feedbackComment = "") =>
  call(`/api/customer-journeys/${rid}/steps/${sid}/feedbacks`, { body: { feedback, feedbackRating, feedbackComment } });

const wRuns = await runsOf(willkommen);
const fb = [["Termin vereinbart", 5, "Freut sich auf das Gespräch, möchte Kreditkarte Gold"], ["Offerte gewünscht", 4, "Vergleicht mit Hausbank"], ["Interessiert, später melden", 3, ""], ["Im Moment kein Bedarf", null, "Zieht im Sommer um"], ["Nicht erreicht", null, ""]];
for (const [i, r] of wRuns.entries()) {
  const steps = (await call(`/api/customer-journeys/${r.id}`)).json.steps;
  if (i < 14) await setStatus(r.id, steps[0].id, "done");
  if (i < 9) {
    await setStatus(r.id, steps[1].id, "done");
    const [f, rating, c] = fb[i % fb.length];
    await feedback(r.id, steps[1].id, f, rating, c);
  } else if (i < 14) await setStatus(r.id, steps[1].id, "ready");
  if (i < 3) await setStatus(r.id, steps[2].id, "done");
  if (i === 3) await setStatus(r.id, steps[2].id, "suspended");
  if (i >= 14 && i < 20) await setStatus(r.id, steps[0].id, "ready");
}
const aRuns = await runsOf(anlage);
for (const [i, r] of aRuns.entries()) {
  const steps = (await call(`/api/customer-journeys/${r.id}`)).json.steps;
  if (i < 4) {
    await setStatus(r.id, steps[0].id, "done");
    await feedback(r.id, steps[0].id, OPTS_CALL[i][0], [5, 4, 3, null][i]);
  } else if (i < 10) await setStatus(r.id, steps[0].id, "ready");
}
// ---- event: mocked trigger service → «Journeys starten» ----
await domain("serviceType", "triggerservice", "Trigger-Service");
const trig = (await call("/api/services", { body: { name: "Hypothek läuft ab", serviceType: "triggerservice", url: "https://kernbank.example.com/api/hypotheken/ablauf", mock: true } })).json.id;
await call(`/api/services/${trig}/get-attributes`, {
  body: { attribute: "Hypotheken", attributeType: "alpha", options: [], list: { path: "", columns: [{ attribute: "ID", attributeType: "alpha", options: [] }, { attribute: "Ablaufdatum", attributeType: "date", options: [] }] } },
});
const hypoEvent = (await call("/api/events", {
  body: { name: "Hypothek läuft in 6 Monaten ab", description: "Die Kernbank meldet Hypotheken, die in den nächsten sechs Monaten auslaufen.", serviceId: trig, updateFrequency: "daily", idRef: "customer", journeyId: hypoJourney },
})).json.id;
await call(`/api/events/${hypoEvent}/call`, { body: {} });
await call(`/api/events/${hypoEvent}/start`, { body: {} });

// ---- Data Management: a small upload from the «Kernsystem» (fictional) ----
{
  const first = ["Nina", "Luca", "Sara", "Jonas", "Elena", "David", "Mia", "Noah", "Lara", "Tim", "Alina", "Simon"];
  const last = ["Graf", "Steiner", "Frei", "Meyer", "Wyss", "Kunz", "Roth", "Baumann", "Keller", "Huber", "Schmid", "Fischer"];
  const kunden = first.map((v, i) => ({ kundennummer: `K2000${String(i + 1).padStart(2, "0")}`, vorname: v, nachname: last[i], geburtsdatum: `19${70 + i * 2}-0${(i % 9) + 1}-1${i % 9}`, anrede: i % 2 ? "Herr" : "Frau" }));
  const positionen = kunden.map((k, i) => ({ positionsnummer: `P2000${String(i + 1).padStart(2, "0")}`, kundennummer: k.kundennummer, typ: "konto", produkt: "Privatkonto", werte: { Saldo: 1500 + i * 730, "Eröffnet am": "2026-10-01" } }));
  const transaktionen = positionen.map((p, i) => ({ transaktionsnummer: `T20000${String(i + 1).padStart(2, "0")}`, positionsnummer: p.positionsnummer, kundennummer: p.kundennummer, typ: "konto", werte: { Datum: "2026-11-02", Buchungstext: "Lohn", Betrag: 4200 + i * 150 } }));
  const form = new FormData();
  form.append("files", new Blob([JSON.stringify({ kunden, positionen, transaktionen })], { type: "application/json" }), "kernsystem-neukunden.json");
  for (const [k, v] of [["mode", "upload"], ["deleteCustomers", "false"], ["deleteAttributes", "false"], ["sourceName", "Kernsystem Neukunden November"]]) form.append(k, v);
  const r = await fetch(B + "/api/data-management/initial-upload", { method: "POST", headers: { Cookie: `sid=${cookie}`, Origin: B }, body: form });
  const last1 = (await r.text()).trim().split("\n").at(-1);
  if (!r.ok || !last1.includes('"result"')) throw new Error(`upload → ${r.status} ${last1.slice(0, 300)}`);
}

await call("/api/customer-journeys/check", { body: { journeyId: willkommen } });
await call("/api/customer-journeys/check", { body: { journeyId: anlage } });

console.log(JSON.stringify({ willkommen: wRuns.length, anlage: aRuns.length, geburtstag: (await runsOf(gebtag)).length, journeyIds: { willkommen, anlage, gebtag, hypoJourney }, leaSid: cookie.slice(0, 4) + "…" }));
writeFileSync(`${DIR}/nexus-maut-demo-session.txt`, cookie);
await client.close();
