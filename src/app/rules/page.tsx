import type { Metadata } from "next";
import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { requirePageUser, toMe } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { customerAttributeDefs } from "@/lib/server/customers";
import { attributesByType, domainValues, toDomainValue } from "@/lib/server/domains";
import { loadRuleDataset, matchingCustomers, toRuleView } from "@/lib/server/rules";
import { RulesClient } from "./RulesClient";

export const metadata: Metadata = { title: "Kunden Selektionen" };

export default async function RulesPage() {
  await connection();
  const user = await requirePageUser("/rules");
  const { rules } = await collections();
  const types = await domainValues("productServiceType");
  const [list, ds, positionAttrs, trxAttrs, customerAttrs] = await Promise.all([
    rules.find({}, { collation: { locale: "de" } }).sort({ name: 1 }).toArray(),
    loadRuleDataset(),
    attributesByType(types, "position"),
    attributesByType(types, "trx"),
    customerAttributeDefs(),
  ]);
  return (
    <>
      <TopBar me={toMe(user)} active="rules" />
      <main className="page page-wide">
        <RulesClient
          initial={list.map((r) => toRuleView(r, matchingCustomers(r, ds).length))}
          customerTotal={ds.customers.length}
          types={types.map((t) => toDomainValue(t))}
          positionAttributes={positionAttrs}
          trxAttributes={trxAttrs}
          customerAttributes={customerAttrs}
        />
      </main>
    </>
  );
}
