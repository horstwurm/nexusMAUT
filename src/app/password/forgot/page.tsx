import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { ForgotPasswordForm } from "@/components/AuthForms";
import { authMode } from "@/lib/server/authSettings";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default async function ForgotPasswordPage() {
  if ((await authMode()) !== "local") redirect("/login");
  return (
    <AuthShell sub="Passwort vergessen – wir senden Dir einen Link, mit dem Du ein neues festlegst.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
