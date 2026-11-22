import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AppHome } from "@/components/home/AppHome";
import { Landing } from "@/components/home/Landing";
import { TopBar } from "@/components/TopBar";
import { currentUser, toMe } from "@/lib/server/auth";
import { authMode } from "@/lib/server/authSettings";
import { homeStats, today } from "@/lib/server/home";

// Logged out: the public homepage. Logged in: the start page (greeting, «Heute», tiles).
export default async function HomePage() {
  await connection();
  const user = await currentUser();
  if (!user) return <Landing stats={await homeStats()} authMode={await authMode()} />;
  if (user.role === "pending") redirect("/pending");
  return (
    <>
      <TopBar me={toMe(user)} active="home" />
      <main className="page">
        <AppHome me={toMe(user)} today={await today()} />
      </main>
    </>
  );
}
