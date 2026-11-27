import "server-only";
import { ObjectId, type Collection, type Document, type Filter } from "mongodb";
import { DOMAINS, type DomainName } from "@/lib/domains";
import { LOG_ACTIONS, type LogAction, type LogEntryView } from "@/lib/logfile";
import { currentUser } from "./auth";
import { collections, type ChangeLogDoc, type Collections } from "./db";

// Logfile (Admin → Logfile, like the change log of nexusEAM): who changed what and when.
// Written centrally by `route()` (http.ts) for every successful POST / PUT / PATCH / DELETE of
// the API: the path tells the area and record (ROUTES), the record is read before and after the
// change and the differences are stored field by field (old → new) with German labels;
// attribute ids in values are resolved to attribute names. Actions that aren't plain changes
// («Ausführen», «Daten prüfen», «Journeys starten», API keys …) are logged with a short note
// from the answer. Never logged: reads, tests / previews, logins, secrets (passwords, keys,
// tokens – only «geändert»). Reorder-only changes (sort) and updates without differences make
// no entry. Logging never fails the request itself.

export { LOG_ACTIONS, type LogAction };

type Col = keyof Collections;
type Spec = {
  area: string;
  col: Col;
  /** the record's name for the log (stored as it was) */
  name: (doc: Document) => string;
  /** a page showing it */
  link?: (doc: Document, ids: string[]) => string | null;
};

const short = (s: unknown, n = 60) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Record routes: path pattern (":" = an id) → area, collection, name. Longest match wins. */
const ROUTES: [string, Spec][] = [
  ["customers/:", { area: "Kunde", col: "customers", name: (d) => `${d.name} ${d.lastname}${d.externalId ? ` (${d.externalId})` : ""}`, link: (_d, ids) => `/customers/${ids[0]}` }],
  ["customers/:/positions/:", { area: "Position", col: "customerPositions", name: (d) => (d.externalId ? `${d.externalId} · ${d.productServiceType}` : d.productServiceType), link: (_d, ids) => `/customers/${ids[0]}` }],
  ["customers/:/positions/:/transactions/:", { area: "Transaktion", col: "positionTransactions", name: (d) => d.externalId || "Transaktion", link: (_d, ids) => `/customers/${ids[0]}` }],
  ["customers/:/products/:", { area: "Produkt", col: "customerProducts", name: (d) => d.name, link: (_d, ids) => `/customers/${ids[0]}` }],
  ["customers/:/communication-preferences/:", { area: "Kommunikationspräferenz", col: "customerComPrefs", name: (d) => d.comPrefType, link: (_d, ids) => `/customers/${ids[0]}` }],
  ["customer-attributes/:", { area: "Kundenattribut", col: "customerAttributes", name: (d) => d.attribute }],
  ["domains/:", { area: "Werteliste", col: "domainValues", name: (d) => `${d.label} (${DOMAINS[d.domain as DomainName]?.title ?? d.domain})` }],
  ["domains/:/position-attributes/:", { area: "Positionsattribut", col: "positionAttributes", name: (d) => d.attribute }],
  ["domains/:/trx-attributes/:", { area: "Transaktionsattribut", col: "trxAttributes", name: (d) => d.attribute }],
  ["actions/:", { area: "Aktion", col: "actions", name: (d) => d.name }],
  ["actions/:/attributes/:", { area: "Aktionsattribut", col: "actionAttributes", name: (d) => d.attribute }],
  ["services/:", { area: "Service", col: "services", name: (d) => d.name }],
  ["services/:/put-attributes/:", { area: "Service-Attribut", col: "servicePutAttributes", name: (d) => `${d.attribute} (PUT)` }],
  ["services/:/get-attributes/:", { area: "Service-Attribut", col: "serviceGetAttributes", name: (d) => `${d.attribute} (GET)` }],
  ["journeys/:", { area: "Journey", col: "journeys", name: (d) => d.name, link: () => "/journeys" }],
  ["journeys/:/steps/:", { area: "Journey-Schritt", col: "journeySteps", name: (d) => short(d.content, 50) || "Schritt", link: () => "/journeys" }],
  ["journeys/:/steps/:/feedback-options/:", { area: "Feedback-Option", col: "feedbackOptions", name: (d) => d.option, link: () => "/journeys" }],
  ["rules/:", { area: "Kunden Selektion", col: "rules", name: (d) => d.name, link: () => "/rules" }],
  ["customer-journeys/:", { area: "KundenJourney", col: "customerJourneys", name: () => "KundenJourney", link: (d) => (d.journeyId ? `/customer-journeys?journey=${d.journeyId}` : null) }],
  ["customer-journeys/:/steps/:", { area: "KundenJourney-Schritt", col: "customerJourneySteps", name: (d) => short(d.template, 50) || "Schritt" }],
  ["customer-journeys/:/steps/:/feedbacks/:", { area: "Kundenfeedback", col: "customerFeedbacks", name: (d) => short(d.feedback) }],
  ["events/:", { area: "Event", col: "events", name: (d) => d.name }],
  ["text-blocks/:", { area: "Textbaustein", col: "textBlocks", name: (d) => `${d.label} (${d.code})`, link: () => "/admin?tab=text-blocks" }],
  ["users/:", { area: "Benutzer", col: "users", name: (d) => `${d.name} (${d.email})`, link: () => "/admin?tab=users" }],
];

