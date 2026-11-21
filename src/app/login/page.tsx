import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/Notice";
import { currentUser } from "@/lib/server/auth";
import { safeReturn } from "@/lib/urls";

export const metadata: Metadata = { title: "Anmelden" };

const ERRORS: Record<string, string> = {
  state: "Die Anmeldung ist abgelaufen oder wurde in einem anderen Fenster gestartet. Bitte nochmals versuchen.",
  access_denied: "Die Anmeldung wurde abgebrochen.",
  email: "nexusIdentity hat keine E-Mail-Adresse geliefert.",
  issuer: "Unerwarteter Anmeldedienst.",
  token: "Die Anmeldung konnte nicht abgeschlossen werden.",
  provider: "Die Anmeldung bei nexusIdentity ist fehlgeschlagen.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const returnTo = safeReturn(params.return);
  const user = await currentUser();
  if (user) redirect(user.role === "pending" ? "/pending" : returnTo);
  const error = params.error ? (ERRORS[params.error] ?? ERRORS.provider) : null;
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <div className="brand" style={{ justifyContent: "center", marginBottom: 10 }}>
            <span className="brand-mark">m</span>
            <span>nexusMAUT</span>
          </div>
          <div className="sub">Marketing-Automation</div>
        </div>
        <Notice kind="error">{error}</Notice>
        <a className="btn btn-primary btn-block" href={`/auth/login?return=${encodeURIComponent(returnTo)}`}>
          Mit nexusIdentity anmelden
        </a>
        <p className="auth-foot">Ein Konto für alle nexus-Anwendungen.</p>
      </div>
    </main>
  );
}
