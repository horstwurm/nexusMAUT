import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PasswordForm, ProfileForm } from "@/components/AuthForms";
import { TopBar } from "@/components/TopBar";
import { currentUser, toMe } from "@/lib/server/auth";
import { authMode } from "@/lib/server/authSettings";

export const metadata: Metadata = { title: "Mein Konto" };

export default async function AccountPage() {
  await connection();
  const user = await currentUser();
  if (!user) redirect("/login?return=%2Faccount");
  if (user.role === "pending") redirect("/pending");
  const mode = await authMode();
  // older accounts only have a display name: first word = first name
  const [first, ...rest] = user.name.trim().split(/\s+/);
  const firstname = user.firstname ?? first ?? "";
  const lastname = user.lastname ?? rest.join(" ");
  const viaIdentity = !user._id.startsWith("local_") || Boolean(user.oidcSub);
  return (
    <>
      <TopBar me={toMe(user)} active="account" />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Mein Konto</h1>
            <p className="muted" style={{ margin: 0 }}>
              {user.email} · Anmeldung derzeit {mode === "local" ? "mit E-Mail und Passwort" : "über nexusIdentity"}
            </p>
          </div>
        </div>
        <div className="grid2" style={{ alignItems: "start" }}>
          <section className="card">
            <h2>Name</h2>
            <p className="small muted">
              {viaIdentity && mode === "nexusIdentity"
                ? "Bei der nächsten Anmeldung über nexusIdentity wird der Name von dort übernommen."
                : "So erscheinst Du in nexusMAUT."}
            </p>
            <ProfileForm firstname={firstname} lastname={lastname} />
          </section>
          <section className="card">
            <h2>Passwort</h2>
            <p className="small muted">
              {user.passwordHash
                ? "Für die eigene Anmeldung mit E-Mail und Passwort."
                : "Noch kein Passwort. Lege eines fest, um Dich auch mit der eigenen Anmeldung (E-Mail und Passwort) anmelden zu können."}
            </p>
            <PasswordForm hasPassword={Boolean(user.passwordHash)} />
          </section>
        </div>
      </main>
    </>
  );
}
