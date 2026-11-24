// Reading upload sources (Admin → Data Management) into one structure – pure, tested.
// Tables (CSV files / Excel sheets) «Typen», «Kunden», «Positionen», «Transaktionen» or the same
// content as JSON (format of samples/upload, see its README). References by keys:
// position → kundennummer, transaction → positionsnummer.

import { ATTRIBUTE_TYPE_NAMES, type AttributeType } from "./typeAttributes";

export type UploadAttr = { name: string; type: AttributeType; options: string[] };
export type UploadType = { code: string; label: string; position: UploadAttr[]; trx: UploadAttr[] };
/** `row` = line in the source (header = 1) or index in the JSON array (1-based) */
export type UploadCustomer = { row: number; key: string; name: unknown; lastname: unknown; dateOfBirth: unknown; attributes: Record<string, unknown> };
export type UploadPosition = { row: number; key: string; customerKey: string; type: string; product: string; values: Record<string, unknown> };
export type UploadTransaction = { row: number; key: string; positionKey: string; values: Record<string, unknown> };
export type UploadData = {
  /** null = no type definitions in the source (the types must exist in nexusMAUT) */
  types: UploadType[] | null;
  customers: UploadCustomer[];
  positions: UploadPosition[];
  transactions: UploadTransaction[];
  /** structural problems (missing tables / columns, unknown attribute types) */
  problems: string[];
};
export type Table = { name: string; rows: Record<string, unknown>[] };

// ---- CSV ------------------------------------------------------------------------

/** RFC 4180 with «;», «,» or tab (detected from the header line); BOM and CRLF tolerated. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = [";", "\t", ","].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A grid (first row = header) as rows keyed by header; empty rows dropped. */
export function tableFromGrid(name: string, grid: unknown[][]): Table {
  const [header = [], ...body] = grid;
  const cols = header.map((h) => String(h ?? "").trim());
  const rows = body
    .filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""))
    .map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]] as const).filter(([c]) => c !== "")));
  return { name, rows };
}

// ---- helpers ------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();
const text = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
/** the value of `obj` under any of `names` (case-insensitive) */
function field(obj: Record<string, unknown>, ...names: string[]): unknown {
  for (const k of Object.keys(obj)) if (names.includes(norm(k))) return obj[k];
  return undefined;
}
const TABLE_NAMES: Record<string, string[]> = {
  types: ["typen", "types"],
  customers: ["kunden", "customers"],
  positions: ["positionen", "positions"],
  transactions: ["transaktionen", "transactions"],
};
const tableOf = (tables: Table[], key: keyof typeof TABLE_NAMES) => tables.find((t) => TABLE_NAMES[key].includes(norm(t.name)));

const CUSTOMER_KEYS = ["kundennummer", "vorname", "nachname", "geburtsdatum"];
const POSITION_KEYS = ["positionsnummer", "kundennummer", "typ", "produkt"];
const TRX_KEYS = ["transaktionsnummer", "positionsnummer", "kundennummer", "typ"];
/** the columns that aren't fixed fields: attribute name → value */
const rest = (row: Record<string, unknown>, fixed: string[]) => Object.fromEntries(Object.entries(row).filter(([k]) => !fixed.includes(norm(k))));

function attr(problems: string[], where: string, name: unknown, type: unknown, options: unknown): UploadAttr | null {
  const n = text(name);
  const t = norm(text(type)) as AttributeType;
  if (!n) return null;
  if (!ATTRIBUTE_TYPE_NAMES.includes(t)) {
    problems.push(`${where}: Attribut «${n}» hat den unbekannten Typ «${text(type)}» (erlaubt: ${ATTRIBUTE_TYPE_NAMES.join(", ")})`);
    return null;
  }
  const opts = Array.isArray(options) ? options.map(text) : text(options).split("|");
  return { name: n, type: t, options: t === "list" ? opts.map((o) => o.trim()).filter(Boolean) : [] };
}

// ---- tables (CSV / Excel) ------------------------------------------------------------

