import type { Metadata } from "next";
import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { requirePageUser, toMe } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { listJourneys } from "@/lib/server/journeys";
import { loadRuleDataset, matchingCustomers } from "@/lib/server/rules";
import { CustomerJourneysClient } from "./CustomerJourneysClient";

export const metadata: Metadata = { title: "KundenJourneys" };

// Journeys assigned to customers and their progress (editors and admins).
export default async function CustomerJourneysPage() {
  await connection();
  const user = await requirePageUser("/customer-journeys");
  const { rules } = await collections();
  const [journeys, ruleList, ds] = await Promise.all([
    listJourneys(),
    rules.find({}, { collation: { locale: "de" } }).sort({ name: 1 }).toArray(),
    loadRuleDataset(),
  ]);
  return (
    <>
      <TopBar me={toMe(user)} active="customerJourneys" />
      <main className="page page-wide">
        <div className="page-head">
          <div>
            <h1>KundenJourneys</h1>
            <p className="muted" style={{ margin: 0 }}>
              Journeys, die Kunden durchlaufen – zuweisen über eine Kunden Selektion oder einzeln, Fortschritt pro Schritt.
            </p>
          </div>
        </div>
        <CustomerJourneysClient
          journeys={journeys.map((j) => ({ id: j.id, name: j.name, stepCount: j.stepCount }))}
          rules={ruleList.map((r) => ({ id: r._id.toHexString(), name: r.name, matchCount: matchingCustomers(r, ds).length }))}
        />
      </main>
    </>
  );
}
