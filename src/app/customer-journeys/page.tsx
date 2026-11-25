import type { Metadata } from "next";
import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { requirePageUser, toMe } from "@/lib/server/auth";
import { journeyRunCounts } from "@/lib/server/customerJourneys";
import { collections } from "@/lib/server/db";
import { listEvents } from "@/lib/server/events";
import { listJourneys } from "@/lib/server/journeys";
import { loadRuleDataset, matchingCustomers } from "@/lib/server/rules";
import { CustomerJourneysClient } from "./CustomerJourneysClient";

export const metadata: Metadata = { title: "Kunden Journeys" };

// Journeys assigned to customers and their progress (editors and admins):
// the journeys on the left in two panels (Kampagne / Event), the selected one (?journey=ID) on the right –
// an Event journey with its events (trigger service, last call) above its runs.
export default async function CustomerJourneysPage({ searchParams }: { searchParams: Promise<{ journey?: string; event?: string }> }) {
  await connection();
  const user = await requirePageUser("/customer-journeys");
  const { journey, event } = await searchParams;
  const { rules } = await collections();
  const [journeys, ruleList, counts, events] = await Promise.all([
    listJourneys(),
    rules.find({}, { collation: { locale: "de" } }).sort({ name: 1 }).toArray(),
    journeyRunCounts(),
    listEvents(),
  ]);
  const ds = await loadRuleDataset();
  // ?journey=ID, or ?event=ID (older links) → the event's journey; else the first campaign
  const eventJourney = event ? events.find((e) => e.id === event)?.journeyId : undefined;
  const wanted = journey ?? eventJourney;
  const initialJourney =
    wanted && journeys.some((j) => j.id === wanted) ? wanted : (journeys.find((j) => j.journeyType === "campaign") ?? journeys[0])?.id ?? null;
  return (
    <>
      <TopBar me={toMe(user)} active="customerJourneys" />
      <main className="page page-full">
        <CustomerJourneysClient
          journeys={journeys.map((j) => ({ id: j.id, name: j.name, description: j.description, stepCount: j.stepCount, journeyType: j.journeyType }))}
          rules={ruleList.map((r) => ({ id: r._id.toHexString(), name: r.name, matchCount: matchingCustomers(r, ds).length }))}
          initialCounts={counts}
          events={events}
          initialJourneyId={initialJourney}
        />
      </main>
    </>
  );
}
