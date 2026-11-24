// Sample source data for Admin → Data Management (Initial Upload): 250 fictional customers with
// positions and transactions, in three source formats with the same content:
//   samples/upload/csv/{typen,kunden,positionen,transaktionen}.csv   (UTF-8 with BOM, «;»)
//   samples/upload/nexusMAUT-upload.xlsx                             (sheets Typen, Kunden, Positionen, Transaktionen)
//   samples/upload/nexusMAUT-upload.json
//     npm run samples:upload
// References by keys: positions → kundennummer, transactions → positionsnummer (+ kundennummer).
// Seeded – the same data on every run (dates relative to today). Touches no database.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const CUSTOMERS = 250;
const OUT = path.join(import.meta.dirname, "..", "samples", "upload");

// --- seeded random ----------------------------------------------------------------
let seed = 20261124;
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
const round = (n: number, step: number) => Number((Math.round(n / step) * step).toFixed(2));
const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("");
const DAY = 24 * 60 * 60 * 1000;
const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const pastDay = (maxDays: number, minDays = 0) => dayStr(new Date(today.getTime() - int(minDays, maxDays) * DAY));
const futureDay = (minDays: number, maxDays: number) => dayStr(new Date(today.getTime() + int(minDays, maxDays) * DAY));

// --- people -------------------------------------------------------------------------
const FEMALE = ["Anna", "Laura", "Sara", "Lea", "Julia", "Nina", "Sandra", "Monika", "Ursula", "Claudia", "Mia", "Elena", "Sophie", "Lina", "Barbara", "Petra", "Andrea", "Martina", "Chiara", "Noemi", "Ruth", "Heidi", "Seraina", "Jana", "Luisa"];
const MALE = ["Luca", "Noah", "David", "Marco", "Thomas", "Daniel", "Peter", "Hans", "Markus", "Stefan", "Andreas", "Christian", "Martin", "Simon", "Lukas", "Fabian", "Reto", "Urs", "Beat", "Matteo", "Leon", "Elias", "Samuel", "Jonas", "Nico", "Patrick", "Roger", "Walter"];
const LAST = [
  "Müller", "Meier", "Schmid", "Keller", "Weber", "Huber", "Schneider", "Meyer", "Steiner", "Fischer", "Gerber", "Brunner", "Baumann", "Frei",
  "Zimmermann", "Moser", "Widmer", "Wyss", "Graf", "Roth", "Suter", "Baumgartner", "Bachmann", "Studer", "Bühler", "Kälin", "Lehmann", "Marti",
  "Hofmann", "Kunz", "Bosshard", "Lüthi", "Wenger", "Egli", "Arnold", "Bucher", "Schwab", "Kaufmann", "Bianchi", "Rossi", "Ferrari", "Favre",
  "Rochat", "Bernasconi", "Hess", "Vogel", "Sutter", "Ammann", "Zürcher", "Imhof", "Caduff", "Casutt", "Dubois", "Gasser", "Häfliger", "Rüegg",
];

// --- types and their attributes (as in nexusMAUT: alpha | num | date | bool | list) --
type AttrType = "alpha" | "num" | "date" | "bool" | "list";
type Attr = { attribut: string; attributtyp: AttrType; optionen?: string[] };
type TypeSpec = { code: string; label: string; produkte: string[]; position: Attr[]; trx: Attr[]; trxRange: [number, number] };
const a = (attribut: string, attributtyp: AttrType, optionen?: string[]): Attr => ({ attribut, attributtyp, ...(optionen && { optionen }) });

