import { redirect } from "next/navigation";

// Benutzer moved into Administration (tab «Benutzer») – old links keep working.
export default function UsersPage() {
  redirect("/admin?tab=users");
}