/** Endpoints that aren't record changes: method + pattern → area / action (note from the answer). */
const OPERATIONS: { method: string; pattern: string; area: string; action: LogAction; note?: (body: Document) => string }[] = [
  { method: "POST", pattern: "customer-journeys", area: "KundenJourney", action: "assigned", note: (b) => `${b.created} zugewiesen, ${b.skipped} übersprungen` },
  { method: "POST", pattern: "customer-journeys/execute", area: "KundenJourney", action: "executed", note: (b) => `${b.sent ?? 0} gesendet${b.failed ? `, ${b.failed} Fehler` : ""}${b.dataErrors ? `, ${b.dataErrors} Datenfehler` : ""}` },
  { method: "POST", pattern: "customer-journeys/check", area: "KundenJourney", action: "checked", note: (b) => (b.steps !== undefined ? `${b.steps} Schritte geprüft, ${b.errors ?? 0} Datenfehler` : "") },
  { method: "POST", pattern: "customers/refresh-services", area: "Kunde", action: "refreshed" },
  { method: "POST", pattern: "customers/:/refresh-services", area: "Kunde", action: "refreshed" },
  { method: "POST", pattern: "service-attributes/refresh", area: "Kundenattribut", action: "refreshed" },
  { method: "POST", pattern: "events/:/call", area: "Event", action: "called", note: (b) => (b.lastCall ? (b.lastCall.ok || b.lastCall.mock ? "ok" : `Fehler: ${b.lastCall.error ?? ""}`) : "") },
  { method: "POST", pattern: "events/:/start", area: "Event", action: "started", note: (b) => (b.lastStart ? `${b.lastStart.created} gestartet, ${b.lastStart.skipped} übersprungen, ${b.lastStart.unknown?.length ?? 0} unbekannt` : "") },
  { method: "POST", pattern: "actions/:/api-key", area: "Aktion", action: "keyCreated" },
  { method: "DELETE", pattern: "actions/:/api-key", area: "Aktion", action: "keyRevoked" },
  { method: "POST", pattern: "account/password", area: "Benutzer", action: "passwordChanged" },
];

/** Settings documents (one per kind) – `settings` collection, `_id` = the kind. */
const SETTINGS: Record<string, string> = { "settings/auth": "Anmeldung", "settings/mail": "E-Mail-Versand", account: "Mein Konto" };

