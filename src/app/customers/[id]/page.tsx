import type { Metadata } from "next";
import { ObjectId } from "mongodb";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { requirePageUser, toMe } from "@/lib/server/auth";
import { customerAttributeDefs, toCustomer, toCustomerComPref, toCustomerPositions, toCustomerProduct } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { attributesByType, domainValues, toDomainValue } from "@/lib/server/domains";
import { CustomerDetail } from "./CustomerDetail";

export const metadata: Metadata = { title: "Kunde" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const user = await requirePageUser(`/customers/${id}`);
  if (!ObjectId.isValid(id)) notFound();
  const { customers, customerProducts, customerComPrefs, customerPositions } = await collections();
  const customer = await customers.findOne({ _id: new ObjectId(id) });
  if (!customer) notFound();
  const [products, comPrefs, types, prefTypes, positions] = await Promise.all([
    customerProducts.find({ customerId: customer._id }, { collation: { locale: "de" } }).sort({ name: 1 }).toArray(),
    customerComPrefs.find({ customerId: customer._id }).sort({ createdAt: 1 }).toArray(),
    domainValues("productServiceType"),
    domainValues("comPrefs"),
    customerPositions.find({ customerId: customer._id }).sort({ sort: 1, createdAt: 1 }).toArray(),
  ]);
  const [positionAttrs, trxAttrs, positionList, customerAttrs] = await Promise.all([
    attributesByType(types, "position"),
    attributesByType(types, "trx"),
    toCustomerPositions(positions),
    customerAttributeDefs(),
  ]);
  return (
    <>
      <TopBar me={toMe(user)} active="customers" />
      <main className="page page-wide">
        <CustomerDetail
          isAdmin={user.role === "admin"}
          customer={toCustomer(customer)}
          initialProducts={products.map(toCustomerProduct)}
          initialComPrefs={comPrefs.map(toCustomerComPref)}
          productTypes={types.map((v) => toDomainValue(v))}
          comPrefTypes={prefTypes.map((v) => toDomainValue(v))}
          attributesByType={positionAttrs}
          trxAttributesByType={trxAttrs}
          customerAttributes={customerAttrs}
          initialPositions={positionList}
        />
      </main>
    </>
  );
}
