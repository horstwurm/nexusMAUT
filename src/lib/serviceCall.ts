// Calling a service: the PUT attributes become the request (JSON body, or
// query parameters for GET), the JSON response is mapped onto the GET
// attributes by name (case-insensitive) and checked against their types.
// A GET attribute can also be a list (table): an array of rows with own
// columns, optionally found at a dotted path in the response.
// Pure – shared by the server (the call), the pages and tests.

import { parseValue, type AttributeDef, type PositionValue } from "./positions";
import { attributeDefinitionError, normalizeOptions, type AttributeType } from "./typeAttributes";

export const CALL_METHODS = ["POST", "PUT", "GET"] as const;
export type CallMethod = (typeof CALL_METHODS)[number];

// --- list attributes ------------------------------------------------------------------

/** A column of a list attribute – simple types only (one level of nesting). */
export type ColumnDef = { attribute: string; attributeType: AttributeType; options: string[] };
/** A list (table) GET attribute: its columns and where the array is (dotted path, "" = by the attribute's name). */
export type ListSpec = { columns: ColumnDef[]; path: string };
/** A GET attribute: a single value, or a list when `list` is set. */
export type ServiceAttrDef = AttributeDef & { list?: ListSpec | null };

export const MAX_COLUMNS = 30;
export const MAX_ROWS = 1000;
const PATH_RE = /^[^.\s]+(\.[^.\s]+)*$/;

/** Columns trimmed, options normalised (lists only). */
export function normalizeListSpec(spec: ListSpec): ListSpec {
  return {
    path: spec.path.trim(),
    columns: spec.columns.map((c) => ({
      attribute: c.attribute.trim(),
      attributeType: c.attributeType,
      options: c.attributeType === "list" ? normalizeOptions(c.options) : [],
    })),
  };
}

/** Problem with a list definition, or null. */
export function listSpecProblem(spec: ListSpec): string | null {
  if (spec.path && !PATH_RE.test(spec.path)) return "Pfad: Namen mit Punkt getrennt, z.B. portfolio.items";
  if (!spec.columns.length) return "Liste: mindestens eine Spalte";
  if (spec.columns.length > MAX_COLUMNS) return `Liste: höchstens ${MAX_COLUMNS} Spalten`;
  const seen = new Set<string>();
  for (const c of spec.columns) {
    if (!c.attribute) return "Spalte: Name fehlt";
    if (c.attribute.length > 100) return `Spalte «${c.attribute.slice(0, 20)}…»: Name zu lang`;
    if (seen.has(c.attribute.toLowerCase())) return `Spalte «${c.attribute}» gibt es zweimal`;
    seen.add(c.attribute.toLowerCase());
    const problem = attributeDefinitionError(c.attributeType, c.options);
    if (problem) return `Spalte «${c.attribute}»: ${problem}`;
  }
  return null;
}

// --- request ----------------------------------------------------------------------------

/** What is sent: URL (with query for GET) and JSON body (not for GET). */
export function buildRequest(url: string, method: CallMethod, putDefs: AttributeDef[], values: Record<string, PositionValue>) {
  // keys = attribute names, only filled values
  const payload: Record<string, PositionValue> = {};
  for (const d of putDefs) if (values[d.id] !== undefined) payload[d.attribute] = values[d.id];
  if (method === "GET") {
    const u = new URL(url);
    for (const [k, v] of Object.entries(payload)) u.searchParams.set(k, String(v));
    return { method, url: u.toString(), body: null as string | null, payload };
  }
  return { method, url, body: JSON.stringify(payload), payload };
}

// --- response -----------------------------------------------------------------------------

export type MappedRow = { values: Record<string, PositionValue | null>; errors: string[] };

export type MappedValue = {
  attribute: string;
  attributeType: AttributeDef["attributeType"];
  /** the checked value; null when missing or wrong (and for lists) */
  value: PositionValue | null;
  /** the value as it came (for display), undefined when missing */
  raw?: unknown;
  status: "ok" | "missing" | "invalid";
  error?: string;
  /** list attributes: columns and checked rows */
  list?: { columns: ColumnDef[]; rows: MappedRow[]; truncated: boolean };
};

type Obj = Record<string, unknown>;
const asObject = (x: unknown): Obj | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : null);
/** A key of an object, case-insensitive. */
const getKey = (o: Obj, name: string) => {
  const k = Object.keys(o).find((key) => key.toLowerCase() === name.toLowerCase());
  return k === undefined ? undefined : o[k];
};
/** A dotted path, each step case-insensitive. */
function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split(".")) {
    const o = asObject(cur);
    if (!o) return undefined;
    cur = getKey(o, part);
  }
  return cur;
}