export function fromTables(tables: Table[]): UploadData {
  const problems: string[] = [];
  const customersT = tableOf(tables, "customers");
  if (!customersT) problems.push("Tabelle «Kunden» fehlt");

  let types: UploadType[] | null = null;
  const typesT = tableOf(tables, "types");
  if (typesT) {
    const byCode = new Map<string, UploadType>();
    typesT.rows.forEach((r, i) => {
      const code = norm(text(field(r, "typ", "code")));
      if (!code) return;
      const t = byCode.get(code) ?? { code, label: text(field(r, "bezeichnung", "label")) || code, position: [], trx: [] };
      byCode.set(code, t);
      const level = norm(text(field(r, "ebene", "level")));
      const a = attr(problems, `Typen Zeile ${i + 2}`, field(r, "attribut", "attribute"), field(r, "attributtyp", "attributetype"), field(r, "optionen", "options"));
      if (!a) return;
      if (level.startsWith("pos")) t.position.push(a);
      else if (level.startsWith("tra") || level === "trx") t.trx.push(a);
      else problems.push(`Typen Zeile ${i + 2}: Ebene «${text(field(r, "ebene", "level"))}» – erwartet Position oder Transaktion`);
    });
    types = [...byCode.values()];
  }

  const customers = (customersT?.rows ?? []).map((r, i) => ({
    row: i + 2,
    key: text(field(r, "kundennummer")),
    name: field(r, "vorname"),
    lastname: field(r, "nachname"),
    dateOfBirth: field(r, "geburtsdatum"),
    attributes: rest(r, CUSTOMER_KEYS),
  }));
  const positions = (tableOf(tables, "positions")?.rows ?? []).map((r, i) => ({
    row: i + 2,
    key: text(field(r, "positionsnummer")),
    customerKey: text(field(r, "kundennummer")),
    type: norm(text(field(r, "typ"))),
    product: text(field(r, "produkt")),
    values: rest(r, POSITION_KEYS),
  }));
  const transactions = (tableOf(tables, "transactions")?.rows ?? []).map((r, i) => ({
    row: i + 2,
    key: text(field(r, "transaktionsnummer")),
    positionKey: text(field(r, "positionsnummer")),
    values: rest(r, TRX_KEYS),
  }));
  return { types, customers, positions, transactions, problems };
}

// ---- JSON ---------------------------------------------------------------------------------

const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function fromJson(data: unknown): UploadData {
  const problems: string[] = [];
  const root = obj(data);
  if (!Array.isArray(root.kunden)) problems.push("JSON: Liste «kunden» fehlt");
  let types: UploadType[] | null = null;
  if (Array.isArray(root.typen)) {
    types = list(root.typen).map((t, i) => {
      const code = norm(text(t.code ?? t.typ));
      const attrs = (key: string) =>
        list(t[key])
          .map((a, j) => attr(problems, `typen[${i}].${key}[${j}]`, a.attribut ?? a.attribute, a.attributtyp ?? a.attributeType, a.optionen ?? a.options))
          .filter((a): a is UploadAttr => a !== null);
      return { code, label: text(t.bezeichnung ?? t.label) || code, position: attrs("positionsattribute"), trx: attrs("transaktionsattribute") };
    });
  }
  const customers = list(root.kunden).map((c, i) => ({
    row: i + 1,
    key: text(c.kundennummer),
    name: c.vorname,
    lastname: c.nachname,
    dateOfBirth: c.geburtsdatum,
    attributes: { ...rest(c, [...CUSTOMER_KEYS, "attribute"]), ...obj(c.attribute) },
  }));
  const positions = list(root.positionen).map((p, i) => ({
    row: i + 1,
    key: text(p.positionsnummer),
    customerKey: text(p.kundennummer),
    type: norm(text(p.typ)),
    product: text(p.produkt),
    values: obj(p.werte),
  }));
  const transactions = list(root.transaktionen).map((t, i) => ({ row: i + 1, key: text(t.transaktionsnummer), positionKey: text(t.positionsnummer), values: obj(t.werte) }));
  return { types, customers, positions, transactions, problems };
}

// ---- values -----------------------------------------------------------------------------

const TRUE = ["ja", "true", "wahr", "1", "x", "yes", "y"];
const FALSE = ["nein", "false", "falsch", "0", "no", "n"];

/**
 * A raw cell as the app's forms send it, for an attribute of `type`: dates «24.11.2026» or Excel
 * dates → «2026-11-24», «ja» / «nein» → boolean; everything else unchanged (checked by parseValue).
 */
export function normalizeRaw(raw: unknown, type: AttributeType): unknown {
  if (raw === null || raw === undefined) return raw;
  if (raw instanceof Date) return type === "date" ? raw.toISOString().slice(0, 10) : raw.toISOString();
  if (type === "bool" && typeof raw === "string") {
    const v = norm(raw);
    if (TRUE.includes(v)) return true;
    if (FALSE.includes(v)) return false;
    return raw;
  }
  if (type === "bool" && typeof raw === "number" && (raw === 0 || raw === 1)) return raw === 1;
  if (type === "date" && typeof raw === "string") {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw.trim());
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return raw.trim();
  }
  if ((type === "alpha" || type === "list") && typeof raw === "number") return String(raw);
  return raw;
}

/** The type of a new customer attribute, guessed from its values (list for few distinct texts). */
export function guessAttribute(values: unknown[]): { type: AttributeType; options: string[] } {
  const filled = values.filter((v) => v !== null && v !== undefined && text(v) !== "");
  const is = (t: AttributeType, ok: (v: unknown) => boolean) => filled.length > 0 && filled.every((v) => ok(normalizeRaw(v, t)));
  if (is("bool", (v) => typeof v === "boolean")) return { type: "bool", options: [] };
  if (is("date", (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) return { type: "date", options: [] };
  if (is("num", (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.replace(/['’ ]/g, "").replace(",", ".")))))) return { type: "num", options: [] };
  const distinct = [...new Set(filled.map(text))];
  return distinct.length > 0 && distinct.length <= 20 ? { type: "list", options: distinct.sort((a, b) => a.localeCompare(b, "de")) } : { type: "alpha", options: [] };
}