const TYPES: TypeSpec[] = [
  {
    code: "konto", label: "Privatkonto", produkte: ["Privatkonto", "Privatkonto Plus", "Jugendkonto", "Lohnkonto"],
    position: [a("IBAN", "alpha"), a("Saldo", "num"), a("Eröffnet am", "date")],
    trx: [a("Datum", "date"), a("Buchungstext", "alpha"), a("Betrag", "num")], trxRange: [6, 20],
  },
  {
    code: "sparkonto", label: "Sparkonto", produkte: ["Sparkonto", "Sparkonto Plus", "Vorsorgesparen 3a"],
    position: [a("IBAN", "alpha"), a("Zinssatz %", "num"), a("Eröffnet am", "date")],
    trx: [a("Datum", "date"), a("Art", "list", ["Einzahlung", "Auszahlung", "Zins"]), a("Betrag", "num")], trxRange: [2, 8],
  },
  {
    code: "kreditkarte", label: "Kreditkarte", produkte: ["Visa Classic", "Mastercard Gold", "Visa Platinum"],
    position: [a("Kartennummer", "alpha"), a("Kartentyp", "list", ["Classic", "Gold", "Platinum"]), a("Limite", "num"), a("Gültig bis", "date"), a("Kontaktlos", "bool")],
    trx: [a("Datum", "date"), a("Händler", "alpha"), a("Kategorie", "list", ["Lebensmittel", "Restaurant", "Reisen", "Online", "Tankstelle", "Freizeit"]), a("Betrag", "num")], trxRange: [5, 25],
  },
  {
    code: "depot", label: "Wertschriftendepot", produkte: ["Wertschriftendepot", "Fondsdepot", "Nachhaltigkeitsdepot"],
    position: [a("Depotnummer", "alpha"), a("Depotwert", "num"), a("Strategie", "list", ["Einkommen", "Ausgewogen", "Wachstum"])],
    trx: [a("Datum", "date"), a("Titel", "alpha"), a("Betrag", "num")], trxRange: [2, 10],
  },
  {
    code: "hypothek", label: "Hypothek", produkte: ["Festhypothek", "SARON-Hypothek", "Variable Hypothek"],
    position: [a("Betrag", "num"), a("Zinssatz %", "num"), a("Laufzeit bis", "date")],
    trx: [a("Datum", "date"), a("Zins", "num")], trxRange: [2, 4],
  },
  {
    code: "versicherung", label: "Versicherung", produkte: ["Hausratversicherung", "Lebensversicherung", "Privathaftpflicht"],
    position: [a("Policennummer", "alpha"), a("Deckung", "list", ["Basis", "Komfort", "Premium"]), a("Jahresprämie", "num"), a("Beginn", "date")],
    trx: [a("Fällig am", "date"), a("Prämie", "num"), a("Status", "list", ["Bezahlt", "Offen", "Gemahnt"])], trxRange: [1, 4],
  },
  {
    code: "beratung", label: "Beratung", produkte: ["Finanzberatung", "Vorsorgeberatung", "Anlageberatung"],
    position: [a("Thema", "list", ["Vorsorge", "Finanzierung", "Anlage", "Steuern", "Nachfolge"]), a("Berater", "alpha")],
    trx: [a("Termin", "date"), a("Dauer Minuten", "num"), a("Erledigt", "bool"), a("Notiz", "alpha")], trxRange: [1, 3],
  },
];
const TYPE = Object.fromEntries(TYPES.map((t) => [t.code, t]));

const PROFILES: { weight: number; uses: () => [string, number][] }[] = [
  { weight: 28, uses: () => [["konto", 1]] },
  { weight: 20, uses: () => [["konto", 1], ["sparkonto", int(1, 2)]] },
  { weight: 15, uses: () => [["konto", 1], ["kreditkarte", 1]] },
  { weight: 15, uses: () => [["konto", int(1, 2)], ["sparkonto", 1], ["versicherung", int(1, 2)], ...(chance(0.5) ? ([["hypothek", 1]] as [string, number][]) : [])] },
  { weight: 13, uses: () => [["konto", 1], ["depot", 1], ["beratung", 1], ...(chance(0.6) ? ([["kreditkarte", 1]] as [string, number][]) : [])] },
  { weight: 9, uses: () => [["konto", 2], ["sparkonto", 1], ["depot", int(1, 2)], ["hypothek", 1], ["kreditkarte", 1], ["beratung", 1], ["versicherung", 1]] },
];
const profile = () => {
  let r = rnd() * PROFILES.reduce((s, p) => s + p.weight, 0);
  for (const p of PROFILES) if ((r -= p.weight) < 0) return p;
  return PROFILES[0];
};

const STOCKS = ["Nestlé N", "Novartis N", "Roche GS", "UBS Group N", "Zurich Insurance N", "ABB N", "Lonza N", "Swiss Re N", "Sika N", "Logitech N"];
const MERCHANTS = ["Migros", "Coop", "SBB", "Galaxus", "Zalando", "Denner", "Manor", "Swiss", "Spar", "Interdiscount", "Restaurant Krone", "Hotel Bellevue", "Digitec"];
const BOOKINGS = ["Lohn", "Miete", "Krankenkasse", "Steuern", "Strom", "Telefon", "Bargeldbezug", "Twint", "Dauerauftrag Sparen"];
const ADVISORS = ["R. Meier", "S. Keller", "M. Bianchi", "C. Favre", "T. Huber"];
const NOTES = ["Unterlagen nachreichen", "Offerte versandt", "Folgetermin vereinbart", "Kunde entscheidet bis Monatsende", "Keine weiteren Schritte"];

