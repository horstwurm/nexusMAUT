import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/server/auth";
import { authSettings } from "@/lib/server/authSettings";
import { safeReturn } from "@/lib/urls";

export const metadata: Metadata = { title: "Konto erstellen" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const returnTo = safeReturn((await searchParams).return);
  if (await currentUser()) redirect(returnTo);
  const { mode, allowRegistration } = await authSettings();
  if (mode !== "local" || !allowRegistration) redirect("/login");
  return (
    <AuthShell sub="Konto erstellen" foot="Ein Admin schaltet Dein Konto anschliessend frei.">
      <RegisterForm returnTo={returnTo} />
    </AuthShell>
  );
}
