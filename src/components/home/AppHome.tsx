import Link from "next/link";
import type { Today } from "@/lib/server/home";
import type { Me } from "@/lib/types";
import { HomeIcon, type HomeIconName } from "./HomeIcon";

type Tile = { href: string; icon: HomeIconName; title: string; text: string; badge?: number; badgeAlert?: boolean; primary?: boolean };

const greeting = () => {
  const h = Number(new Date().toLocaleString("de-CH", { hour: "numeric", hour12: false, timeZone: "Europe/Zurich" }));
  return h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
};

/** Start page of a logged-in user: greeting, the «Heute» panel and one tile per area. */
export function AppHome({ me, today }: { me: Me; today: Today }) {
  const admin = me.role === "admin";
  const tiles: Tile[] = [
    { href: "/customers", icon: "users", title: "Kunden", text: "Kunden mit Positionen und Transaktionen", primary: true },
    { href: "/rules", icon: "filter", title: "Kunden Selektionen", text: "Zielgruppen über Kunde, Positionen und Transaktionen" },
    {
      href: "/customer-journeys",
      icon: "route",
      title: "KundenJourneys",
      text: "Journeys zuweisen und Kunden begleiten",
      badge: today.dataErrors || today.openSteps,
      badgeAlert: today.dataErrors > 0,
    },
    ...(admin
      ? ([
          { href: "/journeys", icon: "steps", title: "Journeys", text: "Vorlagen: Schritte mit Aktionen und Inhalten" },
          { href: "/admin?tab=services", icon: "server", title: "Services", text: "Schnittstellen, Attribute, Testen und Mock" },
          { href: "/admin", icon: "settings", title: "Administration", text: "Attribute, Wertelisten, Aktionen, Benutzer, E-Mail" },
        ] satisfies Tile[])
      : []),
  ];
  return (
    <div className="hp-app">
      <div>
        <p className="hp-eyebrow">nexusMAUT</p>
        <h1 className="hp-title hp-title-l" style={{ margin: "4px 0 0" }}>
          {greeting()} {me.name.split(" ")[0]}
        </h1>
      </div>

      <TodayPanel today={today} />

      {/* hairlines per tile (grid draws top / left, each tile right / bottom) so a short last row stays blank */}
      <nav aria-label="Bereiche" className="hp-tiles">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className={`hp-tile${t.primary ? " hp-tile-primary" : ""}`}>
            <span className="hp-tile-top">
              <HomeIcon name={t.icon} size={26} />
              {t.badge ? (
                <span className={`hp-tile-badge${t.badgeAlert ? " alert" : ""}`} title={t.badgeAlert ? "Offene Schritte mit Datenfehler" : "Offene Schritte"}>
                  {t.badge}
                </span>
              ) : null}
            </span>
            <span>
              <strong className="hp-tile-title">
                {t.title}
                <span className="hp-tile-arrow">
                  <HomeIcon name="arrow" size={16} />
                </span>
              </strong>
              <small>{t.text}</small>
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** What needs attention in the KundenJourneys: counters and the most urgent runs. */
function TodayPanel({ today }: { today: Today }) {
  const stats: [string, number, boolean][] = [
    ["Aktive KundenJourneys", today.activeRuns, false],
    ["Offene Schritte", today.openSteps, false],
    ["Schritte mit Datenfehler", today.dataErrors, today.dataErrors > 0],
    ["Service-Abrufe mit Fehler", today.serviceErrors, today.serviceErrors > 0],
  ];
  return (
    <section aria-labelledby="today-title" className="hp-today">
      <div className="hp-today-head">
        <h2 id="today-title" className="hp-eyebrow" style={{ color: "var(--text)" }}>
          Heute – was ansteht
        </h2>
        <Link href="/customer-journeys" className="hp-eyebrow hp-link">
          Zu den KundenJourneys <HomeIcon name="arrow" size={14} />
        </Link>
      </div>
      <div className="hp-today-stats">
        {stats.map(([label, value, alert]) => (
          <div key={label}>
            <div className={`hp-title hp-num${alert ? " hp-alert" : ""}`}>{value.toLocaleString("de-CH")}</div>
            <div className="hp-eyebrow">{label}</div>
          </div>
        ))}
      </div>
      {today.items.length === 0 ? (
        <p className="hp-today-empty">
          {today.activeRuns ? "Alle Schritte der aktiven KundenJourneys sind erledigt." : "Keine aktiven KundenJourneys – weise eine Journey einer Kunden Selektion zu."}
        </p>
      ) : (
        <ul className="hp-today-list">
          {today.items.map((i) => (
            <li key={i.key}>
              <span className={`hp-dot${i.urgent ? " alert" : ""}`} aria-hidden />
              <span>
                <Link href={`/customer-journeys?journey=${i.journeyId}`}>
                  <strong>{i.customerName}</strong> · {i.journeyName}
                </Link>
                <span className="hp-muted-inline"> – {i.text}</span>
              </span>
            </li>
          ))}
          {today.more > 0 && <li className="hp-muted-inline">und {today.more} weitere KundenJourneys mit offenen Schritten</li>}
        </ul>
      )}
    </section>
  );
}