type Value = string | number | boolean;
function positionValues(code: string): Record<string, Value> {
  const v: Record<string, Value> = {};
  for (const { attribut: n, attributtyp: t, optionen } of TYPE[code].position) {
    if (t === "list") v[n] = pick(optionen!);
    else if (t === "bool") v[n] = chance(0.8);
    else if (t === "date") v[n] = n === "Gültig bis" || n === "Laufzeit bis" ? futureDay(180, 10 * 365) : pastDay(15 * 365, 30);
    else if (n === "IBAN") v[n] = `CH${digits(2)} ${digits(4)} ${digits(4)} ${digits(4)} ${digits(4)} ${digits(1)}`;
    else if (n === "Kartennummer") v[n] = `**** **** **** ${digits(4)}`;
    else if (n === "Depotnummer") v[n] = `D-${digits(6)}`;
    else if (n === "Policennummer") v[n] = `P-${digits(3)}-${digits(5)}`;
    else if (n === "Berater") v[n] = pick(ADVISORS);
    else if (n === "Saldo") v[n] = round(rnd() ** 2 * 80_000, 0.05);
    else if (n === "Depotwert") v[n] = round(10_000 + rnd() ** 2 * 900_000, 1);
    else if (n === "Zinssatz %") v[n] = round(0.1 + rnd() * 2.4, 0.05);
    else if (n === "Limite") v[n] = pick([2_000, 5_000, 10_000, 15_000, 20_000]);
    else if (n === "Jahresprämie") v[n] = round(150 + rnd() * 2_500, 5);
    else if (n === "Betrag") v[n] = round(200_000 + rnd() * 1_000_000, 5_000);
  }
  return v;
}
function trxValues(code: string): Record<string, Value> {
  const v: Record<string, Value> = {};
  for (const { attribut: n, attributtyp: t, optionen } of TYPE[code].trx) {
    if (t === "list") v[n] = pick(optionen!);
    else if (t === "bool") v[n] = chance(0.7);
    else if (t === "date") v[n] = pastDay(365);
    else if (n === "Buchungstext") v[n] = pick(BOOKINGS);
    else if (n === "Händler") v[n] = pick(MERCHANTS);
    else if (n === "Titel") v[n] = pick(STOCKS);
    else if (n === "Notiz") v[n] = pick(NOTES);
    else if (n === "Dauer Minuten") v[n] = pick([30, 45, 60, 90]);
    else if (n === "Prämie") v[n] = round(40 + rnd() * 800, 5);
    else if (n === "Zins") v[n] = round(300 + rnd() * 2_500, 0.05);
    else if (n === "Betrag")
      v[n] = code === "depot" ? round(500 + rnd() * 30_000, 0.05) : code === "kreditkarte" ? round(5 + rnd() ** 2 * 600, 0.05) : code === "sparkonto" ? round(50 + rnd() * 3_000, 50) : round(10 + rnd() ** 2 * 4_000, 0.05);
  }
  return v;
}

// --- generate -------------------------------------------------------------------------
type Customer = { kundennummer: string; vorname: string; nachname: string; geburtsdatum: string; anrede: "Frau" | "Herr" };
type Position = { positionsnummer: string; kundennummer: string; typ: string; produkt: string; werte: Record<string, Value> };
type Transaction = { transaktionsnummer: string; positionsnummer: string; kundennummer: string; typ: string; werte: Record<string, Value> };

