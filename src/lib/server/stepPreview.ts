import "server-only";
import type { ObjectId } from "mongodb";
import { dayFromDb, formatDay } from "@/lib/customers";
import { renderPlaceholders, usedGroups, type Placeholder, type Segment } from "@/lib/placeholders";
import { formatValue, parseAttributeValues, type AttributeDef, type PositionValue } from "@/lib/positions";
import { ageOn } from "@/lib/rules";
import { mapResponse, mockResponse, type MappedValue } from "@/lib/serviceCall";
import { customerAttributeDefs } from "./customers";
import { collections } from "./db";
import { attributesByType, domainValues } from "./domains";
import { HttpError } from "./http";
import { placeholderCatalog } from "./placeholders";
import { callService } from "./serviceCaller";
import { serviceAttributeDefs } from "./services";

// Journey step test: renders a step content for one customer with all
// placeholders filled. Rules (shown in the dialog):
//   Kunde.*        the customer's fields / attributes
//   Produkt.*      all products, comma-separated
//   Position.T.A   the values of all positions of type T, comma-separated
//   Transaktion.T.A the latest transaction of type T (by its first date attribute, else the last)
//   Service.S.A    S is called; its PUT attributes are filled from the customer's
//                  fields / attributes of the same name; not available → sample data

export type ServiceRun = {
  name: string;
  status: "ok" | "sample" | "error";
  message?: string;
  /** what was sent, by PUT attribute name */
  sent?: Record<string, PositionValue>;
};

export type StepPreview = { customer: { id: string; name: string }; segments: Segment[]; services: ServiceRun[] };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const findDef = (defs: AttributeDef[], name: string) => defs.find((d) => eq(d.attribute, name));
const fmt = (def: AttributeDef, v: PositionValue | undefined) => (v === undefined || v === "" ? null : formatValue(def, v));