/** One value checked against a type (numbers from JSON stay typed; strings are parsed like form input). */
function checkValue(def: AttributeDef, raw: unknown) {
  return parseValue(def, typeof raw === "number" && def.attributeType !== "num" ? String(raw) : raw);
}

function mapList(d: ServiceAttrDef & { list: ListSpec }, raw: unknown): MappedValue {
  const base = { attribute: d.attribute, attributeType: d.attributeType, value: null, raw };
  if (raw === undefined || raw === null) return { ...base, raw: undefined, status: "missing", list: { columns: d.list.columns, rows: [], truncated: false } };
  if (!Array.isArray(raw)) return { ...base, status: "invalid", error: "keine Liste (JSON-Array erwartet)", list: { columns: d.list.columns, rows: [], truncated: false } };
  const rows: MappedRow[] = raw.slice(0, MAX_ROWS).map((item, i) => {
    const o = asObject(item);
    if (!o) return { values: {}, errors: [`Zeile ${i + 1}: kein Objekt`] };
    const values: Record<string, PositionValue | null> = {};
    const errors: string[] = [];
    for (const c of d.list.columns) {
      const r = checkValue({ id: c.attribute, ...c }, getKey(o, c.attribute));
      if ("error" in r) {
        values[c.attribute] = null;
        errors.push(`Zeile ${i + 1}: ${r.error}`);
      } else values[c.attribute] = r.value;
    }
    return { values, errors };
  });
  const errors = rows.flatMap((r) => r.errors);
  return {
    ...base,
    raw: undefined, // shown as the table
    status: errors.length ? "invalid" : "ok",
    ...(errors.length && { error: errors.length === 1 ? errors[0] : `${errors[0]} (+${errors.length - 1} weitere)` }),
    list: { columns: d.list.columns, rows, truncated: raw.length > MAX_ROWS },
  };
}

/**
 * Maps a JSON response onto the GET attributes. The object is the response
 * itself, or – common wrappers – its `data` / `result` object. A list with
 * a path is looked up from the response root.
 */
export function mapResponse(getDefs: ServiceAttrDef[], json: unknown): { values: MappedValue[]; error?: string } {
  let obj = asObject(json);
  if (!obj) return { values: getDefs.map((d) => missing(d)), error: "Antwort ist kein JSON-Objekt" };
  // no GET attribute on the top level, but a data / result wrapper → use that
  const byName = getDefs.filter((d) => !d.list?.path);
  if (byName.length && !byName.some((d) => getKey(obj!, d.attribute) !== undefined)) {
    const inner = asObject(obj.data) ?? asObject(obj.result);
    if (inner) obj = inner;
  }
  return {
    values: getDefs.map((d) => {
      if (d.list) return mapList(d as ServiceAttrDef & { list: ListSpec }, d.list.path ? getPath(json, d.list.path) : getKey(obj!, d.attribute));
      const raw = getKey(obj!, d.attribute);
      if (raw === undefined) return missing(d);
      const r = checkValue(d, raw);
      if ("error" in r) return { attribute: d.attribute, attributeType: d.attributeType, value: null, raw, status: "invalid", error: r.error };
      return r.value === null
        ? { ...missing(d), raw }
        : { attribute: d.attribute, attributeType: d.attributeType, value: r.value, raw, status: "ok" };
    }),
  };
}

const missing = (d: ServiceAttrDef): MappedValue => ({
  attribute: d.attribute,
  attributeType: d.attributeType,
  value: null,
  status: "missing",
  ...(d.list && { list: { columns: d.list.columns, rows: [], truncated: false } }),
});

// --- sample data when the service isn't available ------------------------------------

/** A small stable number from a text (same attribute → same sample value). */
function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** A sample value by type; `row` varies it for list rows. */
function sampleValue(name: string, type: AttributeType, options: string[], today: string, row = 0): PositionValue {
  if (type === "alpha") return row ? `Beispiel ${name} ${row + 1}` : `Beispiel ${name}`;
  if (type === "num") return ((hash(name) + row * 37) % 1000) + 1;
  if (type === "date") return today;
  if (type === "bool") return row % 2 === 0;
  return options.length ? options[row % options.length] : "";
}

/** Sets a value at a dotted path, creating objects on the way. */
function setPath(root: Obj, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = root;
  for (const p of parts.slice(0, -1)) cur = (asObject(cur[p]) ?? (cur[p] = {})) as Obj;
  cur[parts.at(-1)!] = value;
}