/** Not logged at all: reads disguised as POST, tests, logins, the upload (logs itself). */
const SKIP = [/^auth\//, /\/test$/, /\/preview$/, /^rules\/preview$/, /\/action-request$/, /^services\/[^/]+\/call$/, /^settings\/mail\/test$/, /^data-management\//];

/** a record id in a path: ObjectId, a local user id, or an OIDC subject (has digits) – not a word like «refresh-services» */
const isId = (s: string) => /^[0-9a-f]{24}$/i.test(s) || /^local_/.test(s) || (/\d/.test(s) && s.length >= 8);
function match(pattern: string, segs: string[]): string[] | null {
  const p = pattern.split("/");
  if (p.length !== segs.length) return null;
  const ids: string[] = [];
  for (let i = 0; i < p.length; i++) {
    if (p[i] === ":") {
      if (!isId(segs[i])) return null;
      ids.push(segs[i]);
    } else if (p[i] !== segs[i]) return null;
  }
  return ids;
}

// ---- formatting the differences -------------------------------------------------------------

const SKIP_FIELDS = new Set([
  "_id", "createdAt", "updatedAt", "sort", "serviceFetched", "lastCall", "lastStart", "execution", "dataStatus", "dataProblems",
  "dataCheckedAt", "unfilled", "doneAt", "completedAt", "lastLoginAt", "updatedBy", "createdBy", "passwordChangedAt", "customerId", "journeyId_", "stepId", "typeId", "serviceId_",
]);
const SECRET = /pass|secret|hash|token|apikey|api_key/i;

const LABELS: Record<string, string> = {
  name: "Name", lastname: "Nachname", dateOfBirth: "Geburtsdatum", description: "Beschreibung", url: "URL", content: "Inhalt",
  template: "Inhalt", status: "Status", attribute: "Attribut", attributeType: "Typ", options: "Optionen", externalId: "ID",
  productServiceType: "Typ", journeyType: "Journey-Typ", contentFormat: "Inhaltsformat", maxChars: "Zeichengrenze",
  updateFrequency: "Aktualisierung", idRef: "ID-Bezug", role: "Rolle", label: "Bezeichnung", category: "Kategorie", code: "Code",
  active: "aktiv", mock: "Mock", serviceType: "Servicetyp", note: "Notiz", feedback: "Feedback", feedbackComment: "Kommentar",
  feedbackRating: "Bewertung", option: "Option", meaning: "Bedeutung", match: "Verknüpfung", conditions: "Bedingungen",
  actionId: "Aktion", journeyId: "Journey", serviceId: "Service", usageInstruction: "Verwendungshinweis", comPrefType: "Art",
  email: "E-Mail", firstname: "Vorname", mode: "Anmeldeart", allowRegistration: "Registrierung erlaubt", host: "SMTP-Server",
  passwordEnc: "Passwort", passwordHash: "Passwort", port: "Port", user: "Benutzer", from: "Absender", replyTo: "Antwort an", list: "Liste", service: "Service-Quelle", domain: "Werteliste",
};

/** stored codes shown with their German label */
const VALUE_LABELS: Record<string, string> = {
  proposal: "Vorschlag", ready: "Bereit zur Ausführung", suspended: "Ausgesetzt", done: "Erledigt", skipped: "Übersprungen",
  active: "aktiv", cancelled: "abgebrochen", campaign: "Kampagne", event: "Event", markdown: "Formatiert", text: "Nur Text",
  customer: "Kunde", position: "Position", transaction: "Transaktion", hourly: "Stündlich", daily: "Täglich", weekly: "Wöchentlich",
  monthly: "Monatlich", manual: "Manuell", admin: "Admin", editor: "Editor", pending: "wartend", local: "Eigene Anmeldung",
  nexusIdentity: "nexusIdentity", LEAD: "Lead", CHANCE: "Chance", INTEREST: "Interesse", INDIFFERENT: "Indifferent",
  NO_INTEREST_NOW: "Kein Interesse aktuell", NO_INTEREST: "Kein Interesse",
};
const CODED = new Set(["status", "journeyType", "contentFormat", "idRef", "updateFrequency", "role", "mode", "meaning"]);

const day = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join(".");
function fmt(v: unknown, names: Map<string, string>): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return v.getUTCHours() || v.getUTCMinutes() ? `${day(v)} ${v.toISOString().slice(11, 16)}` : day(v);
  if (v instanceof ObjectId) return names.get(v.toHexString()) ?? v.toHexString();
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  if (Array.isArray(v)) return short(v.map((x) => (typeof x === "object" && x !== null && !(x instanceof ObjectId) && !(x instanceof Date) ? JSON.stringify(x) : fmt(x, names))).join(", "), 300);
  if (typeof v === "object") return short(JSON.stringify(v), 300);
  return short(v, 300);
}

/** Flattens one level of nested objects (values / attributes by id) for the comparison. */
function flatten(doc: Document | null): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(doc ?? {})) {
    if (SKIP_FIELDS.has(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof ObjectId) && (k === "values" || k === "attributes")) {
      for (const [k2, v2] of Object.entries(v)) out.set(`${k}.${k2}`, v2);
    } else out.set(k, v);
  }
  return out;
}