export async function previewStep(content: string, customerId: ObjectId): Promise<StepPreview> {
  const c = await collections();
  const customer = await c.customers.findOne({ _id: customerId });
  if (!customer) throw new HttpError(404, "Kunde nicht gefunden");
  const types = await domainValues("productServiceType");
  const [catalog, custDefs, products, positions, transactions, posAttrs, trxAttrs] = await Promise.all([
    placeholderCatalog(),
    customerAttributeDefs(),
    c.customerProducts.find({ customerId }, { collation: { locale: "de" } }).sort({ name: 1 }).toArray(),
    c.customerPositions.find({ customerId }).sort({ sort: 1, createdAt: 1 }).toArray(),
    c.positionTransactions.find({ customerId }).sort({ sort: 1, createdAt: 1 }).toArray(),
    attributesByType(types, "position"),
    attributesByType(types, "trx"),
  ]);
  const typeLabel = (code: string) => types.find((t) => t.code === code)?.label ?? code;
  const dob = dayFromDb(customer.dateOfBirth);
  const today = new Date().toISOString().slice(0, 10);
  const attrs = customer.attributes ?? {};

  /** a customer field or attribute by name – for Kunde.* and for service PUT values */
  const customerValue = (name: string): { raw: PositionValue | undefined; def?: AttributeDef } => {
    if (eq(name, "Vorname")) return { raw: customer.name };
    if (eq(name, "Nachname")) return { raw: customer.lastname };
    if (eq(name, "Geburtsdatum")) return { raw: dob };
    if (eq(name, "Alter")) return { raw: ageOn(dob, today) };
    const def = findDef(custDefs, name);
    return def ? { raw: attrs[def.id], def } : { raw: undefined };
  };

  // --- services used in the content: call each once ----------------------------------
  const serviceNames = new Set<string>();
  for (const id of usedGroups(content, catalog)) if (id.startsWith("service:")) serviceNames.add(id.slice("service:".length));
  const serviceValues = new Map<string, { mapped: MappedValue[]; sample: boolean; error?: string }>();
  const runs: ServiceRun[] = [];
  for (const name of serviceNames) {
    const service = await c.services.findOne({ name }, { collation: { locale: "de", strength: 2 } });
    if (!service) continue;
    const [putDefs, getDefs] = await Promise.all([serviceAttributeDefs(service._id, "put"), serviceAttributeDefs(service._id, "get")]);
    // PUT values from the customer's fields / attributes of the same name
    const input: Record<string, PositionValue> = {};
    for (const d of putDefs) {
      const v = customerValue(d.attribute).raw;
      if (v !== undefined) input[d.id] = v;
    }
    const parsed = parseAttributeValues(putDefs, input);
    const values = "values" in parsed ? parsed.values : {};
    const sent = Object.fromEntries(putDefs.filter((d) => values[d.id] !== undefined).map((d) => [d.attribute, values[d.id]]));
    if (!service.url) {
      serviceValues.set(name, { mapped: mapResponse(getDefs, mockResponse(getDefs)).values, sample: true });
      runs.push({ name, status: "sample", message: "keine URL erfasst – Beispieldaten", sent });
      continue;
    }
    const r = await callService(service.url, "POST", putDefs, getDefs, values);
    if (r.mapped && !r.mock) {
      serviceValues.set(name, { mapped: r.mapped, sample: false });
      runs.push({ name, status: r.error ? "error" : "ok", ...(r.error && { message: r.error }), sent });
    } else if (r.mock) {
      serviceValues.set(name, { mapped: r.mock.mapped, sample: true });
      runs.push({ name, status: "sample", message: `${r.error ?? `HTTP ${r.response?.status}`} – Beispieldaten`, sent });
    } else {
      serviceValues.set(name, { mapped: [], sample: false, error: r.error ?? "Fehler" });
      runs.push({ name, status: "error", message: r.error ?? `HTTP ${r.response?.status}`, sent });
    }
  }

  /** a service's list result (block / count / sum / first) */
  const listOf = (groupId: string, item: Placeholder) => {
    const result = serviceValues.get(groupId.slice("service:".length));
    if (!result) return { error: "Service nicht gefunden" };
    if (result.error) return { error: result.error };
    const m = result.mapped.find((x) => eq(x.attribute, item.attribute));
    if (!m?.list) return { error: "Liste nicht in der Antwort" };
    if (m.status === "missing") return { error: "Liste fehlt in der Antwort" };
    return { list: m.list, sample: result.sample };
  };
  const fmtCell = (col: { attribute: string; attributeType: AttributeDef["attributeType"] }, v: PositionValue | null | undefined) =>
    v === null || v === undefined ? null : formatValue({ id: "", attribute: col.attribute, attributeType: col.attributeType, options: [] }, v);

  // --- fill ------------------------------------------------------------------------------
  const rowsOf = (group: { id: string }, item: Placeholder) => {
    const r = listOf(group.id, item);
    if (!r.list) return { rows: [], note: r.error };
    return {
      rows: r.list.rows.map((row) => Object.fromEntries(r.list!.columns.map((c) => [c.attribute, fmtCell(c, row.values[c.attribute])]))),
      ...(r.sample && { note: "Beispieldaten" }),
    };
  };
  const segments = renderPlaceholders(content, catalog, (group, item) => {
    if (group.id.startsWith("service:") && item.kind && item.kind !== "value") {
      const r = listOf(group.id, item);
      if (!r.list) return { value: null, note: r.error };
      const sampleNote = r.sample ? { note: "Beispieldaten" } : {};
      if (item.kind === "count") return { value: String(r.list.rows.length), ...sampleNote };
      const col = r.list.columns.find((c) => eq(c.attribute, item.column ?? ""));
      if (!col) return { value: null, note: "Spalte nicht gefunden" };
      if (item.kind === "sum") {
        const sum = r.list.rows.reduce((s, row) => s + (typeof row.values[col.attribute] === "number" ? (row.values[col.attribute] as number) : 0), 0);
        return { value: fmtCell(col, Math.round(sum * 100) / 100), ...sampleNote };
      }
      const v = fmtCell(col, r.list.rows[0]?.values[col.attribute]);
      return v === null ? { value: null, note: r.list.rows.length ? "kein Wert in der ersten Zeile" : "leere Liste" } : { value: v, ...sampleNote };
    }
    if (group.id === "kunde") {
      const { raw, def } = customerValue(item.attribute);
      if (raw === undefined || raw === "") return { value: null, note: "kein Wert beim Kunden" };
      if (eq(item.attribute, "Geburtsdatum")) return { value: formatDay(String(raw)) };
      if (eq(item.attribute, "Alter")) return { value: String(raw) };
      return { value: def ? fmt(def, raw) : String(raw) };
    }
    if (group.id === "produkt") {
      if (!products.length) return { value: null, note: "keine Produkte" };
      if (eq(item.attribute, "Name")) return { value: products.map((p) => p.name).join(", ") };
      return { value: [...new Set(products.map((p) => typeLabel(p.productServiceType)))].join(", ") };
    }
    if (group.id.startsWith("position:")) {
      const code = group.id.slice("position:".length);
      const def = findDef(posAttrs[code] ?? [], item.attribute);
      const list = positions.filter((p) => p.productServiceType === code);
      if (!list.length) return { value: null, note: `keine Position «${typeLabel(code)}»` };
      const vals = def ? list.map((p) => fmt(def, p.values[def.id])).filter((v): v is string => v !== null) : [];
      return vals.length ? { value: vals.join(", ") } : { value: null, note: "kein Wert in den Positionen" };
    }
    if (group.id.startsWith("trx:")) {
      const code = group.id.slice("trx:".length);
      const defs = trxAttrs[code] ?? [];
      const def = findDef(defs, item.attribute);
      const positionIds = new Set(positions.filter((p) => p.productServiceType === code).map((p) => p._id.toHexString()));
      const list = transactions.filter((t) => positionIds.has(t.positionId.toHexString()));
      if (!list.length) return { value: null, note: `keine Transaktion «${typeLabel(code)}»` };
      // the latest: by the type's first date attribute, otherwise the last one
      const dateDef = defs.find((d) => d.attributeType === "date");
      const latest = dateDef
        ? [...list].sort((a, b) => String(b.values[dateDef.id] ?? "").localeCompare(String(a.values[dateDef.id] ?? "")))[0]
        : list[list.length - 1];
      const v = def ? fmt(def, latest.values[def.id]) : null;
      return v !== null ? { value: v } : { value: null, note: "kein Wert in der neuesten Transaktion" };
    }
    if (group.id.startsWith("service:")) {
      const result = serviceValues.get(group.id.slice("service:".length));
      if (!result) return { value: null, note: "Service nicht gefunden" };
      if (result.error) return { value: null, note: result.error };
      const m = result.mapped.find((x) => eq(x.attribute, item.attribute));
      if (!m || m.status !== "ok" || m.value === null) return { value: null, note: m?.error ?? "nicht in der Antwort" };
      const value = formatValue({ id: "", attribute: m.attribute, attributeType: m.attributeType, options: [] }, m.value);
      return result.sample ? { value, note: "Beispieldaten" } : { value };
    }
    return { value: null, note: "unbekannt" };
  }, rowsOf);

  return { customer: { id: customer._id.toHexString(), name: `${customer.name} ${customer.lastname}` }, segments, services: runs };
}