/**
 * The response the service is expected to give – one sample value per GET
 * attribute, by type: Text «Beispiel …», Zahl stable 1–1000, Datum today,
 * Ja/Nein true, Auswahlliste the first option; lists get 2 sample rows (at
 * their path, if any).
 */
export function mockResponse(getDefs: ServiceAttrDef[], today = new Date().toISOString().slice(0, 10)): Obj {
  const out: Obj = {};
  for (const d of getDefs) {
    if (d.list) {
      const rows = [0, 1].map((i) => Object.fromEntries(d.list!.columns.map((c) => [c.attribute, sampleValue(c.attribute, c.attributeType, c.options, today, i)])));
      if (d.list.path) setPath(out, d.list.path, rows);
      else out[d.attribute] = rows;
    } else out[d.attribute] = sampleValue(d.attribute, d.attributeType, d.options, today);
  }
  return out;
}

const WORDS = ["Alpha", "Berg", "Delta", "Fluss", "Garten", "Horizont", "Kristall", "Linde", "Nova", "Sonne", "Tanne", "Welle"];

/** A random value of a type (Mock services): text «Name Wort 123», number 0 – 10'000 (2 decimals), date ±1 year, any option. */
export function randomValue(name: string, type: AttributeType, options: string[], today: string, rnd: () => number = Math.random): PositionValue {
  const int = (n: number) => Math.floor(rnd() * n);
  if (type === "alpha") return `${name} ${WORDS[int(WORDS.length)]} ${int(1000)}`;
  if (type === "num") return Math.round(rnd() * 1_000_000) / 100;
  if (type === "date") return new Date(Date.parse(`${today}T00:00:00Z`) + (int(731) - 365) * 86_400_000).toISOString().slice(0, 10);
  if (type === "bool") return rnd() < 0.5;
  return options.length ? options[int(options.length)] : "";
}

/**
 * A random answer (service with «Mock» switched on – it isn't called): one
 * random value per GET attribute, lists 1 – 5 random rows (at their path).
 * Text attributes named like a customer number («Kundennummer», «KundenNr»,
 * «KundenId», «customerId» …) get one of `customerNumbers` (ids of real
 * customers) when given – different ones per list row as far as there are.
 */
export function randomResponse(
  getDefs: ServiceAttrDef[],
  today = new Date().toISOString().slice(0, 10),
  rnd: () => number = Math.random,
  customerNumbers: string[] = [],
): Obj {
  let pool: string[] = [];
  /** a customer number not used yet in this answer (refilled when all are used) */
  const nextNumber = () => {
    if (!pool.length) pool = [...customerNumbers];
    return pool.splice(Math.floor(rnd() * pool.length), 1)[0];
  };
  const value = (name: string, type: AttributeType, options: string[]) =>
    customerNumbers.length && type === "alpha" && isCustomerNumberAttribute(name) ? nextNumber() : randomValue(name, type, options, today, rnd);
  const out: Obj = {};
  for (const d of getDefs) {
    if (d.list) {
      const rows = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () =>
        Object.fromEntries(d.list!.columns.map((c) => [c.attribute, value(c.attribute, c.attributeType, c.options)])),
      );
      if (d.list.path) setPath(out, d.list.path, rows);
      else out[d.attribute] = rows;
    } else out[d.attribute] = value(d.attribute, d.attributeType, d.options);
  }
  return out;
}

const CUSTOMER_NUMBER_NAMES = new Set(["kundennummer", "kundennr", "kundenid", "kundeid", "kunde", "customerid", "customernumber", "customerno", "customer"]);

/** «Kundennummer», «Kunden-Nr.», «KundenId», «customer_id» … (case, spaces and punctuation ignored). */
export const isCustomerNumberAttribute = (name: string) => CUSTOMER_NUMBER_NAMES.has(name.toLowerCase().replace(/[^a-z]/g, ""));

/** Does a random answer for these GET attributes use customer numbers? */
export const usesCustomerNumbers = (getDefs: ServiceAttrDef[]) =>
  getDefs.some((d) =>
    d.list ? d.list.columns.some((c) => c.attributeType === "alpha" && isCustomerNumberAttribute(c.attribute)) : d.attributeType === "alpha" && isCustomerNumberAttribute(d.attribute),
  );

/** «Not available»: no answer at all, 404 (endpoint missing) or a server error (5xx). */
export const isUnavailable = (status: number | null) => status === null || status === 404 || status >= 500;
