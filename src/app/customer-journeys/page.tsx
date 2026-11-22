import type { Metadata } from "next";
import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { requirePageUser, toMe } from "@/lib/server/auth";
import { journeyRunCounts } from "@/lib/server/customerJourneys";
import { collections } from "@/lib/server/db";
import { listJourneys } from "@/lib/server/journeys";
import { loadRuleDataset, matchingCustomers } from "@/lib/server/rules";
import { CustomerJourneysClient } from "./CustomerJourneysClient";

export const metadata: Metadata = { title: "KundenJourneys" };

// Journeys assigned to customers and their progress (editors and admins):
// the journeys on the left, the selected one (?journey=ID) on the right.
export default async function CustomerJourneysPage({ searchParams }: { searchParams: Promise<{ journey?: string }> }) {
  await connection();
  const user = await requirePageUser("/customer-journeys");
  const { journey } = await searchParams;
  const { rules } = await collections();
  const [journeys, ruleList, counts] = await Promise.all([
    listJourneys(),
    rules.find({}, { collation: { locale: "de" } }).sort({ name: 1 }).toArray(),
    journeyRunCounts(),
  ]);
  const ds = await loadRuleDataset();
  return (
    <>
      <TopBar me={toMe(user)} active="customerJourneys" />
      <main className="page page-full">
        <CustomerJourneysClient
          journeys={journeys.map((j) => ({ id: j.id, name: j.name, description: j.description, stepCount: j.stepCount }))}
          rules={ruleList.map((r) => ({ id: r._id.toHexString(), name: r.name, matchCount: matchingCustomers(r, ds).length }))}
          initialCounts={counts}
          initialJourneyId={journey && journeys.some((j) => j.id === journey) ? journey : (journeys[0]?.id ?? null)}
        />
      </main>
    </>
  );
}
