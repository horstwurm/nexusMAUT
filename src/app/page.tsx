import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/server/auth";

// The start page is the customer list (the former «Übersicht» was removed).
export default async function HomePage() {
  await requirePageUser("/");
  redirect("/customers");
}
