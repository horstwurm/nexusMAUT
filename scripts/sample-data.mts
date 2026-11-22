// Sample data: 100 customers with products, communication preferences,
// positions and transactions – different usage profiles, values generated
// from the attributes defined per product/service type.
//   npm run sample:create               (refuses if sample data exists)
//   npm run sample:create -- --replace  (removes the old sample data first)
//   npm run sample:remove
// Reads MONGODB_URI / MONGODB_DB from .env.local. Every document written
// carries `sample: true`; existing types (e.g. konto) are reused with their
// own attributes and never changed. Seeded – the same data on every run.
// If the customer attribute «Anrede» (list with «Herr» / «Frau») exists, it is
// set from the first name (FEMALE below) – no random numbers used for it.
import { MongoClient, ObjectId, type Db } from "mongodb";

const CUSTOMERS = 100;
const SAMPLE_COLLECTIONS = [
  "positionTransactions",
  "customerPositions",
  "customerComPrefs",
  "customerProducts",
  "customers",
  "productServiceTypePositionAttributes",
  "productServiceTypeTrxAttributes",
  "domainValues",
];

// --- seeded random ----------------------------------------------------------------
let seed = 20261120;
function rnd() {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
const chance = (p: number) => rnd() < p;
const round = (n: number, step: number) => Math.round(n / step) * step;
const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("");
const DAY = 24 * 60 * 60 * 1000;
const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const pastDay = (maxDays: number, minDays = 0) => dayStr(new Date(today.getTime() - int(minDays, maxDays) * DAY));
const futureDay = (minDays: number, maxDays: number) => dayStr(new Date(today.getTime() + int(minDays, maxDays) * DAY));

// --- people -------------------------------------------------------------------------
const FIRST = [
  "Anna", "Laura", "Sara", "Lea", "Julia", "Nina", "Sandra", "Monika", "Ursula", "Claudia", "Mia", "Elena", "Sophie", "Lina",
  "Barbara", "Petra", "Andrea", "Martina", "Chiara", "Noemi", "Luca", "Noah", "David", "Marco", "Thomas", "Daniel", "Peter",
  "Hans", "Markus", "Stefan", "Andreas", "Christian", "Martin", "Simon", "Lukas", "Fabian", "Reto", "Urs", "Beat", "Matteo",
  "Leon", "Elias", "Samuel", "Jonas", "Nico", "Patrick", "Roger", "Walter", "Ruth", "Heidi",
];
/** first names of FIRST that get «Frau» (the others «Herr») */
const FEMALE = new Set([
  "Anna", "Laura", "Sara", "Lea", "Julia", "Nina", "Sandra", "Monika", "Ursula", "Claudia", "Mia", "Elena", "Sophie", "Lina",
  "Barbara", "Petra", "Andrea", "Martina", "Chiara", "Noemi", "Ruth", "Heidi",
]);

/** The customer attribute «Anrede» when it is a list with «Herr» and «Frau», else null. */
async function salutationAttribute(db: Db) {
  const a = await db.collection("customerAttributes").findOne({ attribute: "Anrede" }, { collation: { locale: "de", strength: 2 } });
  const options = (a?.options as string[] | undefined) ?? [];
  return a && a.attributeType === "list" && options.includes("Herr") && options.includes("Frau") ? (a._id as ObjectId).toHexString() : null;
}

const LAST = [
  "Müller", "Meier", "Schmid", "Keller", "Weber", "Huber", "Schneider", "Meyer", "Steiner", "Fischer", "Gerber", "Brunner",
  "Baumann", "Frei", "Zimmermann", "Moser", "Widmer", "Wyss", "Graf", "Roth", "Suter", "Baumgartner", "Bachmann", "Studer",
  "Bühler", "Kälin", "Lehmann", "Marti", "Hofmann", "Kunz", "Bosshard", "Lüthi", "Wenger", "Egli", "Arnold", "Bucher",
  "Schwab", "Kaufmann", "Bianchi", "Rossi", "Ferrari", "Favre", "Rochat", "Bernasconi", "Hess", "Vogel", "Sutter", "Ammann",
  "Zürcher", "Imhof",
];

// --- types ------------------------------------------------------------------------------
type AttrType = "alpha" | "num" | "date" | "bool" | "list";
type AttrSpec = { attribute: string; attributeType: AttrType; options?: string[] };
type TypeSpec = { code: string; label: string; position: AttrSpec[]; trx: AttrSpec[] };

/** Created only when the code doesn't exist yet – existing types keep their own attributes. */
const SAMPLE_TYPES: TypeSpec[] = [
  {
    code: "sparkonto",
    label: "Sparkonto",
    position: [
      { attribute: "IBAN", attributeType: "alpha" },
      { attribute: "Zinssatz %", attributeType: "num" },
      { attribute: "Eröffnet am", attributeType: "date" },
    ],
    trx: [
      { attribute: "Datum", attributeType: "date" },
      { attribute: "Art", attributeType: "list", options: ["Einzahlung", "Auszahlung", "Zins"] },
      { attribute: "Betrag", attributeType: "num" },
    ],
  },
  {
    code: "kreditkarte",
    label: "Kreditkarte",
    position: [
      { attribute: "Kartennummer", attributeType: "alpha" },
      { attribute: "Kartentyp", attributeType: "list", options: ["Classic", "Gold", "Platinum"] },
      { attribute: "Limite", attributeType: "num" },
      { attribute: "Gültig bis", attributeType: "date" },
      { attribute: "Kontaktlos", attributeType: "bool" },
    ],
    trx: [
      { attribute: "Datum", attributeType: "date" },
      { attribute: "Händler", attributeType: "alpha" },
      { attribute: "Kategorie", attributeType: "list", options: ["Lebensmittel", "Restaurant", "Reisen", "Online", "Tankstelle", "Freizeit"] },
      { attribute: "Betrag", attributeType: "num" },
    ],
  },
  {
    code: "versicherung",
    label: "Versicherung",
    position: [
      { attribute: "Policennummer", attributeType: "alpha" },
      { attribute: "Deckung", attributeType: "list", options: ["Basis", "Komfort", "Premium"] },
      { attribute: "Jahresprämie", attributeType: "num" },
      { attribute: "Beginn", attributeType: "date" },
    ],
    trx: [
      { attribute: "Fällig am", attributeType: "date" },
      { attribute: "Prämie", attributeType: "num" },
      { attribute: "Status", attributeType: "list", options: ["Bezahlt", "Offen", "Gemahnt"] },
    ],
  },
  {
    code: "beratung",
    label: "Beratung",
    position: [
      { attribute: "Thema", attributeType: "list", options: ["Vorsorge", "Finanzierung", "Anlage", "Steuern", "Nachfolge"] },
      { attribute: "Berater", attributeType: "alpha" },
    ],
    trx: [
      { attribute: "Termin", attributeType: "date" },
      { attribute: "Dauer Minuten", attributeType: "num" },
      { attribute: "Erledigt", attributeType: "bool" },
      { attribute: "Notiz", attributeType: "alpha" },
    ],
  },
];

const COM_PREFS = [
  { code: "email", label: "E-Mail", hints: ["Newsletter erwünscht", "Nur Kontoinformationen", "Bitte an die Geschäftsadresse", "Keine Werbung"] },
  { code: "telefon", label: "Telefon", hints: ["Werktags 9–17 Uhr", "Nur abends nach 18 Uhr", "Bitte zuerst per SMS ankündigen", "Mobile bevorzugt"] },
  { code: "post", label: "Post", hints: ["Jahresauszug per Post", "Nur wichtige Dokumente", "An die Privatadresse"] },
  { code: "sms", label: "SMS", hints: ["Nur Sicherheitsmeldungen", "Terminerinnerungen", "Transaktionsbestätigungen"] },
];

/** Product names per type code (also for types defined by the user). */
const PRODUCT_NAMES: Record<string, string[]> = {
  konto: ["Privatkonto", "Privatkonto Plus", "Jugendkonto", "Lohnkonto"],
  sparkonto: ["Sparkonto", "Sparkonto Plus", "Vorsorgesparen 3a"],
  kreditkarte: ["Visa Classic", "Mastercard Gold", "Visa Platinum"],
  depot: ["Wertschriftendepot", "Fondsdepot", "Nachhaltigkeitsdepot"],
  hypothek: ["Festhypothek", "SARON-Hypothek", "Variable Hypothek"],
  versicherung: ["Hausratversicherung", "Lebensversicherung", "Privathaftpflicht"],
  beratung: ["Finanzberatung", "Vorsorgeberatung", "Anlageberatung"],
};

/**
 * Usage profiles: which types a customer uses (with how many positions) and
 * how often the profile occurs. Types that don't exist are skipped.
 */
const PROFILES: { name: string; weight: number; uses: () => [code: string, positions: number][] }[] = [
  { name: "Basis", weight: 28, uses: () => [["konto", 1]] },
  { name: "Sparer", weight: 20, uses: () => [["konto", 1], ["sparkonto", int(1, 2)]] },
  { name: "Karte", weight: 15, uses: () => [["konto", 1], ["kreditkarte", 1]] },
  {
    name: "Familie",
    weight: 15,
    uses: () => [["konto", int(1, 2)], ["sparkonto", 1], ["versicherung", int(1, 2)], ...(chance(0.5) ? ([["hypothek", 1]] as [string, number][]) : [])],
  },
  {
    name: "Anleger",
    weight: 13,
    uses: () => [["konto", 1], ["depot", 1], ["beratung", 1], ...(chance(0.6) ? ([["kreditkarte", 1]] as [string, number][]) : [])],
  },
  {
    name: "Vermögend",
    weight: 9,
    uses: () => [["konto", 2], ["sparkonto", 1], ["depot", int(1, 2)], ["hypothek", int(1, 2)], ["kreditkarte", 1], ["beratung", int(1, 2)], ["versicherung", 1]],
  },
];

/** Transactions per position, by type code (default for other types). */
const TRX_RANGE: Record<string, [number, number]> = {
  konto: [6, 25],
  sparkonto: [2, 8],
  kreditkarte: [5, 30],
  depot: [2, 12],
  versicherung: [1, 4],
  beratung: [1, 3],
};

const STOCKS = [
  ["Nestlé N", "CH0038863350"],
  ["Novartis N", "CH0012005267"],
  ["Roche GS", "CH0012032048"],
  ["UBS Group N", "CH0244767585"],
  ["Zurich Insurance N", "CH0011075394"],
  ["ABB N", "CH0012221716"],
  ["Lonza N", "CH0013841017"],
  ["Swiss Re N", "CH0126881561"],
  ["Sika N", "CH0418792922"],
  ["Logitech N", "CH0025751329"],
] as const;
const MERCHANTS = ["Migros", "Coop", "SBB", "Galaxus", "Zalando", "Denner", "Manor", "Swiss", "Tamoil", "Spar", "Interdiscount", "Restaurant Krone", "Hotel Bellevue", "Netflix", "Digitec"];
const ADVISORS = ["R. Meier", "S. Keller", "M. Bianchi", "C. Favre", "T. Huber"];
const NOTES = ["Unterlagen nachreichen", "Offerte versandt", "Folgetermin vereinbart", "Kunde entscheidet bis Monatsende", "Keine weiteren Schritte"];

// --- values from attribute name + type ---------------------------------------------
type Def = { id: ObjectId; attribute: string; attributeType: AttrType; options: string[] };
type Ctx = { code: string; level: "position" | "trx" };

const has = (name: string, ...words: string[]) => words.some((w) => name.toLowerCase().includes(w));

function amount(ctx: Ctx, name: string): number {
  const { code, level } = ctx;
  if (level === "position") {
    if (has(name, "saldo")) return round(rnd() ** 2 * 80_000, 0.05);
    if (has(name, "depotwert")) return round(10_000 + rnd() ** 2 * 900_000, 1);
    if (has(name, "laufzeit")) return int(2, 15);
    if (has(name, "zins")) return round(0.1 + rnd() * 2.4, 0.05);
    if (has(name, "limite")) return pick([2_000, 5_000, 10_000, 15_000, 20_000]);
    if (has(name, "prämie")) return round(150 + rnd() * 2_500, 5);
    if (has(name, "betrag") && code === "hypothek") return round(200_000 + rnd() * 1_000_000, 5_000);
    if (has(name, "betrag")) return round(1_000 + rnd() * 50_000, 50);
    return int(1, 1_000);
  }
  if (has(name, "dauer")) return pick([30, 45, 60, 90]);
  if (has(name, "prämie")) return round(40 + rnd() * 800, 5);
  if (code === "depot") return round(500 + rnd() * 30_000, 0.05);
  if (code === "kreditkarte") return round(5 + rnd() ** 2 * 600, 0.05);
  if (code === "sparkonto") return round(50 + rnd() * 3_000, 50);
  if (code === "konto") return round(10 + rnd() ** 2 * 4_000, 0.05);
  return round(10 + rnd() * 1_000, 0.05);
}

function text(ctx: Ctx, name: string, state: { stock?: (typeof STOCKS)[number] }): string {
  if (has(name, "iban")) return `CH${digits(2)} ${digits(4)} ${digits(4)} ${digits(4)} ${digits(4)} ${digits(1)}`;
  if (has(name, "kartennummer")) return `**** **** **** ${digits(4)}`;
  if (has(name, "isin")) return (state.stock ??= pick(STOCKS))[1];
  if (has(name, "titel")) return (state.stock ??= pick(STOCKS))[0];
  if (has(name, "händler")) return pick(MERCHANTS);
  if (has(name, "berater")) return pick(ADVISORS);
  if (has(name, "notiz", "text")) return pick(NOTES);
  if (has(name, "police")) return `P-${digits(3)}-${digits(5)}`;
  if (has(name, "nummer", "nr")) return ctx.code === "depot" ? `D-${digits(6)}` : digits(9);
  return pick(["A", "B", "C"]) + digits(4);
}

function dateValue(ctx: Ctx, name: string): string {
  if (has(name, "gültig bis", "läuft ab", "ablauf")) return futureDay(180, 15 * 365);
  if (ctx.level === "trx") return pastDay(365);
  return pastDay(15 * 365, 30);
}

/** Values for one position / transaction: every attribute filled (a few optional ones left empty). */
function valuesFor(defs: Def[], ctx: Ctx) {
  const state: { stock?: (typeof STOCKS)[number] } = {};
  const out: Record<string, string | number | boolean> = {};
  for (const d of defs) {
    if (defs.length > 2 && d.attributeType !== "num" && chance(0.04)) continue; // sometimes left empty
    const key = d.id.toHexString();
    if (d.attributeType === "num") out[key] = amount(ctx, d.attribute);
    else if (d.attributeType === "alpha") out[key] = text(ctx, d.attribute, state);
    else if (d.attributeType === "date") out[key] = dateValue(ctx, d.attribute);
    else if (d.attributeType === "bool") out[key] = chance(0.7);
    else if (d.options.length) out[key] = pick(d.options);
  }
  return out;
}

// --- remove / create -----------------------------------------------------------------------
async function removeSample(db: Db) {
  // sample types still used by real records stay (with their attributes)
  const sampleTypes = await db.collection("domainValues").find({ sample: true }).toArray();
  const keep: ObjectId[] = [];
  for (const t of sampleTypes) {
    const used =
      t.domain === "productServiceType"
        ? (await db.collection("customerProducts").countDocuments({ productServiceType: t.code, sample: { $ne: true } })) +
          (await db.collection("customerPositions").countDocuments({ productServiceType: t.code, sample: { $ne: true } }))
        : await db.collection("customerComPrefs").countDocuments({ comPrefType: t.code, sample: { $ne: true } });
    if (used) keep.push(t._id);
  }
  const counts: string[] = [];
  for (const name of SAMPLE_COLLECTIONS) {
    const filter =
      name === "domainValues"
        ? { sample: true, _id: { $nin: keep } }
        : name.startsWith("productServiceType")
          ? { sample: true, typeId: { $nin: keep } }
          : { sample: true };
    const res = await db.collection(name).deleteMany(filter);
    if (res.deletedCount) counts.push(`${name} ${res.deletedCount}`);
  }
  console.log(counts.length ? `Removed sample data: ${counts.join(", ")}` : "No sample data found.");
  if (keep.length) console.log(`Kept ${keep.length} sample type(s) that real records use.`);
}

async function ensureTypes(db: Db, now: Date) {
  const values = db.collection("domainValues");
  const lastSort = async (domain: string) => ((await values.find({ domain }).sort({ sort: -1 }).limit(1).next())?.sort as number) ?? 0;

  let sort = await lastSort("productServiceType");
  for (const spec of SAMPLE_TYPES) {
    if (await values.findOne({ domain: "productServiceType", code: spec.code })) continue;
    const typeId = new ObjectId();
    await values.insertOne({ _id: typeId, domain: "productServiceType", code: spec.code, label: spec.label, active: true, sort: (sort += 10), createdAt: now, updatedAt: now, sample: true });
    for (const [col, list] of [["productServiceTypePositionAttributes", spec.position], ["productServiceTypeTrxAttributes", spec.trx]] as const) {
      await db.collection(col).insertMany(
        list.map((a, i) => ({ _id: new ObjectId(), typeId, attribute: a.attribute, attributeType: a.attributeType, options: a.options ?? [], sort: (i + 1) * 10, createdAt: now, updatedAt: now, sample: true })),
      );
    }
  }
  sort = await lastSort("comPrefs");
  for (const p of COM_PREFS) {
    if (await values.findOne({ domain: "comPrefs", code: p.code })) continue;
    await values.insertOne({ _id: new ObjectId(), domain: "comPrefs", code: p.code, label: p.label, active: true, sort: (sort += 10), createdAt: now, updatedAt: now, sample: true });
  }

  // all active product types with their attributes (sample and user-defined)
  const types = new Map<string, { label: string; position: Def[]; trx: Def[] }>();
  for (const t of await values.find({ domain: "productServiceType", active: true }).toArray()) {
    const load = async (col: string) =>
      (await db.collection(col).find({ typeId: t._id }).sort({ sort: 1 }).toArray()).map((a) => ({
        id: a._id as ObjectId,
        attribute: a.attribute as string,
        attributeType: a.attributeType as AttrType,
        options: (a.options as string[]) ?? [],
      }));
    types.set(t.code as string, { label: t.label as string, position: await load("productServiceTypePositionAttributes"), trx: await load("productServiceTypeTrxAttributes") });
  }
  const comPrefCodes = (await values.find({ domain: "comPrefs", active: true }).toArray()).map((v) => v.code as string);
  return { types, comPrefCodes };
}

async function create(db: Db) {
  const now = new Date();
  const { types, comPrefCodes } = await ensureTypes(db, now);
  const usable = [...types].filter(([, t]) => t.position.length).map(([code]) => code);
  console.log(`Product types with position attributes: ${usable.join(", ")}`);
  const anrede = await salutationAttribute(db);
  console.log(anrede ? "Customer attribute «Anrede»: set from the first name" : "No customer attribute «Anrede» (Herr / Frau) – not set");

  const customers: Record<string, unknown>[] = [];
  const products: Record<string, unknown>[] = [];
  const comPrefs: Record<string, unknown>[] = [];
  const positions: Record<string, unknown>[] = [];
  const transactions: Record<string, unknown>[] = [];
  const profileCount: Record<string, number> = {};
  const totalWeight = PROFILES.reduce((s, p) => s + p.weight, 0);

  for (let i = 0; i < CUSTOMERS; i++) {
    const customerId = new ObjectId();
    const createdAt = new Date(now.getTime() - int(0, 3 * 365) * DAY);
    const birth = new Date(Date.UTC(int(1940, 2006), int(0, 11), int(1, 28)));
    const name = pick(FIRST);
    customers.push({
      _id: customerId,
      name,
      lastname: pick(LAST),
      dateOfBirth: birth,
      ...(anrede && { attributes: { [anrede]: FEMALE.has(name) ? "Frau" : "Herr" } }),
      createdAt,
      updatedAt: createdAt,
      sample: true,
    });

    let r = rnd() * totalWeight;
    const profile = PROFILES.find((p) => (r -= p.weight) < 0) ?? PROFILES[0];
    profileCount[profile.name] = (profileCount[profile.name] ?? 0) + 1;

    let posSort = 0;
    for (const [code, count] of profile.uses()) {
      const type = types.get(code);
      if (!type || !type.position.length) continue; // type missing or without position attributes
      const names = PRODUCT_NAMES[code] ?? [type.label];
      products.push({ _id: new ObjectId(), customerId, name: pick(names), productServiceType: code, createdAt, updatedAt: createdAt, sample: true });
      for (let p = 0; p < count; p++) {
        const positionId = new ObjectId();
        positions.push({
          _id: positionId,
          customerId,
          productServiceType: code,
          values: valuesFor(type.position, { code, level: "position" }),
          sort: (posSort += 10),
          createdAt,
          updatedAt: createdAt,
          sample: true,
        });
        if (!type.trx.length) continue;
        const [min, max] = TRX_RANGE[code] ?? [2, 8];
        const list = Array.from({ length: int(min, max) }, () => valuesFor(type.trx, { code, level: "trx" }));
        // in date order when the type has a date attribute
        const dateAttr = type.trx.find((d) => d.attributeType === "date")?.id.toHexString();
        if (dateAttr) list.sort((a, b) => String(a[dateAttr] ?? "").localeCompare(String(b[dateAttr] ?? "")));
        list.forEach((values, t) =>
          transactions.push({ _id: new ObjectId(), positionId, customerId, values, sort: (t + 1) * 10, createdAt, updatedAt: createdAt, sample: true }),
        );
      }
    }

    // 1–2 communication preferences
    const prefs = [...comPrefCodes].sort(() => rnd() - 0.5).slice(0, int(1, Math.min(2, comPrefCodes.length)));
    for (const code of prefs) {
      const hints = COM_PREFS.find((c) => c.code === code)?.hints ?? ["Keine besonderen Wünsche"];
      comPrefs.push({ _id: new ObjectId(), customerId, comPrefType: code, usageInstruction: pick(hints), createdAt, updatedAt: createdAt, sample: true });
    }
  }

  const insert = async (name: string, docs: Record<string, unknown>[]) => {
    if (docs.length) await db.collection(name).insertMany(docs);
  };
  await insert("customers", customers);
  await insert("customerProducts", products);
  await insert("customerComPrefs", comPrefs);
  await insert("customerPositions", positions);
  await insert("positionTransactions", transactions);

  console.log(
    `Created ${customers.length} customers, ${products.length} products, ${positions.length} positions, ` +
      `${transactions.length} transactions, ${comPrefs.length} communication preferences.`,
  );
  console.log(`Profiles: ${Object.entries(profileCount).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

// --- main -----------------------------------------------------------------------------------
const mode = process.argv[2];
const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? "nexus-maut");
  if (mode === "remove") {
    await removeSample(db);
  } else if (mode === "create") {
    const existing = await db.collection("customers").countDocuments({ sample: true });
    if (existing && !process.argv.includes("--replace")) {
      console.error(`There are already ${existing} sample customers. Use --replace to renew them, or sample:remove.`);
      process.exitCode = 1;
    } else {
      if (existing) await removeSample(db);
      await create(db);
    }
  } else {
    console.error("Usage: sample-data.mts create [--replace] | remove");
    process.exitCode = 1;
  }
} finally {
  await client.close();
}
