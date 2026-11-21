import type { Metadata } from "next";
import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { requirePageUser, toMe } from "@/lib/server/auth";
import { listJourneys } from "@/lib/server/journeys";
import { JourneysClient } from "./JourneysClient";

export const metadata: Metadata = { title: "Journeys" };

// Journeys with their steps (actions + content with placeholders) – admins,
// like the journey API (formerly a tab in Administration).
export default async function JourneysPage() {
  await connection();
  const user = await requirePageUser("/journeys", "admin");
  const journeys = await listJourneys();
  return (
    <>
      <TopBar me={toMe(user)} active="journeys" />
      <main className="page page-wide">
        <div className="page-head">
          <div>
            <h1>Journeys</h1>
            <p className="muted" style={{ margin: 0 }}>
              Abläufe aus Schritten – je eine Aktion mit Inhalt und Platzhaltern, pro Kunde testbar.
            </p>
          </div>
        </div>
        <JourneysClient initial={journeys} />
      </main>
    </>
  );
}
