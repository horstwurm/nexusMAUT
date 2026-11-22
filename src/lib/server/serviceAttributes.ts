import "server-only";
import { ObjectId } from "mongodb";
import { dayFromDb } from "@/lib/customers";
import { parseAttributeValues, type AttributeDef, type PositionValue } from "@/lib/positions";
import { ageOn } from "@/lib/rules";
import { isUnavailable, type ServiceAttrDef } from "@/lib/serviceCall";
import type { AttributeKind } from "@/lib/typeAttributes";
import { attributeDefsOf, customerAttributeDefs } from "./customers";
import { collections, type CustomerDoc, type CustomerPositionDoc, type PositionTransactionDoc } from "./db";
import { HttpError } from "./http";
import { callService, type CallResult } from "./serviceCaller";
import { serviceAttributeDefs } from "./services";

// «Service» attributes: customer / position / trx attributes whose value comes
// from a simple GET attribute of a service. Values are **stored** on the record
// like normal attribute values (so rules, placeholders and lists read them
// without calling anything) and refreshed on demand:
//   - refreshCustomer: the customer's service attributes, optionally with those
//     of its positions and transactions («Service-Werte aktualisieren»)
//   - refreshPosition / refreshTransaction: one record (after it was saved)
//   - refreshAttribute: one attribute on all records (Admin «Werte aktualisieren»)
// PUT values are taken by name – a transaction from its own values, then its
// position's, then the customer's; a position from its own, then the customer's;
// the customer from Vorname / Nachname / Geburtsdatum / Alter and its attributes.
// Not available / no URL / an error → the stored value stays, the error is noted
// in `serviceFetched` (sample data is never stored). Answered without the
// attribute → the value is removed. One call per service and PUT values per run.

type Values = Record<string, PositionValue>;
type Source = { defs: AttributeDef[]; values: Values };
/** `mock` only when a value was fetched (a failed fetch keeps the stored value – and its flag) */
type Fetched = { at: Date; error: string | null; mock?: boolean };
export type RefreshSummary = { records: number; values: number; errors: number; messages: string[] };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const PARALLEL = 8;

/** One refresh run: service definitions and answers are shared by all records. */
class Run {
  private services = new Map<string, Promise<{ name: string; url: string; mock: boolean; put: ServiceAttrDef[]; get: ServiceAttrDef[] } | null>>();
  private calls = new Map<string, Promise<CallResult>>();
  private down = new Map<string, string>();
  summary: RefreshSummary = { records: 0, values: 0, errors: 0, messages: [] };
  private now = new Date();
  private custDefs = customerAttributeDefs();

  private service(id: string) {
    let p = this.services.get(id);
    if (!p) {
      p = (async () => {
        const { services } = await collections();
        const s = await services.findOne({ _id: new ObjectId(id) });
        if (!s) return null;
        const [put, get] = await Promise.all([serviceAttributeDefs(s._id, "put"), serviceAttributeDefs(s._id, "get")]);
        return { name: s.name, url: s.url ?? "", mock: s.mock ?? false, put, get };
      })();
      this.services.set(id, p);
    }
    return p;
  }

  private note(msg: string) {
    this.summary.errors++;
    if (!this.summary.messages.includes(msg) && this.summary.messages.length < 10) this.summary.messages.push(msg);
  }

  /** a customer's own fields + attributes as the last source */
  async customerSource(c: CustomerDoc): Promise<Source> {
    const dob = dayFromDb(c.dateOfBirth);
    const today = this.now.toISOString().slice(0, 10);
    const builtIn: AttributeDef[] = [
      { id: "__name", attribute: "Vorname", attributeType: "alpha", options: [] },
      { id: "__lastname", attribute: "Nachname", attributeType: "alpha", options: [] },
      { id: "__dob", attribute: "Geburtsdatum", attributeType: "date", options: [] },
      { id: "__age", attribute: "Alter", attributeType: "num", options: [] },
    ];
    return {
      defs: [...builtIn, ...(await this.custDefs)],
      values: { ...(c.attributes ?? {}), __name: c.name, __lastname: c.lastname, __dob: dob, __age: ageOn(dob, today) },
    };
  }

