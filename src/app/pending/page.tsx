import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { currentUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Freischaltung ausstehend" };

export default async function PendingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "pending") redirect("/");
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <h1>Fast geschafft</h1>
          <div className="sub">Angemeldet als {user.email}</div>
        </div>
        <p>
          Dein Konto ist noch nicht für nexusMAUT freigeschaltet. Eine Administratorin oder ein Administrator muss Dir
          zuerst eine Rolle geben – danach diese Seite neu laden.
        </p>
        <div className="actions">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
