import "server-only";
import type { ObjectId } from "mongodb";
import { dayFromDb } from "@/lib/customers";
import { evaluateRule, type AttrInfo, type CustomerData, type Rule, type RuleContext } from "@/lib/rules";
import type { RuleView } from "@/lib/types";
import { collections, type RuleDoc } from "./db";

// Evaluating rules: all customers with their positions and transactions are
// loaded once per request (fine for thousands of customers) and checked in
// memory with the pure evaluation in src/lib/rules.ts.

export const toRuleView = (r: RuleDoc, matchCount?: number): RuleView => ({
  id: r._id.toHexString(),
  name: r.name,
  description: r.description,
  match: r.match,
  conditions: r.conditions,
  updatedAt: r.updatedAt.toISOString(),
  ...(matchCount !== undefined && { matchCount }),
});

export type RuleDataset = {
  ctx: RuleContext;
  customers: { id: ObjectId; name: string; lastname: string; dateOfBirth: string; data: CustomerData }[];
};

/** Everything a rule can look at, loaded once («Service» attribute values are stored ones). */
export async function loadRuleDataset(): Promise<RuleDataset> {
  const { customers, customerPositions, positionTransactions, positionAttributes, trxAttributes, customerAttributes } = await collections();
  const [cs, positions, transactions, pAttrs, tAttrs, cAttrs] = await Promise.all([
    customers.find({}, { collation: { locale: "de" } }).sort({ lastname: 1, name: 1 }).toArray(),
    customerPositions.find({}, { projection: { customerId: 1, productServiceType: 1, values: 1 } }).toArray(),
    positionTransactions.find({}, { projection: { customerId: 1, positionId: 1, values: 1 } }).toArray(),
    positionAttributes.find({}, { projection: { attributeType: 1 } }).toArray(),
    trxAttributes.find({}, { projection: { attributeType: 1 } }).toArray(),
    customerAttributes.find({}, { projection: { attributeType: 1 } }).toArray(),
  ]);
  const attributes = new Map<string, AttrInfo>([...pAttrs, ...tAttrs, ...cAttrs].map((a) => [a._id.toHexString(), { attributeType: a.attributeType }]));

  const byCustomer = new Map<string, CustomerData>();
  const out = cs.map((c) => {
    const data: CustomerData = {
      name: c.name,
      lastname: c.lastname,
      dateOfBirth: dayFromDb(c.dateOfBirth),
      attributes: c.attributes ?? {},
      positions: [],
      transactions: [],
    };
    byCustomer.set(c._id.toHexString(), data);
    return { id: c._id, name: c.name, lastname: c.lastname, dateOfBirth: data.dateOfBirth, data };
  });
  const typeOfPosition = new Map<string, string>();
  for (const p of positions) {
    typeOfPosition.set(p._id.toHexString(), p.productServiceType);
    byCustomer.get(p.customerId.toHexString())?.positions.push({ type: p.productServiceType, values: p.values });
  }
  for (const t of transactions) {
    const type = typeOfPosition.get(t.positionId.toHexString());
    if (type) byCustomer.get(t.customerId.toHexString())?.transactions.push({ type, values: t.values });
  }
  const today = new Date().toISOString().slice(0, 10);
  return { ctx: { today, attributes }, customers: out };
}

/** Customers matching a rule, in name order. */
export function matchingCustomers(rule: Rule, ds: RuleDataset) {
  return ds.customers.filter((c) => evaluateRule(rule, c.data, ds.ctx));
}
