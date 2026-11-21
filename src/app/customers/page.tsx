import type { Metadata } from "next";
import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { requirePageUser, toMe } from "@/lib/server/auth";
import { customerAttributeDefs } from "@/lib/server/customers";
import { attributesByType, domainValues, toDomainValue } from "@/lib/server/domains";
import { CustomersClient } from "./CustomersClient";

export const metadata: Metadata = { title: "Kunden" };

export default async function CustomersPage() {
  await connection();
  const user = await requirePageUser("/customers");
  // for the positions / transactions accordion and «+ Position» in the list
  const types = await domainValues("productServiceType");
  const [positionAttrs, trxAttrs, customerAttrs] = await Promise.all([
    attributesByType(types, "position"),
    attributesByType(types, "trx"),
    customerAttributeDefs(),
  ]);
  return (
    <>
      <TopBar me={toMe(user)} active="customers" />
      <main className="page page-wide">
        <CustomersClient
          types={types.map((t) => toDomainValue(t))}
          attributesByType={positionAttrs}
          trxAttributesByType={trxAttrs}
          customerAttributes={customerAttrs}
          isAdmin={user.role === "admin"}
        />
      </main>
    </>
  );
}
