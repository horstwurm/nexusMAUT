import "server-only";
import type { ObjectId } from "mongodb";
import { dayFromDb } from "@/lib/customers";
import { parseAttributeValues, type AttributeDef } from "@/lib/positions";
import type { AttributeKind } from "@/lib/typeAttributes";
import type { Customer, CustomerComPref, CustomerPosition, CustomerProduct, PositionTransaction } from "@/lib/types";
import { collections, type CustomerComPrefDoc, type CustomerDoc, type CustomerPositionDoc, type CustomerProductDoc, type PositionTransactionDoc } from "./db";
import { typeAttributesOf } from "./domains";
import { HttpError } from "./http";

export const toCustomer = (c: CustomerDoc): Customer => ({
  id: c._id.toHexString(),
  name: c.name,
  lastname: c.lastname,
  dateOfBirth: dayFromDb(c.dateOfBirth),
  attributes: c.attributes ?? {},
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

/** 404 unless the customer exists (parent of the relation routes). */
export async function requireCustomer(id: ObjectId) {
  const { customers } = await collections();
  const doc = await customers.findOne({ _id: id });
  if (!doc) throw new HttpError(404, "Kunde nicht gefunden");
  return doc;
}

export const toCustomerPosition = (p: CustomerPositionDoc): CustomerPosition => ({
  id: p._id.toHexString(),
  customerId: p.customerId.toHexString(),
  productServiceType: p.productServiceType,
  values: p.values,
  sort: p.sort,
  updatedAt: p.updatedAt.toISOString(),
});

export const toPositionTransaction = (t: PositionTransactionDoc): PositionTransaction => ({
  id: t._id.toHexString(),
  positionId: t.positionId.toHexString(),
  values: t.values,
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
  return (await customerAttributes.find().sort({ sort: 1, attribute: 1 }).toArray()).map((a) => ({
    id: a._id.toHexString(),
    attribute: a.attribute,
    attributeType: a.attributeType,
    options: a.options,
  }));
}

/** The position (or transaction) attributes of a product type (by code); none for an unknown code. */
export async function attributeDefsOf(typeCode: string, kind: AttributeKind = "position"): Promise<AttributeDef[]> {
  const { domainValues } = await collections();
  const type = await domainValues.findOne({ domain: "productServiceType", code: typeCode });
  if (!type) return [];
  return (await typeAttributesOf(type._id, kind)).map((a) => ({
    id: a._id.toHexString(),
    attribute: a.attribute,
    attributeType: a.attributeType,
    options: a.options,
  }));
}