/** Names for ids that may appear in records: attributes, actions, journeys, services, customers. */
async function namesFor(ids: string[]) {
  const names = new Map<string, string>();
  const oids = [...new Set(ids)].filter((i) => /^[0-9a-f]{24}$/i.test(i)).map((i) => new ObjectId(i));
  if (!oids.length) return names;
  const c = await collections();
  const sources: [Collection<Document>, (d: Document) => string][] = [
    [c.customerAttributes as unknown as Collection<Document>, (d) => d.attribute],
    [c.positionAttributes as unknown as Collection<Document>, (d) => d.attribute],
    [c.trxAttributes as unknown as Collection<Document>, (d) => d.attribute],
    [c.actionAttributes as unknown as Collection<Document>, (d) => d.attribute],
    [c.actions as unknown as Collection<Document>, (d) => d.name],
    [c.journeys as unknown as Collection<Document>, (d) => d.name],
    [c.services as unknown as Collection<Document>, (d) => d.name],
    [c.customers as unknown as Collection<Document>, (d) => `${d.name} ${d.lastname}`],
  ];
  await Promise.all(
    sources.map(async ([col, name]) => {
      for (const d of await col.find({ _id: { $in: oids } }).toArray()) names.set((d._id as ObjectId).toHexString(), name(d));
    }),
  );
  return names;
}

/** Field-level differences of two snapshots (secrets only as «geändert»). */
export async function diff(before: Document | null, after: Document | null, area = "") {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const ids = keys.flatMap((k) => {
    const parts = [k.split(".")[1] ?? ""];
    for (const v of [a.get(k), b.get(k)]) if (v instanceof ObjectId) parts.push(v.toHexString());
    return parts;
  });
  const names = await namesFor(ids);
  const changes: { field: string; from: string; to: string }[] = [];
  for (const k of keys) {
    const [top, sub] = k.split(".");
    if (SECRET.test(top)) {
      if (JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k))) changes.push({ field: LABELS[top] ?? top, from: "", to: "(geändert)" });
      continue;
    }
    const label = (v: unknown) => (CODED.has(top) && typeof v === "string" ? (VALUE_LABELS[v] ?? v) : fmt(v, names));
    const from = label(a.get(k));
    const to = label(b.get(k));
    if (from === to) continue;
    const field = sub ? (names.get(sub) ?? sub) : top === "name" && area === "Kunde" ? "Vorname" : (LABELS[top] ?? top);
    changes.push({ field, from, to });
  }
  return changes;
}

// ---- writing --------------------------------------------------------------------------------

type Actor = { id: string; name: string; email: string } | null;

/** Writes one entry; errors are only reported (the change itself already happened). */
export async function writeLog(e: Omit<ChangeLogDoc, "_id" | "at" | "userId" | "userName" | "userEmail">, actor: Actor) {
  try {
    const { changeLogs } = await collections();
    await changeLogs.insertOne({ _id: new ObjectId(), at: new Date(), userId: actor?.id ?? null, userName: actor?.name ?? "System", userEmail: actor?.email ?? "", ...e });
  } catch (err) {
    console.error("Logfile entry could not be written", err);
  }
}

const findDoc = async (col: Col, id: string) => {
  const c = await collections();
  const coll = c[col] as unknown as Collection<Document>;
  // users have string ids, everything else ObjectIds
  const filter = { _id: /^[0-9a-f]{24}$/i.test(id) ? new ObjectId(id) : id } as unknown as Filter<Document>;
  return coll.findOne(filter);
};

/**
 * Called by `route()` before a mutating request: works out what will change and reads it;
 * `finish(res)` after a successful answer writes the entry. Null when nothing is logged.
 */