  /**
   * Fetches the service attributes `defs` of one record. `sources`: the record
   * itself first, then its parents. Returns what to $set / $unset.
   */
  async fetch(defs: AttributeDef[], sources: Source[]) {
    const set: Values = {};
    const unset: string[] = [];
    const fetched: Record<string, Fetched> = {};
    const lookup = (name: string) => {
      for (const s of sources) {
        const d = s.defs.find((x) => eq(x.attribute, name));
        if (d && s.values[d.id] !== undefined) return s.values[d.id];
      }
      return undefined;
    };
    const byService = new Map<string, AttributeDef[]>();
    for (const d of defs) if (d.service) byService.set(d.service.serviceId, [...(byService.get(d.service.serviceId) ?? []), d]);

    for (const [serviceId, list] of byService) {
      const fail = (error: string) => {
        for (const d of list) fetched[d.id] = { at: this.now, error };
        this.note(error);
      };
      const svc = await this.service(serviceId);
      if (!svc) {
        fail("Service gelöscht");
        continue;
      }
      if (!svc.url && !svc.mock) {
        fail(`Service «${svc.name}»: keine URL erfasst`);
        continue;
      }
      const down = this.down.get(serviceId);
      if (down) {
        fail(down);
        continue;
      }
      const input: Record<string, unknown> = {};
      for (const p of svc.put) {
        const v = lookup(p.attribute);
        if (v !== undefined) input[p.id] = v;
      }
      const parsed = parseAttributeValues(svc.put, input);
      const values = "values" in parsed ? parsed.values : {};
      const key = `${serviceId}|${JSON.stringify(values)}`;
      // «Mock»: random values, every record its own (not shared by equal PUT values)
      let call = svc.mock ? undefined : this.calls.get(key);
      if (!call) {
        call = callService(svc.url, "POST", svc.put, svc.get, values, { mock: svc.mock });
        if (!svc.mock) this.calls.set(key, call);
      }
      const r = await call;
      if (r.mock || isUnavailable(r.response?.status ?? null)) {
        const msg = `Service «${svc.name}»: ${r.error ?? `HTTP ${r.response?.status} – nicht erreichbar`}`;
        this.down.set(serviceId, msg); // don't wait for it again in this run
        fail(msg);
        continue;
      }
      if (!r.mapped) {
        fail(`Service «${svc.name}»: ${r.error ?? `HTTP ${r.response?.status}`}`);
        continue;
      }
      for (const d of list) {
        const getDef = svc.get.find((g) => g.id === d.service!.attrId);
        const m = getDef ? r.mapped.find((x) => eq(x.attribute, getDef.attribute)) : undefined;
        if (m && m.status === "ok" && m.value !== null && !Array.isArray(m.value)) {
          set[d.id] = m.value as PositionValue;
          fetched[d.id] = { at: this.now, error: null, mock: Boolean(r.random) };
          this.summary.values++;
        } else {
          const error = !getDef ? "GET-Attribut gelöscht" : m?.status === "invalid" ? `«${getDef.attribute}»: ${m.error ?? "ungültig"}` : `«${getDef.attribute}» nicht in der Antwort`;
          unset.push(d.id);
          fetched[d.id] = { at: this.now, error, mock: false };
          this.note(`Service «${svc.name}»: ${error}`);
        }
      }
    }
    return { set, unset, fetched };
  }

  /** $set / $unset for a record: values under `field` (attributes | values), metadata under serviceFetched */
  static update(field: "attributes" | "values", r: Awaited<ReturnType<Run["fetch"]>>) {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ""> = {};
    for (const [k, v] of Object.entries(r.set)) $set[`${field}.${k}`] = v;
    for (const k of r.unset) $unset[`${field}.${k}`] = "";
    // field by field: a failed fetch leaves `mock` of the stored value alone
    for (const [k, v] of Object.entries(r.fetched)) {
      $set[`serviceFetched.${k}.at`] = v.at;
      $set[`serviceFetched.${k}.error`] = v.error;
      if (v.mock !== undefined) $set[`serviceFetched.${k}.mock`] = v.mock;
    }
    return { ...(Object.keys($set).length && { $set }), ...(Object.keys($unset).length && { $unset }) };
  }
}

const serviceDefs = (defs: AttributeDef[]) => defs.filter((d) => d.service);

/** per type code: its service attributes of a kind, and all its attributes (as PUT sources) */
function defsCache(kind: AttributeKind) {
  const cache = new Map<string, Promise<AttributeDef[]>>();
  return (code: string) => {
    let p = cache.get(code);
    if (!p) cache.set(code, (p = attributeDefsOf(code, kind)));
    return p;
  };
}

async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += PARALLEL) await Promise.all(items.slice(i, i + PARALLEL).map(fn));
}

