import "server-only";
import type { ObjectId } from "mongodb";
import { dayFromDb } from "@/lib/customers";
import { parseAttributeValues, type AttributeDef } from "@/lib/positions";
import type { IdKind } from "@/lib/serviceCall";
import type { AttributeKind } from "@/lib/typeAttributes";
import type { Customer, CustomerComPref, CustomerPosition, CustomerProduct, PositionTransaction } from "@/lib/types";
import { collections, type ServiceFetched, type CustomerComPrefDoc, type CustomerDoc, type CustomerPositionDoc, type CustomerProductDoc, type PositionTransactionDoc } from "./db";
import { typeAttributesOf } from "./domains";
import { HttpError } from "./http";
import { toAttributeDefs } from "./serviceSources";

const fetchedView = (f: ServiceFetched) =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { at: v.at.toISOString(), error: v.error, mock: v.mock ?? false }]));

export const toCustomer = (c: CustomerDoc): Customer => ({
  id: c._id.toHexString(),
  externalId: c.externalId ?? "",
  name: c.name,
  lastname: c.lastname,
  dateOfBirth: dayFromDb(c.dateOfBirth),
  attributes: c.attributes ?? {},
  ...(c.serviceFetched && { serviceFetched: fetchedView(c.serviceFetched) }),
  uploadSource: c.uploadSource ?? null,
  uploadName: c.uploadName ?? null,
  uploadDate: c.uploadDate?.toISOString() ?? null,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

export const toCustomerProduct = (p: CustomerProductDoc): CustomerProduct => ({
  id: p._id.toHexString(),
  customerId: p.customerId.toHexString(),
  name: p.name,
  productServiceType: p.productServiceType,
  updatedAt: p.updatedAt.toISOString(),
});

export const toCustomerComPref = (p: CustomerComPrefDoc): CustomerComPref => ({
  id: p._id.toHexString(),
  customerId: p.customerId.toHexString(),
  usageInstruction: p.usageInstruction,
  comPrefType: p.comPrefType,
  updatedAt: p.updatedAt.toISOString(),
});

/**
 * The «ID» part of an update: omitted = unchanged, "" = removed, else set.
 * Spread into the update document next to `$set` fields: `{ ...setWithId(fields, id) }`.
 */
export function setWithId<T extends object>(fields: T, externalId: string | undefined) {
  if (externalId === undefined) return { $set: fields };
  if (externalId === "") return { $set: fields, $unset: { externalId: "" as const } };
  return { $set: { ...fields, externalId } };
}

/** The «ID» for a new record (none when empty). */
export const newExternalId = (externalId: string | undefined) => (externalId ? { externalId } : {});

/** 409 for a taken «ID» (unique index), else rethrows. */
export function rethrowDuplicateId(err: unknown, what: "Kunden" | "Position" | "Transaktion", externalId: string | undefined): never {
  if ((err as { code?: number }).code === 11000 && externalId)
    throw new HttpError(409, `Die ID «${externalId}» gibt es schon bei ${what === "Kunden" ? "einem anderen Kunden" : what === "Position" ? "einer anderen Position" : "einer anderen Transaktion"}`);
  throw err;
}

/** 404 unless the customer exists (parent of the relation routes). */
export async function requireCustomer(id: ObjectId) {
  const { customers } = await collections();
  const doc = await customers.findOne({ _id: id });
  if (!doc) throw new HttpError(404, "Kunde nicht gefunden");
  return doc;
}

export const toCustomerPosition = (p: CustomerPositionDoc): CustomerPosition => ({
  id: p._id.toHexString(),
  externalId: p.externalId ?? "",
  customerId: p.customerId.toHexString(),
  productServiceType: p.productServiceType,
  values: p.values,
  ...(p.serviceFetched && { serviceFetched: fetchedView(p.serviceFetched) }),
  uploadSource: p.uploadSource ?? null,
  uploadName: p.uploadName ?? null,
  uploadDate: p.uploadDate?.toISOString() ?? null,
  sort: p.sort,
  updatedAt: p.updatedAt.toISOString(),
});

export const toPositionTransaction = (t: PositionTransactionDoc): PositionTransaction => ({
  id: t._id.toHexString(),
  externalId: t.externalId ?? "",
  positionId: t.positionId.toHexString(),
  values: t.values,
  ...(t.serviceFetched && { serviceFetched: fetchedView(t.serviceFetched) }),
  uploadSource: t.uploadSource ?? null,
  uploadName: t.uploadName ?? null,
  uploadDate: t.uploadDate?.toISOString() ?? null,
  sort: t.sort,
  updatedAt: t.updatedAt.toISOString(),
});

/** Positions for lists: with their number of transactions. */
export async function toCustomerPositions(list: CustomerPositionDoc[]): Promise<CustomerPosition[]> {
  const { positionTransactions } = await collections();
  const counts = await positionTransactions
    .aggregate<{ _id: ObjectId; n: number }>([
      { $match: { positionId: { $in: list.map((p) => p._id) } } },
      { $group: { _id: "$positionId", n: { $sum: 1 } } },
    ])
    .toArray();
  const countOf = new Map(counts.map((c) => [c._id.toHexString(), c.n]));
  return list.map((p) => ({ ...toCustomerPosition(p), transactionCount: countOf.get(p._id.toHexString()) ?? 0 }));
}

/** 404 unless the position belongs to the customer (parent of the transaction routes). */
export async function requireCustomerPosition(customerId: ObjectId, positionId: ObjectId) {
  const { customerPositions } = await collections();
  const doc = await customerPositions.findOne({ _id: positionId, customerId });
  if (!doc) throw new HttpError(404, "Position nicht gefunden");
  return doc;
}

/** Checks customer attribute values (raw input) → stored values; 400 on a wrong value. */
export async function parseCustomerAttributes(input: Record<string, unknown>) {
  const r = parseAttributeValues(await customerAttributeDefs(), input);
  if ("error" in r) throw new HttpError(400, r.error);
  return r.values;
}

/** The customer attributes, in order. */
export async function customerAttributeDefs(): Promise<AttributeDef[]> {
  const { customerAttributes } = await collections();
  return toAttributeDefs(await customerAttributes.find().sort({ sort: 1, attribute: 1 }).toArray());
}

/** The position (or transaction) attributes of a product type (by code); none for an unknown code. */
export async function attributeDefsOf(typeCode: string, kind: AttributeKind = "position"): Promise<AttributeDef[]> {
  const { domainValues } = await collections();
  const type = await domainValues.findOne({ domain: "productServiceType", code: typeCode });
  if (!type) return [];
  return toAttributeDefs(await typeAttributesOf(type._id, kind));
}

/**
 * «ID»s (externalId) of up to `n` randomly chosen customers / positions /
 * transactions that have one – what a «Mock» service answers with
 * (`randomResponse`). Only when no record of the kind has an ID: internal ids.
 * Empty without records.
 */
export async function sampleIds(kind: IdKind, n = 25) {
  const c = await collections();
  const col = (kind === "customer" ? c.customers : kind === "position" ? c.customerPositions : c.positionTransactions) as typeof c.customers;
  const withId = await col
    .aggregate<{ externalId: string }>([{ $match: { externalId: { $type: "string" } } }, { $sample: { size: n } }, { $project: { _id: 0, externalId: 1 } }])
    .toArray();
  if (withId.length) return withId.map((r) => r.externalId);
  const rows = await col.aggregate<{ _id: ObjectId }>([{ $sample: { size: n } }, { $project: { _id: 1 } }]).toArray();
  return rows.map((r) => r._id.toHexString());
}