const kunden: Customer[] = [];
const positionen: Position[] = [];
const transaktionen: Transaction[] = [];
for (let i = 1; i <= CUSTOMERS; i++) {
  const female = chance(0.5);
  const kundennummer = `K${String(100000 + i)}`;
  kunden.push({
    kundennummer,
    vorname: pick(female ? FEMALE : MALE),
    nachname: pick(LAST),
    geburtsdatum: dayStr(new Date(Date.UTC(int(1940, 2006), int(0, 11), int(1, 28)))),
    anrede: female ? "Frau" : "Herr",
  });
  for (const [code, count] of profile().uses()) {
    for (let k = 0; k < count; k++) {
      const positionsnummer = `P${String(positionen.length + 1).padStart(6, "0")}`;
      positionen.push({ positionsnummer, kundennummer, typ: code, produkt: pick(TYPE[code].produkte), werte: positionValues(code) });
      const [min, max] = TYPE[code].trxRange;
      for (let n = int(min, max); n > 0; n--) {
        transaktionen.push({ transaktionsnummer: `T${String(transaktionen.length + 1).padStart(7, "0")}`, positionsnummer, kundennummer, typ: code, werte: trxValues(code) });
      }
    }
  }
}
// transactions in date order per position (first date attribute)
const dateKey = (t: Transaction) => String(Object.values(t.werte).find((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ?? "");
transaktionen.sort((x, y) => x.positionsnummer.localeCompare(y.positionsnummer) || dateKey(x).localeCompare(dateKey(y)));
transaktionen.forEach((t, i) => (t.transaktionsnummer = `T${String(i + 1).padStart(7, "0")}`));

// --- tables (CSV / Excel): fixed columns + one column per attribute name (union over the types) --
const union = (level: "position" | "trx") => [...new Set(TYPES.flatMap((t) => t[level].map((x) => x.attribut)))];
const typenRows = TYPES.flatMap((t) =>
  (["position", "trx"] as const).flatMap((level) =>
    t[level].map((x) => ({ typ: t.code, bezeichnung: t.label, ebene: level === "position" ? "Position" : "Transaktion", attribut: x.attribut, attributtyp: x.attributtyp, optionen: (x.optionen ?? []).join("|") })),
  ),
);
const posCols = union("position");
const trxCols = union("trx");
const tables: { name: string; columns: string[]; rows: Record<string, Value>[] }[] = [
  { name: "Typen", columns: ["typ", "bezeichnung", "ebene", "attribut", "attributtyp", "optionen"], rows: typenRows },
  { name: "Kunden", columns: ["kundennummer", "vorname", "nachname", "geburtsdatum", "anrede"], rows: kunden },
  { name: "Positionen", columns: ["positionsnummer", "kundennummer", "typ", "produkt", ...posCols], rows: positionen.map(({ werte, ...p }) => ({ ...p, ...werte })) },
  { name: "Transaktionen", columns: ["transaktionsnummer", "positionsnummer", "kundennummer", "typ", ...trxCols], rows: transaktionen.map(({ werte, ...t }) => ({ ...t, ...werte })) },
];

// --- write -----------------------------------------------------------------------------
mkdirSync(path.join(OUT, "csv"), { recursive: true });

// CSV: «;» (Excel in CH/DE), UTF-8 with BOM, decimal point «.», dates YYYY-MM-DD, booleans ja/nein
const cell = (v: Value | undefined) => {
  if (v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "ja" : "nein") : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
for (const t of tables) {
  const lines = [t.columns.join(";"), ...t.rows.map((r) => t.columns.map((c) => cell(r[c])).join(";"))];
  writeFileSync(path.join(OUT, "csv", `${t.name.toLowerCase()}.csv`), "﻿" + lines.join("\r\n") + "\r\n");
}

// Excel: one sheet per table, header row bold and frozen, dates as real dates
const wb = new ExcelJS.Workbook();
wb.creator = "nexusMAUT";
wb.created = new Date(0);
for (const t of tables) {
  const ws = wb.addWorksheet(t.name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = t.columns.map((c) => ({ header: c, key: c, width: Math.max(12, Math.min(28, c.length + 4)) }));
  for (const r of t.rows) {
    const row: Record<string, unknown> = {};
    for (const c of t.columns) {
      const v = r[c];
      row[c] = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T00:00:00Z") : v;
    }
    ws.addRow(row);
  }
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.columns.length } };
  ws.eachRow((row, n) => {
    if (n > 1) row.eachCell((c) => c.value instanceof Date && (c.numFmt = "yyyy-mm-dd"));
  });
}
await wb.xlsx.writeFile(path.join(OUT, "nexusMAUT-upload.xlsx"));

// JSON: the same data, positions / transactions with their values in «werte»
const json = {
  format: "nexusMAUT-upload",
  version: 1,
  typen: TYPES.map((t) => ({ code: t.code, bezeichnung: t.label, positionsattribute: t.position, transaktionsattribute: t.trx })),
  kunden,
  positionen,
  transaktionen,
};
writeFileSync(path.join(OUT, "nexusMAUT-upload.json"), JSON.stringify(json, null, 2) + "\n");

console.log(`${kunden.length} Kunden, ${positionen.length} Positionen, ${transaktionen.length} Transaktionen, ${TYPES.length} Typen → ${path.relative(process.cwd(), OUT)}`);