async function refreshCustomerDoc(run: Run, c: CustomerDoc) {
  const defs = serviceDefs(await customerAttributeDefs());
  if (!defs.length) return;
  const r = await run.fetch(defs, [await run.customerSource(c)]);
  const u = Run.update("attributes", r);
  if (Object.keys(u).length) {
    const { customers } = await collections();
    await customers.updateOne({ _id: c._id }, u);
    run.summary.records++;
  }
}

async function refreshPositionDoc(run: Run, p: CustomerPositionDoc, customer: CustomerDoc, posDefs: (code: string) => Promise<AttributeDef[]>) {
  const all = await posDefs(p.productServiceType);
  const defs = serviceDefs(all);
  if (!defs.length) return;
  const r = await run.fetch(defs, [{ defs: all, values: p.values }, await run.customerSource(customer)]);
  const u = Run.update("values", r);
  if (Object.keys(u).length) {
    const { customerPositions } = await collections();
    await customerPositions.updateOne({ _id: p._id }, u);
    run.summary.records++;
  }
}

async function refreshTrxDoc(
  run: Run,
  t: PositionTransactionDoc,
  position: CustomerPositionDoc,
  customer: CustomerDoc,
  posDefs: (code: string) => Promise<AttributeDef[]>,
  trxDefs: (code: string) => Promise<AttributeDef[]>,
) {
  const all = await trxDefs(position.productServiceType);
  const defs = serviceDefs(all);
  if (!defs.length) return;
  const r = await run.fetch(defs, [{ defs: all, values: t.values }, { defs: await posDefs(position.productServiceType), values: position.values }, await run.customerSource(customer)]);
  const u = Run.update("values", r);
  if (Object.keys(u).length) {
    const { positionTransactions } = await collections();
    await positionTransactions.updateOne({ _id: t._id }, u);
    run.summary.records++;
  }
}

/** The customer's service attributes – with `deep` also those of its positions and transactions. */
export async function refreshCustomer(customerId: ObjectId, deep = false): Promise<RefreshSummary> {
  const c = await collections();
  const customer = await c.customers.findOne({ _id: customerId });
  if (!customer) throw new HttpError(404, "Kunde nicht gefunden");
  const run = new Run();
  await refreshCustomerDoc(run, customer);
  if (deep) {
    const posDefs = defsCache("position");
    const trxDefs = defsCache("trx");
    const positions = await c.customerPositions.find({ customerId }).toArray();
    await inBatches(positions, (p) => refreshPositionDoc(run, p, customer, posDefs));
    const byId = new Map(positions.map((p) => [p._id.toHexString(), p]));
    // positions with their refreshed values as PUT sources for the transactions
    for (const p of await c.customerPositions.find({ customerId }).toArray()) byId.set(p._id.toHexString(), p);
    const trx = await c.positionTransactions.find({ customerId }).toArray();
    await inBatches(trx, async (t) => {
      const p = byId.get(t.positionId.toHexString());
      if (p) await refreshTrxDoc(run, t, p, customer, posDefs, trxDefs);
    });
  }
  return run.summary;
}

/**
 * All service attributes of many customers (or all: `ids` omitted) with their
 * positions and transactions, in one run (answers shared, 8 calls at a time)
 * – «Daten aktualisieren» on the Kunden list.
 */
export async function refreshCustomers(ids?: ObjectId[]): Promise<RefreshSummary & { customers: number }> {
  const c = await collections();
  const run = new Run();
  const filter = ids ? { _id: { $in: ids } } : {};
  const customers = await c.customers.find(filter).toArray();
  const customerIds = customers.map((x) => x._id);
  const byId = new Map(customers.map((x) => [x._id.toHexString(), x]));
  const posDefs = defsCache("position");
  const trxDefs = defsCache("trx");
  await inBatches(customers, (cust) => refreshCustomerDoc(run, cust));
  // customers with their refreshed values as PUT sources for positions, then positions for transactions
  const fresh = new Map((await c.customers.find({ _id: { $in: customerIds } }).toArray()).map((x) => [x._id.toHexString(), x]));
  const positions = await c.customerPositions.find({ customerId: { $in: customerIds } }).toArray();
  await inBatches(positions, async (p) => {
    const cust = fresh.get(p.customerId.toHexString()) ?? byId.get(p.customerId.toHexString());
    if (cust) await refreshPositionDoc(run, p, cust, posDefs);
  });
  const posById = new Map((await c.customerPositions.find({ customerId: { $in: customerIds } }).toArray()).map((p) => [p._id.toHexString(), p]));
  const trx = await c.positionTransactions.find({ customerId: { $in: customerIds } }).toArray();
  await inBatches(trx, async (t) => {
    const p = posById.get(t.positionId.toHexString());
    const cust = p && fresh.get(p.customerId.toHexString());
    if (p && cust) await refreshTrxDoc(run, t, p, cust, posDefs, trxDefs);
  });
  return { ...run.summary, customers: customers.length };
}

