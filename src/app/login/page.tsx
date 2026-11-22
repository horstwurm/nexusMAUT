import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/AuthForms";
import { Notice } from "@/components/Notice";
import { currentUser } from "@/lib/server/auth";
import { authSettings } from "@/lib/server/authSettings";
import { safeReturn } from "@/lib/urls";

export const metadata: Metadata = { title: "Anmelden" };

const ERRORS: Record<string, string> = {
  state: "Die Anmeldung ist abgelaufen oder wurde in einem anderen Fenster gestartet. Bitte nochmals versuchen.",
  access_denied: "Die Anmeldung wurde abgebrochen.",
  email: "nexusIdentity hat keine E-Mail-Adresse geliefert.",
  issuer: "Unerwarteter Anmeldedienst.",
  token: "Die Anmeldung konnte nicht abgeschlossen werden.",
  provider: "Die Anmeldung bei nexusIdentity ist fehlgeschlagen.",
  mode: "Die Anmeldung über nexusIdentity ist ausgeschaltet – bitte mit E-Mail und Passwort anmelden.",
};

// Admin → Anmeldung decides: the button to nexusIdentity or the own login form.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const returnTo = safeReturn(params.return);
  const user = await currentUser();
  if (user) redirect(user.role === "pending" ? "/pending" : returnTo);
  const { mode, allowRegistration } = await authSettings();
  const error = params.error ? (ERRORS[params.error] ?? ERRORS.provider) : null;
  if (mode === "local") {
    return (
      <AuthShell sub="Marketing-Automation – Anmelden">
        <Notice kind="error">{error}</Notice>
        <LoginForm returnTo={returnTo} allowRegistration={allowRegistration} />
      </AuthShell>
    );
  }
  return (
    <AuthShell sub="Marketing-Automation" foot="Ein Konto für alle nexus-Anwendungen.">
      <Notice kind="error">{error}</Notice>
      <a className="btn btn-primary btn-block" href={`/auth/login?return=${encodeURIComponent(returnTo)}`}>
        Mit nexusIdentity anmelden
      </a>
    </AuthShell>
  );
}
