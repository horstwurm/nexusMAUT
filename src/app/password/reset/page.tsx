import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/AuthShell";
import { ResetPasswordForm } from "@/components/AuthForms";
import { authMode } from "@/lib/server/authSettings";

export const metadata: Metadata = { title: "Passwort festlegen", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await connection(); // reads the login mode from the DB: never prerender
  if ((await authMode()) !== "local") redirect("/login");
  const { token = "" } = await searchParams;
  return (
    <AuthShell sub="Neues Passwort festlegen">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