export async function refreshPosition(positionId: ObjectId): Promise<RefreshSummary> {
  const c = await collections();
  const run = new Run();
  const p = await c.customerPositions.findOne({ _id: positionId });
  const customer = p && (await c.customers.findOne({ _id: p.customerId }));
  if (p && customer) await refreshPositionDoc(run, p, customer, defsCache("position"));
  return run.summary;
}

export async function refreshTransaction(trxId: ObjectId): Promise<RefreshSummary> {
  const c = await collections();
  const run = new Run();
  const t = await c.positionTransactions.findOne({ _id: trxId });
  const p = t && (await c.customerPositions.findOne({ _id: t.positionId }));
  const customer = p && (await c.customers.findOne({ _id: p.customerId }));
  if (t && p && customer) await refreshTrxDoc(run, t, p, customer, defsCache("position"), defsCache("trx"));
  return run.summary;
}

/** True when this customer / position type / trx type has any service attribute (saves skip the refresh otherwise). */
export async function hasServiceAttributes(kind: "customer" | AttributeKind, typeCode?: string) {
  const defs = kind === "customer" ? await customerAttributeDefs() : await attributeDefsOf(typeCode ?? "", kind);
  return defs.some((d) => d.service);
}

/** One service attribute on all records it applies to (Admin «Werte aktualisieren»). */
export async function refreshAttribute(kind: "customer" | AttributeKind, attrId: ObjectId): Promise<RefreshSummary> {
  const c = await collections();
  const run = new Run();
  const only = (defs: AttributeDef[]) => defs.filter((d) => d.id === attrId.toHexString() && d.service);
  const customersById = async (ids: ObjectId[]) =>
    new Map((await c.customers.find({ _id: { $in: ids } }).toArray()).map((x) => [x._id.toHexString(), x]));

  if (kind === "customer") {
    const doc = await c.customerAttributes.findOne({ _id: attrId });
    if (!doc?.service) throw new HttpError(400, "Kein Service-Attribut");
    const defs = only(await customerAttributeDefs());
    const list = await c.customers.find({}).toArray();
    await inBatches(list, async (cust) => {
      const u = Run.update("attributes", await run.fetch(defs, [await run.customerSource(cust)]));
      if (Object.keys(u).length) {
        await c.customers.updateOne({ _id: cust._id }, u);
        run.summary.records++;
      }
    });
    return run.summary;
  }

  const col = kind === "position" ? c.positionAttributes : c.trxAttributes;
  const doc = await col.findOne({ _id: attrId });
  if (!doc?.service) throw new HttpError(400, "Kein Service-Attribut");
  const type = await c.domainValues.findOne({ _id: doc.typeId });
  if (!type) return run.summary;
  const posDefs = defsCache("position");
  const positions = await c.customerPositions.find({ productServiceType: type.code }).toArray();
  const customers = await customersById([...new Set(positions.map((p) => p.customerId.toHexString()))].map((i) => new ObjectId(i)));

  if (kind === "position") {
    const defs = only(await posDefs(type.code));
    await inBatches(positions, async (p) => {
      const cust = customers.get(p.customerId.toHexString());
      if (!cust) return;
      const u = Run.update("values", await run.fetch(defs, [{ defs: await posDefs(type.code), values: p.values }, await run.customerSource(cust)]));
      if (Object.keys(u).length) {
        await c.customerPositions.updateOne({ _id: p._id }, u);
        run.summary.records++;
      }
    });
    return run.summary;
  }

  const trxDefs = defsCache("trx");
  const defs = only(await trxDefs(type.code));
  const byId = new Map(positions.map((p) => [p._id.toHexString(), p]));
  const trx = await c.positionTransactions.find({ positionId: { $in: positions.map((p) => p._id) } }).toArray();
  await inBatches(trx, async (t) => {
    const p = byId.get(t.positionId.toHexString());
    const cust = p && customers.get(p.customerId.toHexString());
    if (!p || !cust) return;
    const u = Run.update(
      "values",
      await run.fetch(defs, [{ defs: await trxDefs(type.code), values: t.values }, { defs: await posDefs(type.code), values: p.values }, await run.customerSource(cust)]),
    );
    if (Object.keys(u).length) {
      await c.positionTransactions.updateOne({ _id: t._id }, u);
      run.summary.records++;
    }
  });
  return run.summary;
}