export async function startLog(req: Request): Promise<{ finish: (res: Response) => Promise<void> } | null> {
  const path = new URL(req.url).pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  if (SKIP.some((re) => re.test(path))) return null;
  const segs = path.split("/");
  const method = req.method;
  // the body is read by the handler – keep a copy for operations that name their journey in it
  const reqCopy = method === "POST" && segs[0] === "customer-journeys" ? req.clone() : null;
  const me = await currentUser().catch(() => null);
  const actor: Actor = me ? { id: me._id, name: me.name, email: me.email } : null;

  // operations: a note from the answer
  for (const op of OPERATIONS) {
    if (op.method !== method) continue;
    const ids = match(op.pattern, segs);
    if (!ids) continue;
    const target = ids[0] ? ROUTES.find(([p]) => p.split("/").length === 2 && p.startsWith(op.pattern.split("/")[0] + "/")) : undefined;
    return {
      finish: async (res) => {
        const body = await res.clone().json().catch(() => ({}));
        let entityName = op.area;
        if (ids[0] && target) {
          const d = await findDoc(target[1].col, ids[0]).catch(() => null);
          if (d) entityName = target[1].name(d);
        }
        if (op.pattern === "customer-journeys" || op.pattern.startsWith("customer-journeys/")) {
          const j = await reqCopy?.json().catch(() => null);
          const journey = j?.journeyId ? await findDoc("journeys", j.journeyId).catch(() => null) : null;
          if (journey) entityName = journey.name;
        }
        await writeLog({ area: op.area, entityId: ids[0] ?? "", entityName, action: op.action, changes: [], note: op.note ? op.note(body) : "", link: null }, actor);
      },
    };
  }

  // settings documents
  const setting = SETTINGS[path];
  if (setting && (method === "PUT" || method === "PATCH" || method === "DELETE")) {
    const id = path === "account" ? (actor?.id ?? "") : path.split("/")[1];
    const col: Col = path === "account" ? "users" : "settings";
    const before = id ? await findDoc(col, id).catch(() => null) : null;
    return {
      finish: async () => {
        const after = id ? await findDoc(col, id).catch(() => null) : null;
        const changes = await diff(before, after);
        if (!changes.length && method !== "DELETE") return;
        await writeLog({ area: setting, entityId: id, entityName: setting, action: method === "DELETE" ? "deleted" : "updated", changes, note: method === "DELETE" ? "auf Standard zurückgesetzt" : "", link: null }, actor);
      },
    };
  }

  // records: change / delete (path = record) or create (POST to its list)
  let spec: Spec | null = null;
  let ids: string[] = [];
  let creating = false;
  for (const [pattern, s] of ROUTES) {
    const m = match(pattern, segs);
    if (m && (method === "PUT" || method === "PATCH" || method === "DELETE")) {
      spec = s;
      ids = m;
    }
    const parent = pattern.replace(/\/:$/, "");
    const mp = method === "POST" ? match(parent, segs) : null;
    if (mp) {
      spec = s;
      ids = mp;
      creating = true;
    }
  }
  if (!spec) return null;
  const s = spec;
  const before = creating ? null : await findDoc(s.col, ids[ids.length - 1]).catch(() => null);
  return {
    finish: async (res) => {
      let id = creating ? "" : ids[ids.length - 1];
      if (creating) {
        const body = await res.clone().json().catch(() => null);
        id = typeof body?.id === "string" ? body.id : "";
        if (!id) return;
      }
      const after = method === "DELETE" ? null : await findDoc(s.col, id).catch(() => null);
      const doc = after ?? before;
      if (!doc) return;
      const action: LogAction = creating ? "created" : method === "DELETE" ? "deleted" : "updated";
      const changes = action === "updated" ? await diff(before, after, s.area) : [];
      if (action === "updated" && !changes.length) return; // e.g. reordered only
      await writeLog(
        { area: s.area, entityId: id, entityName: s.name(doc) || s.area, action, changes, note: "", link: s.link?.(doc, creating ? [...ids, id] : ids) ?? null },
        actor,
      );
    },
  };
}

// ---- reading (Admin → Logfile) --------------------------------------------------------------

export const LOG_PAGE_SIZE = 100;

export type LogFilter = { area?: string; user?: string; action?: string; from?: string; to?: string; q?: string };

export async function listLog(f: LogFilter, limit = LOG_PAGE_SIZE) {
  const { changeLogs } = await collections();
  const filter: Filter<ChangeLogDoc> = {};
  if (f.area) filter.area = f.area;
  if (f.user) filter.userId = f.user === "system" ? null : f.user;
  if (f.action) filter.action = f.action;
  if (f.from || f.to) {
    filter.at = {
      ...(f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) && { $gte: new Date(`${f.from}T00:00:00.000Z`) }),
      ...(f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) && { $lte: new Date(`${f.to}T23:59:59.999Z`) }),
    };
  }
  if (f.q?.trim()) filter.entityName = { $regex: f.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const rows = await changeLogs.find(filter).sort({ at: -1, _id: -1 }).limit(limit + 1).toArray();
  return {
    entries: rows.slice(0, limit).map(({ _id, at, ...r }): LogEntryView => ({ ...r, id: _id.toHexString(), at: at.toISOString() })),
    more: rows.length > limit,
  };
}

/** Choices for the filters: areas and users that occur in the log. */
export async function logFilterOptions() {
  const { changeLogs } = await collections();
  const [areas, users] = await Promise.all([
    changeLogs.distinct("area"),
    changeLogs.aggregate<{ _id: string | null; name: string }>([{ $group: { _id: "$userId", name: { $last: "$userName" } } }, { $sort: { name: 1 } }]).toArray(),
  ]);
  return { areas: areas.sort((a, b) => a.localeCompare(b, "de")), users: users.map((u) => ({ id: u._id ?? "system", name: u.name })) };
}
