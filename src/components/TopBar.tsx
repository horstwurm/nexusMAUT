import Link from "next/link";
import type { Me } from "@/lib/types";
import { LogoutButton } from "./LogoutButton";

export type Section = "home" | "customers" | "rules" | "journeys" | "customerJourneys" | "admin" | "account";

const LINKS: { href: string; label: string; section: Section; admin?: boolean }[] = [
  { href: "/customers", label: "Kunden", section: "customers" },
  { href: "/rules", label: "Kunden Selektionen", section: "rules" },
  { href: "/journeys", label: "Journeys", section: "journeys", admin: true },
  { href: "/customer-journeys", label: "Kunden Journeys", section: "customerJourneys" },
  { href: "/admin", label: "Administration", section: "admin", admin: true },
];

/** Header of the logged-in pages. */
export function TopBar({ me, active }: { me: Me; active: Section }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand" title="Startseite">
        <span className="brand-mark">m</span>
        <span>nexusMAUT</span>
      </Link>
      <nav>
        {LINKS.filter((l) => !l.admin || me.role === "admin").map((l) => (
          <Link key={l.href} href={l.href} className={active === l.section ? "active" : ""}>
            {l.label}
          </Link>
        ))}
        <Link href="/account" className={`small${active === "account" ? " active" : ""}`} title={`${me.email} – Mein Konto`}>
          {me.name}
        </Link>
        <LogoutButton />
      </nav>
    </header>
  );
}
