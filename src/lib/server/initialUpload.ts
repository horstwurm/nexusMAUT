import "server-only";
import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import { dateOfBirthError, dayToDb } from "@/lib/customers";
import { CODE_RE } from "@/lib/domains";
import { parseValue, type AttributeDef, type PositionValue, type PositionValues } from "@/lib/positions";
import { ATTRIBUTE_TYPES, type AttributeType } from "@/lib/typeAttributes";
import type { UploadReport, UploadResult } from "@/lib/types";
import { fromJson, fromTables, guessAttribute, normalizeRaw, parseCsv, tableFromGrid, type Table, type UploadData } from "@/lib/uploadData";
import { MANUAL_SOURCE_NAME, type UploadSource } from "@/lib/uploads";
import { collections, type CustomerDoc, type CustomerPositionDoc, type PositionTransactionDoc, type TypeAttributeDoc } from "./db";
import { HttpError } from "./http";

// Admin → Data Management → Initial Upload. `readSources` turns the chosen files (CSV files, one
// Excel workbook or one JSON file) into UploadData; `planUpload` checks it against nexusMAUT (the
// «Test»: types, attributes, references, every value as the forms would) and `runUpload` writes it:
// optionally deleting all customers (with positions, transactions, products, preferences,
// KundenJourneys) and the attributes of the types in the file first, then creating missing types /
// attributes and the customers, products, positions and transactions with uploadSource /
// uploadDate. An upload with errors writes nothing.

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB
const MAX_ERRORS = 100;
const CHUNK = 1000;

// ---- reading the files ----------------------------------------------------------------

/** An Excel cell as plain value (rich text, formulas, links → their text / result). */
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== "object") return v;
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("result" in v) return v.result instanceof Date || typeof v.result !== "object" ? v.result : null;
  if ("text" in v) return typeof v.text === "string" ? v.text : null;
  return null;
}

export async function readSources(files: File[]): Promise<{ source: UploadSource; files: string[]; data: UploadData }> {
  if (!files.length) throw new HttpError(400, "Keine Datei gewählt");
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) throw new HttpError(413, `Die Dateien sind zusammen zu gross (max. ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`);
  const ext = (f: File) => f.name.toLowerCase().split(".").pop() ?? "";
  const kinds = new Set(files.map(ext));
  const names = files.map((f) => f.name);
  if (kinds.size > 1) throw new HttpError(400, "Bitte nur ein Format wählen: CSV-Dateien, eine Excel-Datei oder eine JSON-Datei");
  const kind = [...kinds][0];
  if (kind === "csv") {
    const tables: Table[] = [];
    for (const f of files) tables.push(tableFromGrid(f.name.replace(/\.csv$/i, ""), parseCsv(await f.text())));
    return { source: "csv", files: names, data: fromTables(tables) };
  }
  if (files.length > 1) throw new HttpError(400, "Excel und JSON: bitte genau eine Datei wählen");
  if (kind === "xlsx") {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await files[0].arrayBuffer());
    } catch {
      throw new HttpError(400, "Die Excel-Datei lässt sich nicht lesen");
    }
    const tables = wb.worksheets.map((ws) => {
      const grid: unknown[][] = [];
      ws.eachRow({ includeEmpty: true }, (row, n) => {
        grid[n - 1] = Array.from({ length: ws.columnCount }, (_, i) => cellValue(row.getCell(i + 1).value));
      });
      return tableFromGrid(ws.name, Array.from(grid, (r) => r ?? []));
    });
    return { source: "excel", files: names, data: fromTables(tables) };
  }
  if (kind === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await files[0].text());
    } catch {
      throw new HttpError(400, "Die JSON-Datei ist kein gültiges JSON");
    }
    return { source: "json", files: names, data: fromJson(parsed) };
  }
  throw new HttpError(400, "Unbekanntes Format – erlaubt sind .csv, .xlsx und .json");
}

// ---- checking ----------------------------------------------------------------------------

