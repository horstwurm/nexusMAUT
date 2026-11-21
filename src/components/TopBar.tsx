import Link from "next/link";
import type { Me } from "@/lib/types";
import { LogoutButton } from "./LogoutButton";

export type Section = "customers" | "rules" | "journeys" | "customerJourneys" | "admin";

const LINKS: { href: string; label: string; section: Section; admin?: boolean }[] = [
  { href: "/customers", label: "Kunden", section: "customers" },
  { href: "/rules", label: "Kunden Selektionen", section: "rules" },
  { href: "/journeys", label: "Journeys", section: "journeys", admin: true },
  { href: "/customer-journeys", label: "KundenJourneys", section: "customerJourneys" },
  { href: "/admin", label: "Administration", section: "admin", admin: true },
];

/** Header of the logged-in pages. */
export function TopBar({ me, active }: { me: Me; active: Section }) {
  return (
    <header className="topbar">
      <Link href="/customers" className="brand">
        <span className="brand-mark">m</span>
        <span>nexusMAUT</span>
      </Link>
      <nav>
        {LINKS.filter((l) => !l.admin || me.role === "admin").map((l) => (
          <Link key={l.href} href={l.href} className={active === l.section ? "active" : ""}>
            {l.label}
          </Link>
        ))}
        <span className="small muted" title={me.email} style={{ padding: "0 6px" }}>
          {me.name}
        </span>
        <LogoutButton />
      </nav>
    </header>
  );
}