export type Options = {
  deleteCustomers: boolean;
  deleteAttributes: boolean;
  /** «Upload Daten löschen»: ids of earlier uploads whose data is deleted first (ignored with deleteCustomers) */
  deleteUploads: ObjectId[];
};

/** What «Upload Daten löschen» removes: the uploads' customers with everything of theirs, plus their
 * positions / transactions at other customers. Ids for deleting, counts for the report. */
async function uploadDeletion(uploadIds: ObjectId[]) {
  const c = await collections();
  const uploads = await c.uploads.find({ _id: { $in: uploadIds } }).toArray();
  if (uploads.length !== uploadIds.length) throw new HttpError(400, "Unbekannter Upload in «Upload Daten löschen»");
  const names = uploads.map((u) => u.name);
  const customerIds = (await c.customers.find({ uploadName: { $in: names } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id);
  const positionIds = (await c.customerPositions.find({ $or: [{ uploadName: { $in: names } }, { customerId: { $in: customerIds } }] }, { projection: { _id: 1 } }).toArray()).map((x) => x._id);
  const trxFilter = { $or: [{ uploadName: { $in: names } }, { customerId: { $in: customerIds } }, { positionId: { $in: positionIds } }] };
  const [transactions, customerJourneys] = await Promise.all([c.positionTransactions.countDocuments(trxFilter), c.customerJourneys.countDocuments({ customerId: { $in: customerIds } })]);
  return { uploads, names, customerIds, positionIds, trxFilter, counts: { customers: customerIds.length, positions: positionIds.length, transactions, customerJourneys } };
}
type Level = "position" | "trx";
/** an attribute as the upload will have it: existing (id) or to be created */
type Def = { name: string; type: AttributeType; options: string[]; id: ObjectId | null; service: boolean };
type TypePlan = { code: string; label: string; typeId: ObjectId | null; position: Def[]; trx: Def[]; deleteIds: Record<Level, ObjectId[]> };
type Plan = {
  types: TypePlan[];
  /** existing list attributes that get more options */
  extendOptions: { level: Level; id: ObjectId; options: string[] }[];
  customerAttrs: Def[];
  customers: { key: string; name: string; lastname: string; dob: string; values: Record<string, PositionValue> }[];
  positions: { key: string; customerKey: string; type: string; values: Record<string, PositionValue> }[];
  transactions: { key: string; positionKey: string; values: Record<string, PositionValue> }[];
  products: { customerKey: string; type: string; name: string }[];
};

const lc = (s: string) => s.trim().toLowerCase();
const typeLabel = (t: AttributeType) => ATTRIBUTE_TYPES[t];
const asDef = (d: Def): AttributeDef => ({ id: d.name, attribute: d.name, attributeType: d.type, options: d.options });

export async function planUpload(src: { source: UploadSource; files: string[]; data: UploadData }, opts: Options): Promise<{ report: UploadReport; plan: Plan }> {
  const { data, source } = src;
  const c = await collections();
  const errors: string[] = [];
  let errorCount = 0;
  const warnings: string[] = [];
  const err = (m: string) => {
    errorCount++;
    if (errors.length < MAX_ERRORS) errors.push(m);
  };
  data.problems.forEach(err);
  const where = (table: string, row: number, key: string) => `${table} ${source === "json" ? "#" : "Zeile "}${row}${key ? ` (${key})` : ""}`;

  // -- product types and their attributes
  const [typeDocs, posDocs, trxDocs, custAttrDocs] = await Promise.all([
    c.domainValues.find({ domain: "productServiceType" }).toArray(),
    c.positionAttributes.find().sort({ sort: 1 }).toArray(),
    c.trxAttributes.find().sort({ sort: 1 }).toArray(),
    c.customerAttributes.find().sort({ sort: 1 }).toArray(),
  ]);
  const docsOf = (level: Level, typeId: ObjectId) => (level === "position" ? posDocs : trxDocs).filter((a) => a.typeId.equals(typeId));
  const fromDoc = (a: TypeAttributeDoc | Omit<TypeAttributeDoc, "typeId">): Def => ({ name: a.attribute, type: a.attributeType, options: a.options ?? [], id: a._id, service: Boolean(a.service) });
  const fileTypes = new Map((data.types ?? []).map((t) => [t.code, t]));
  const types = new Map<string, TypePlan>();
  for (const t of typeDocs) {
    const replace = opts.deleteAttributes && fileTypes.has(t.code);
    types.set(t.code, {
      code: t.code,
      label: t.label,
      typeId: t._id,
      position: replace ? [] : docsOf("position", t._id).map(fromDoc),
      trx: replace ? [] : docsOf("trx", t._id).map(fromDoc),
      deleteIds: { position: replace ? docsOf("position", t._id).map((a) => a._id) : [], trx: replace ? docsOf("trx", t._id).map((a) => a._id) : [] },
    });
  }
  if (opts.deleteAttributes && !data.types) warnings.push("Die Quelle enthält keine Typen – «Bestehende Attribute löschen» hat deshalb keine Wirkung.");
  const extendOptions: Plan["extendOptions"] = [];
  const newTypes: string[] = [];
  const newAttributes: string[] = [];
  for (const ft of data.types ?? []) {
    if (!CODE_RE.test(ft.code)) {
      err(`Typen: Code «${ft.code}» – erlaubt sind Kleinbuchstaben, Ziffern, - und _ (max. 40)`);
      continue;
    }
    let tp = types.get(ft.code);
    if (!tp) {
      tp = { code: ft.code, label: ft.label, typeId: null, position: [], trx: [], deleteIds: { position: [], trx: [] } };
      types.set(ft.code, tp);
      newTypes.push(`${ft.label} (${ft.code})`);
    }
    for (const level of ["position", "trx"] as const) {
      for (const fa of ft[level === "position" ? "position" : "trx"]) {
        const have = tp[level].find((d) => lc(d.name) === lc(fa.name));
        const levelName = level === "position" ? "Position" : "Transaktion";
        if (!have) {
          tp[level].push({ name: fa.name, type: fa.type, options: fa.options, id: null, service: false });
          newAttributes.push(`${tp.label} · ${levelName}: ${fa.name} (${typeLabel(fa.type)})`);
        } else if (have.type !== fa.type) {
          err(`Typ «${tp.code}», ${levelName}sattribut «${fa.name}»: in nexusMAUT ${typeLabel(have.type)}, in der Quelle ${typeLabel(fa.type)} – «Bestehende Attribute löschen» einschalten oder Quelle anpassen`);
        } else if (fa.type === "list") {
          const missing = fa.options.filter((o) => !have.options.some((h) => lc(h) === lc(o)));
          if (missing.length && have.id) {
            have.options = [...have.options, ...missing];
            extendOptions.push({ level, id: have.id, options: have.options });
            warnings.push(`Typ «${tp.code}», ${levelName}sattribut «${fa.name}»: Optionen ${missing.map((m) => `«${m}»`).join(", ")} werden ergänzt`);
          }
        }
      }
    }
  }

  // -- customer attributes: existing by name, others created (type guessed from the values)
  const customerAttrs: Def[] = custAttrDocs.map(fromDoc);
  const newCustomerAttributes: string[] = [];
  const columns = new Map<string, string>(); // lower → as written
  // a new attribute's name: the column as written, first letter capitalised («anrede» → «Anrede»)
  for (const cu of data.customers) for (const k of Object.keys(cu.attributes)) if (!columns.has(lc(k))) columns.set(lc(k), k.trim().charAt(0).toUpperCase() + k.trim().slice(1));
  for (const [low, name] of columns) {
    const have = customerAttrs.find((d) => lc(d.name) === low);
    if (have) {
      if (have.service) warnings.push(`Kundenattribut «${have.name}» kommt von einem Service – die Werte aus der Quelle werden ignoriert`);
      continue;
    }
    const values = data.customers.map((cu) => Object.entries(cu.attributes).find(([k]) => lc(k) === low)?.[1]);
    const g = guessAttribute(values);
    customerAttrs.push({ name, type: g.type, options: g.options, id: null, service: false });
    newCustomerAttributes.push(`${name} (${typeLabel(g.type)}${g.type === "list" ? `: ${g.options.join(", ")}` : ""})`);
  }

  /** typed values by attribute name (lower case) – errors reported; service attributes skipped */
  const parseValues = (defs: Def[], raw: Record<string, unknown>, label: string, unknownMsg: (k: string) => string) => {
    const out: Record<string, PositionValue> = {};
    for (const [k, v] of Object.entries(raw)) {
      const def = defs.find((d) => lc(d.name) === lc(k));
      if (!def) {
        if (v !== null && v !== undefined && String(v).trim() !== "") err(`${label}: ${unknownMsg(k.trim())}`);
        continue;
      }
      if (def.service) continue;
      const r = parseValue(asDef(def), normalizeRaw(v, def.type));
      if ("error" in r) err(`${label}: ${r.error}`);
      else if (r.value !== null) out[lc(def.name)] = r.value;
    }
    return out;
  };

  // -- customers
  const customerKeys = new Set<string>();
  const customers: Plan["customers"] = [];
  for (const cu of data.customers) {
    const label = where("Kunden", cu.row, cu.key);
    if (cu.key) {
      if (customerKeys.has(cu.key)) err(`${label}: Kundennummer doppelt`);
      customerKeys.add(cu.key);
    }
    const name = String(cu.name ?? "").trim();
    const lastname = String(cu.lastname ?? "").trim();
    const dob = String(normalizeRaw(cu.dateOfBirth, "date") ?? "").trim();
    if (!name || name.length > 100) err(`${label}: Vorname fehlt oder ist länger als 100 Zeichen`);
    if (!lastname || lastname.length > 100) err(`${label}: Nachname fehlt oder ist länger als 100 Zeichen`);
    const dobError = dateOfBirthError(dob);
    if (dobError) err(`${label}: Geburtsdatum «${String(cu.dateOfBirth ?? "")}» – ${dobError}`);
    const values = parseValues(customerAttrs, cu.attributes, label, (k) => `Kundenattribut «${k}» unbekannt`);
    customers.push({ key: cu.key, name, lastname, dob, values });
  }

  // -- positions
  if (data.transactions.length && data.positions.some((p) => !p.key)) err("Positionen: ohne «positionsnummer» lassen sich keine Transaktionen zuordnen");
  const positionKeys = new Map<string, string>(); // key → type
  const positions: Plan["positions"] = [];
  const productKeys = new Set<string>();
  const products: Plan["products"] = [];
  for (const p of data.positions) {
    const label = where("Positionen", p.row, p.key);
    if (p.key && positionKeys.has(p.key)) err(`${label}: Positionsnummer doppelt`);
    if (!customerKeys.has(p.customerKey)) err(`${label}: Kundennummer «${p.customerKey}» gibt es in den Kunden nicht`);
    const tp = types.get(p.type);
    if (!tp) {
      err(`${label}: Typ «${p.type}» gibt es weder in nexusMAUT noch in den Typen der Quelle`);
      continue;
    }
    if (p.key) positionKeys.set(p.key, p.type);
    const values = parseValues(tp.position, p.values, label, (k) => `Typ «${p.type}» hat kein Positionsattribut «${k}»`);
    if (!Object.keys(values).length) err(`${label}: mindestens ein Wert ist nötig`);
    positions.push({ key: p.key, customerKey: p.customerKey, type: p.type, values });
    const pk = `${p.customerKey}\u0000${p.type}\u0000${lc(p.product)}`;
    if (p.product && !productKeys.has(pk)) {
      productKeys.add(pk);
      products.push({ customerKey: p.customerKey, type: p.type, name: p.product });
    }
  }

  // -- transactions
  const transactions: Plan["transactions"] = [];
  const trxKeys = new Set<string>();
  for (const t of data.transactions) {
    const label = where("Transaktionen", t.row, t.key);
    if (t.key && trxKeys.has(t.key)) err(`${label}: Transaktionsnummer doppelt`);
    if (t.key) trxKeys.add(t.key);
    const type = positionKeys.get(t.positionKey);
    if (!type) {
      err(`${label}: Positionsnummer «${t.positionKey}» gibt es in den Positionen nicht`);
      continue;
    }
    const values = parseValues(types.get(type)!.trx, t.values, label, (k) => `Typ «${type}» hat kein Transaktionsattribut «${k}»`);
    if (!Object.keys(values).length) err(`${label}: mindestens ein Wert ist nötig`);
    transactions.push({ key: t.key, positionKey: t.positionKey, values });
  }

  // -- what gets deleted / stays
  const [existingCustomers, existingPositions, existingTrx, existingRuns] = await Promise.all([
    c.customers.countDocuments(),
    c.customerPositions.countDocuments(),
    c.positionTransactions.countDocuments(),
    c.customerJourneys.countDocuments(),
  ]);

  const attributesDeleted = [...types.values()].reduce((s, t) => s + t.deleteIds.position.length + t.deleteIds.trx.length, 0);
  const byUpload = !opts.deleteCustomers && opts.deleteUploads.length ? await uploadDeletion(opts.deleteUploads) : null;

  // -- «ID»s (kundennummer / positionsnummer / transaktionsnummer) must not be taken by records that stay
  if (!opts.deleteCustomers) {
    const taken = async <T extends { _id: ObjectId; externalId?: string }>(
      col: { find: (f: object, o: object) => { limit: (n: number) => { toArray: () => Promise<T[]> } } },
      keys: string[],
      keep: object,
    ) => (keys.length ? (await col.find({ externalId: { $in: keys }, ...keep }, { projection: { externalId: 1 } }).limit(MAX_ERRORS).toArray()).map((d) => d.externalId!) : []);
    const [cuTaken, posTaken, trxTaken] = await Promise.all([
      taken(c.customers, [...customerKeys], byUpload ? { _id: { $nin: byUpload.customerIds } } : {}),
      taken(c.customerPositions, [...positionKeys.keys()], byUpload ? { _id: { $nin: byUpload.positionIds } } : {}),
      taken(c.positionTransactions, [...trxKeys], byUpload ? { $nor: [byUpload.trxFilter] } : {}),
    ]);
    for (const k of cuTaken) err(`Kunden: Kundennummer «${k}» gibt es schon als ID eines bestehenden Kunden`);
    for (const k of posTaken) err(`Positionen: Positionsnummer «${k}» gibt es schon als ID einer bestehenden Position`);
    for (const k of trxTaken) err(`Transaktionen: Transaktionsnummer «${k}» gibt es schon als ID einer bestehenden Transaktion`);
  }
  const remaining = existingCustomers - (byUpload?.counts.customers ?? 0);
  if (!opts.deleteCustomers && remaining > 0)
    warnings.push(`${remaining} bestehende Kunden bleiben; die Quelle legt ${customers.length} weitere an – ohne Abgleich (Kundennummern, die es als ID schon gibt, werden als Fehler gemeldet).`);
  if (attributesDeleted && !opts.deleteCustomers)
    warnings.push("Die Werte gelöschter Attribute verschwinden auch bei den bestehenden Positionen und Transaktionen; Kunden Selektionen auf diesen Attributen treffen danach nicht mehr.");

  const report: UploadReport = {
    source,
    files: src.files,
    counts: { customers: customers.length, positions: positions.length, transactions: transactions.length, products: products.length },
    newTypes,
    newAttributes,
    newCustomerAttributes,
    deletes: {
      customers: opts.deleteCustomers ? existingCustomers : 0,
      positions: opts.deleteCustomers ? existingPositions : 0,
      transactions: opts.deleteCustomers ? existingTrx : 0,
      customerJourneys: opts.deleteCustomers ? existingRuns : 0,
      attributes: attributesDeleted,
    },
    uploadDeletes: byUpload ? { names: byUpload.names, ...byUpload.counts } : null,
    existingCustomers,
    errors,
    errorCount,
    warnings,
  };
  return { report, plan: { types: [...types.values()], extendOptions, customerAttrs, customers, positions, transactions, products } };
}

// ---- writing ----------------------------------------------------------------------------

async function insertChunks<T extends object>(
  col: { insertMany: (docs: T[], o: { ordered: boolean }) => Promise<unknown> },
  docs: T[],
  onChunk: (n: number) => void = () => {},
) {
  for (let i = 0; i < docs.length; i += CHUNK) {
    const part = docs.slice(i, i + CHUNK);
    await col.insertMany(part, { ordered: false });
    onChunk(part.length);
  }
}

/** Progress of an upload: 0–100 and what is being done (streamed to the dialog). */
export type UploadProgress = (percent: number, label: string) => void;

export const MAX_SOURCE_NAME = 60;

/** The upload's name: trimmed, 1–60 characters (unique – checked when it is registered). */
export function sourceNameOf(raw: unknown) {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new HttpError(400, "Quellname fehlt");
  if (name.length > MAX_SOURCE_NAME) throw new HttpError(400, `Quellname: höchstens ${MAX_SOURCE_NAME} Zeichen`);
  if (name.toLowerCase() === MANUAL_SOURCE_NAME.toLowerCase()) throw new HttpError(409, `«${MANUAL_SOURCE_NAME}» steht für von Hand erfasste Daten – bitte einen anderen Quellnamen wählen`);
  return name;
}

/** 409 when the name is taken (case-insensitive) – before the upload starts streaming. */
export async function assertSourceNameFree(name: string) {
  const c = await collections();
  if (await c.uploads.findOne({ name }, { collation: { locale: "de", strength: 2 } }))
    throw new HttpError(409, `Den Quellnamen «${name}» gibt es schon – bitte einen anderen wählen`);
}

export async function runUpload(
  src: { source: UploadSource; files: string[]; data: UploadData },
  opts: Options,
  meta: { name: string; userId: string },
  progress: UploadProgress = () => {},
): Promise<UploadResult> {
  const c = await collections();
  // a taken name fails at once (the insert below guards against two uploads at the same moment)
  const taken = () => new HttpError(409, `Den Quellnamen «${meta.name}» gibt es schon – bitte einen anderen wählen`);
  if (await c.uploads.findOne({ name: meta.name }, { collation: { locale: "de", strength: 2 } })) throw taken();
  progress(2, "Quelle prüfen");
  const { report, plan } = await planUpload(src, opts);
  if (report.errorCount) return { ...report, done: false, sourceName: null, created: null };
  const now = new Date();
  // register the upload first: reserves the unique name before anything is deleted or written
  const uploadId = new ObjectId();
  try {
    await c.uploads.insertOne({ _id: uploadId, name: meta.name, source: src.source, kind: "initial", files: src.files, options: opts, counts: null, createdAt: now, createdBy: meta.userId });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw taken();
    throw err;
  }
  const origin = { uploadSource: src.source, uploadName: meta.name, uploadDate: now };

  // 1. delete
  if (!opts.deleteCustomers && opts.deleteUploads.length) {
    progress(10, "Upload-Daten löschen");
    const d = await uploadDeletion(opts.deleteUploads);
    const ids = { $in: d.customerIds };
    await Promise.all([
      c.customers.deleteMany({ _id: ids }),
      c.customerProducts.deleteMany({ customerId: ids }),
      c.customerComPrefs.deleteMany({ customerId: ids }),
      c.customerJourneys.deleteMany({ customerId: ids }),
      c.customerJourneySteps.deleteMany({ customerId: ids }),
      c.customerFeedbacks.deleteMany({ customerId: ids }),
      c.positionTransactions.deleteMany(d.trxFilter),
    ]);
    await c.customerPositions.deleteMany({ _id: { $in: d.positionIds } });
    await c.uploads.updateMany({ _id: { $in: opts.deleteUploads } }, { $set: { deletedAt: now, deletedBy: meta.userId } });
  }
  progress(15, opts.deleteCustomers ? "Bestehende Kunden löschen" : "Vorbereiten");
  if (opts.deleteCustomers) {
    await Promise.all([
      c.customers.deleteMany({}),
      c.customerProducts.deleteMany({}),
      c.customerComPrefs.deleteMany({}),
      c.customerPositions.deleteMany({}),
      c.positionTransactions.deleteMany({}),
      c.customerJourneys.deleteMany({}),
      c.customerJourneySteps.deleteMany({}),
      c.customerFeedbacks.deleteMany({}),
    ]);
  }
  for (const t of plan.types) {
    if (!t.typeId || (!t.deleteIds.position.length && !t.deleteIds.trx.length)) continue;
    if (t.deleteIds.position.length) await c.positionAttributes.deleteMany({ _id: { $in: t.deleteIds.position } });
    if (t.deleteIds.trx.length) await c.trxAttributes.deleteMany({ _id: { $in: t.deleteIds.trx } });
    if (!opts.deleteCustomers) {
      const unset = (ids: ObjectId[]) => Object.fromEntries(ids.flatMap((id) => [[`values.${id.toHexString()}`, "" as const], [`serviceFetched.${id.toHexString()}`, "" as const]]));
      if (t.deleteIds.position.length) await c.customerPositions.updateMany({ productServiceType: t.code }, { $unset: unset(t.deleteIds.position) });
      if (t.deleteIds.trx.length) {
        const posIds = (await c.customerPositions.find({ productServiceType: t.code }, { projection: { _id: 1 } }).toArray()).map((p) => p._id);
        await c.positionTransactions.updateMany({ positionId: { $in: posIds } }, { $unset: unset(t.deleteIds.trx) });
      }
    }
  }

  // 2. types and attributes
  progress(25, "Typen und Attribute anlegen");
  let typesCreated = 0;
  let attrsCreated = 0;
  const lastSort = await c.domainValues.find({ domain: "productServiceType" }).sort({ sort: -1 }).limit(1).next();
  let typeSort = lastSort?.sort ?? 0;
  for (const t of plan.types) {
    if (!t.typeId) {
      t.typeId = new ObjectId();
      typeSort += 10;
      await c.domainValues.insertOne({ _id: t.typeId, domain: "productServiceType", code: t.code, label: t.label, active: true, sort: typeSort, createdAt: now, updatedAt: now });
      typesCreated++;
    }
    for (const level of ["position", "trx"] as const) {
      const col = level === "position" ? c.positionAttributes : c.trxAttributes;
      const last = await col.find({ typeId: t.typeId }).sort({ sort: -1 }).limit(1).next();
      let sort = last?.sort ?? 0;
      for (const d of t[level].filter((x) => !x.id)) {
        d.id = new ObjectId();
        sort += 10;
        await col.insertOne({ _id: d.id, typeId: t.typeId, attribute: d.name, attributeType: d.type, options: d.options, sort, createdAt: now, updatedAt: now });
        attrsCreated++;
      }
    }
  }
  for (const e of plan.extendOptions) await (e.level === "position" ? c.positionAttributes : c.trxAttributes).updateOne({ _id: e.id }, { $set: { options: e.options, updatedAt: now } });
  const lastCa = await c.customerAttributes.find().sort({ sort: -1 }).limit(1).next();
  let caSort = lastCa?.sort ?? 0;
  for (const d of plan.customerAttrs.filter((x) => !x.id)) {
    d.id = new ObjectId();
    caSort += 10;
    await c.customerAttributes.insertOne({ _id: d.id, attribute: d.name, attributeType: d.type, options: d.options, sort: caSort, createdAt: now, updatedAt: now });
    attrsCreated++;
  }

  // 3. records (values by attribute id)
  const byId = (defs: Def[], values: Record<string, PositionValue>): PositionValues =>
    Object.fromEntries(Object.entries(values).map(([name, v]) => [defs.find((d) => lc(d.name) === name)!.id!.toHexString(), v]));
  const typeOf = new Map(plan.types.map((t) => [t.code, t]));
  const customerIds = new Map<string, ObjectId>();
  const customerDocs: CustomerDoc[] = plan.customers.map((cu) => {
    const _id = new ObjectId();
    if (cu.key) customerIds.set(cu.key, _id);
    const attributes = byId(plan.customerAttrs, cu.values);
    return {
      _id,
      ...(cu.key && { externalId: cu.key }),
      name: cu.name,
      lastname: cu.lastname,
      dateOfBirth: dayToDb(cu.dob),
      ...(Object.keys(attributes).length && { attributes }),
      ...origin,
      createdAt: now,
      updatedAt: now,
    };
  });
  const positionIds = new Map<string, { _id: ObjectId; customerId: ObjectId }>();
  const posSort = new Map<string, number>();
  const positionDocs: CustomerPositionDoc[] = plan.positions.map((p) => {
    const _id = new ObjectId();
    const customerId = customerIds.get(p.customerKey)!;
    if (p.key) positionIds.set(p.key, { _id, customerId });
    const sort = (posSort.get(p.customerKey) ?? 0) + 10;
    posSort.set(p.customerKey, sort);
    return {
      _id,
      customerId,
      ...(p.key && { externalId: p.key }),
      productServiceType: p.type,
      values: byId(typeOf.get(p.type)!.position, p.values),
      ...origin,
      sort,
      createdAt: now,
      updatedAt: now,
    };
  });
  const trxSort = new Map<string, number>();
  const trxDocs: PositionTransactionDoc[] = plan.transactions.map((t) => {
    const pos = positionIds.get(t.positionKey)!;
    const type = plan.positions.find((p) => p.key === t.positionKey)!.type;
    const sort = (trxSort.get(t.positionKey) ?? 0) + 10;
    trxSort.set(t.positionKey, sort);
    return {
      _id: new ObjectId(),
      positionId: pos._id,
      customerId: pos.customerId,
      ...(t.key && { externalId: t.key }),
      values: byId(typeOf.get(type)!.trx, t.values),
      ...origin,
      sort,
      createdAt: now,
      updatedAt: now,
    };
  });
  const productDocs = plan.products.map((p) => ({ _id: new ObjectId(), customerId: customerIds.get(p.customerKey)!, name: p.name, productServiceType: p.type, createdAt: now, updatedAt: now }));

  // records: 30 → 99 % by the number written
  const totalRecords = customerDocs.length + productDocs.length + positionDocs.length + trxDocs.length || 1;
  let written = 0;
  const step = (label: string) => (n: number) => {
    written += n;
    progress(30 + Math.round((written / totalRecords) * 69), label);
  };
  progress(30, "Kunden anlegen");
  await insertChunks(c.customers, customerDocs, step("Kunden anlegen"));
  await insertChunks(c.customerProducts, productDocs, step("Produkte anlegen"));
  await insertChunks(c.customerPositions, positionDocs, step("Positionen anlegen"));
  await insertChunks(c.positionTransactions, trxDocs, step("Transaktionen anlegen"));
  await c.uploads.updateOne(
    { _id: uploadId },
    { $set: { counts: { customers: customerDocs.length, positions: positionDocs.length, transactions: trxDocs.length, products: productDocs.length } } },
  );

  return {
    ...report,
    done: true,
    sourceName: meta.name,
    created: { customers: customerDocs.length, positions: positionDocs.length, transactions: trxDocs.length, products: productDocs.length, types: typesCreated, attributes: attrsCreated },
  };
}
