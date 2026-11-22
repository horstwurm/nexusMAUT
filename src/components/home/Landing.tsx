import Link from "next/link";
import type { HomeStats } from "@/lib/server/home";
import { HomeIcon, type HomeIconName } from "./HomeIcon";
import { StatsStrip } from "./StatsStrip";

// Public homepage (logged out). Keep the texts in step with what the app really
// does (CLAUDE.md describes it) – no promises of features that don't exist yet
// (e.g. steps are marked done by hand, nothing is mailed automatically).
// The illustrations are drawn here with fictional example data – never real customers.

type Feature = { icon: HomeIconName; text: string };
type Area = { id: string; label: string; title: string; lead: string; features: Feature[]; visual: React.ReactNode };

const AREAS: Area[] = [
  {
    id: "kunden",
    label: "Kunden",
    title: "Jeder Kunde mit allem, was zählt",
    lead: "Stammdaten, Produkte, Positionen und Transaktionen an einem Ort – mit Attributen, die Du selbst definierst.",
    features: [
      { icon: "layers", text: "Positionen und Transaktionen pro Produkt- und Dienstleistungstyp, mit eigenen Attributen (Text, Zahl, Datum, Ja/Nein, Auswahlliste)" },
      { icon: "sliders", text: "Kundenattribute wie Anrede, Segment oder Alter – im Kundenformular und überall nutzbar" },
      { icon: "users", text: "Kundenübersicht als Akkordeon: Kunde → Positionen → Transaktionen, alles direkt bearbeitbar" },
      { icon: "bolt", text: "Service-Attribute: Werte, die aus einem anderen System kommen – gespeichert und als «echt» oder «Mock» markiert" },
      { icon: "message", text: "Kommunikationspräferenzen und Produkte pro Kunde" },
    ],
    visual: <CustomerVisual />,
  },
  {
    id: "selektionen",
    label: "Selektionen",
    title: "Die richtige Zielgruppe in Sekunden",
    lead: "Kunden Selektionen finden genau die Kunden, die Du ansprechen willst – über Kundendaten, Positionen und Transaktionen hinweg.",
    features: [
      { icon: "filter", text: "Bedingungen auf Kunde, Positionen und Transaktionen – alle oder mindestens eine erfüllt" },
      { icon: "calendar", text: "Zeiträume, «heute» und Jahrestage – z.B. Geburtstag in den nächsten 14 Tagen" },
      { icon: "coins", text: "Anzahl und Summen über Transaktionen, z.B. Kartenumsatz der letzten 90 Tage ≥ 1'000" },
      { icon: "eye", text: "Treffer prüfen, bevor Du speicherst – mit der Liste der ersten Kunden" },
    ],
    visual: <RuleVisual />,
  },
  {
    id: "journeys",
    label: "Journeys",
    title: "Abläufe mit persönlichem Inhalt",
    lead: "Eine Journey ist eine Folge von Schritten – jede mit einer Aktion und einem Inhalt voller Platzhalter, die für jeden Kunden gefüllt werden.",
    features: [
      { icon: "steps", text: "Schritte in fester Reihenfolge, jeder mit einer Aktion (z.B. Brief, Anruf, Termin)" },
      { icon: "braces", text: "Platzhalter für Kunde, Produkte, Positionen, Transaktionen und Service-Werte – auch Listen mit Summen und Wiederholblöcken" },
      { icon: "check", text: "Schritt testen: der Inhalt, aufbereitet für einen echten Kunden" },
      { icon: "alert", text: "Unbekannte Platzhalter werden markiert, bevor sie jemand sieht" },
    ],
    visual: <JourneyVisual />,
  },
  {
    id: "services",
    label: "Services",
    title: "Daten aus jedem System",
    lead: "Services holen Werte aus Deinen anderen Systemen – vom Kontosaldo bis zur Depotliste – und machen sie in Kundendaten, Selektionen und Inhalten nutzbar.",
    features: [
      { icon: "server", text: "PUT- und GET-Attribute pro Service, Antworten auch als Liste (Tabelle mit Spalten)" },
      { icon: "check", text: "Testen direkt in der Administration, mit der gemappten Antwort" },
      { icon: "dice", text: "Mock-Schalter: Zufallswerte, solange der echte Service noch fehlt" },
      { icon: "refresh", text: "«Daten aktualisieren» holt alle Service-Werte neu – Fehler werden vermerkt, alte Werte bleiben" },
    ],
    visual: <ServiceVisual />,
  },
  {
    id: "kundenjourneys",
    label: "Begleiten",
    title: "Jeden Kunden auf seiner Journey begleiten",
    lead: "Weise eine Journey einer ganzen Kunden Selektion oder einzelnen Kunden zu – und verfolge pro Kunde, wo er steht.",
    features: [
      { icon: "route", text: "Zuweisen per Selektion oder einzeln – wer die Journey schon aktiv hat, wird übersprungen" },
      { icon: "checklist", text: "Fortschritt pro Schritt: erledigt, übersprungen, offen – der Inhalt wird beim Erledigen für den Kunden aufbereitet und gespeichert" },
      { icon: "alert", text: "«Daten prüfen» findet Schritte, denen Daten fehlen – markiert als «Datenfehler»" },
      { icon: "star", text: "Kundenfeedback pro Schritt, mit Kommentar und Bewertung von 1 bis 5" },
    ],
    visual: <RunVisual />,
  },
];

type AuthMode = "nexusIdentity" | "local";

const STEPS = (mode: AuthMode): { title: string; text: string }[] => [
  mode === "local"
    ? { title: "Anmelden", text: "Mit E-Mail und Passwort. Eine Administratorin oder ein Administrator gibt Dir eine Rolle." }
    : { title: "Anmelden", text: "Mit Deinem nexusIdentity-Konto. Eine Administratorin oder ein Administrator gibt Dir eine Rolle." },
  { title: "Daten aufbauen", text: "Kunden mit Positionen und Transaktionen erfassen, Attribute und Services in der Administration einrichten." },
  { title: "Zielgruppe finden", text: "Eine Kunden Selektion definieren und die Treffer prüfen." },
  { title: "Journey starten", text: "Die Journey der Selektion zuweisen und jeden Kunden Schritt für Schritt begleiten." },
];

const BENEFITS: { icon: HomeIconName; title: string; text: string }[] = [
  { icon: "layers", title: "Schlank", text: "Keine monatelange Einführung: Kunden, Selektionen und Journeys – und Du legst los." },
  { icon: "sliders", title: "Dein Datenmodell", text: "Attribute, Wertelisten, Produkt- und Servicetypen – alles in der Administration anpassbar, ohne Code." },
  { icon: "bolt", title: "Daten, wo sie entstehen", text: "Services holen Werte aus Deinen Systemen statt sie abzutippen – mit Mock, bis die Schnittstelle bereit ist." },
  { icon: "users", title: "Klare Rollen", text: "Editoren arbeiten mit Kunden und Journeys, Administratoren richten das Modell ein." },
];

const FAQ = (mode: AuthMode): { q: string; a: string }[] => [
  {
    q: "Wie melde ich mich an?",
    a:
      mode === "local"
        ? "Mit E-Mail und Passwort direkt bei nexusMAUT; Passwörter werden nur als scrypt-Hash gespeichert, ein vergessenes setzt Du per E-Mail-Link neu. Alternativ kann die Administration auf nexusIdentity umstellen, den gemeinsamen Login der nexus-Apps. Die erste Person wird Administrator; alle weiteren warten, bis ein Administrator ihnen eine Rolle gibt."
        : "Über nexusIdentity, den gemeinsamen Login der nexus-Apps (Single Sign-on). Alternativ kann die Administration die eigene Anmeldung mit E-Mail und Passwort einschalten. Die erste Person, die sich anmeldet, wird Administrator; alle weiteren warten, bis ein Administrator ihnen eine Rolle gibt.",
  },
  {
    q: "Wer darf was?",
    a: "Editoren verwalten Kunden, Positionen, Transaktionen, Kunden Selektionen und KundenJourneys. Administratoren richten zusätzlich Attribute, Wertelisten, Aktionen, Services, Journey-Vorlagen und E-Mail ein und vergeben die Rollen. Die Rechte werden bei jeder Anfrage auf dem Server geprüft.",
  },
  {
    q: "Verschickt nexusMAUT selbst E-Mails an Kunden?",
    a: "Nein, noch nicht. Schritte einer KundenJourney werden von Hand als erledigt markiert; dabei wird der Inhalt für den Kunden aufbereitet und gespeichert. Die E-Mail-Einstellungen in der Administration dienen bisher nur dem Test-Versand.",
  },
  {
    q: "Was sind Platzhalter?",
    a: "Stellen im Inhalt eines Schritts wie {{Kunde.Vorname}}, {{Position.konto.Saldo}} oder {{Service.Saldo.Betrag}}, die für jeden Kunden mit seinen Daten gefüllt werden. Listen aus Services lassen sich zählen, summieren oder als Block pro Zeile wiederholen.",
  },
  {
    q: "Was passiert, wenn ein Service nicht erreichbar ist?",
    a: "Gespeicherte Werte bleiben, der Fehler wird beim Datensatz vermerkt und in den Listen angezeigt. Beim Testen siehst Du stattdessen Beispieldaten – klar als solche markiert.",
  },
  {
    q: "Was ist der Mock-Schalter?",
    a: "Ein Schalter pro Service: Ist er an, wird der Service nicht aufgerufen, sondern liefert Zufallswerte passend zu seinen GET-Attributen. So kannst Du Selektionen und Journeys schon ausprobieren, bevor die Schnittstelle steht. Mock-Werte sind überall als «Mock» markiert.",
  },
  {
    q: "Was prüft «Daten prüfen»?",
    a: "Ob für die offenen Schritte aller aktiven KundenJourneys einer Journey alle Daten vorhanden sind: Platzhalter ohne Wert oder Service-Fehler machen den Schritt zum «Datenfehler», mit der genauen Ursache.",
  },
];

const SECURITY = (mode: AuthMode): { icon: HomeIconName; title: string; text: string }[] => [
  mode === "local"
    ? { icon: "key", title: "Eigene Anmeldung", text: "Passwörter nur als scrypt-Hash, Links zum Zurücksetzen einmalig und 60 Minuten gültig, nach 10 Fehlversuchen 15 Minuten Pause." }
    : { icon: "key", title: "Single Sign-on", text: "Anmeldung über nexusIdentity mit OpenID Connect (Authorization Code + PKCE) – hier werden keine Passwörter gespeichert." },
  {
    icon: "user",
    title: "Sichere Sitzungen",
    text:
      mode === "local"
        ? "Ein Cookie, das Skripte nicht lesen können; gespeichert wird nur sein Hash. Ein neues Passwort meldet alle anderen Geräte ab."
        : "Ein Cookie, das Skripte nicht lesen können; gespeichert wird nur sein Hash. Abmelden beendet auch die Sitzung bei nexusIdentity.",
  },
  { icon: "shield", title: "Rechte auf dem Server", text: "Jede Anfrage wird gegen die Rolle geprüft – ein ausgeblendeter Knopf ist nie der einzige Schutz." },
  { icon: "lock", title: "Verschlüsselte Geheimnisse", text: "Das SMTP-Passwort wird mit AES-256-GCM verschlüsselt gespeichert und nie an die Seite geschickt." },
  { icon: "server", title: "Services auf dem Server", text: "Services werden serverseitig aufgerufen; ihre Adressen legen nur Administratoren fest." },
  { icon: "eye", title: "Kein Tracking", text: "Keine Analyse-, Werbe- oder Tracking-Cookies – nur das Anmelde-Cookie." },
];

/** Public homepage for visitors who are not logged in. */
export function Landing({ stats, authMode }: { stats: HomeStats; authMode: AuthMode }) {
  const loginLabel = authMode === "local" ? "Anmelden" : "Anmelden mit nexusIdentity";
  return (
    <div className="hp">
      <header className="hp-top">
        <Link href="/" className="brand">
          <span className="brand-mark">m</span>
          <span>nexusMAUT</span>
        </Link>
        <Link href="/login?return=%2F" className="btn btn-sm">
          Anmelden
        </Link>
      </header>

      <section className="hp-hero hp-wrap">
        <div className="hp-hero-text">
          <p className="hp-eyebrow">nexusMAUT · Marketing Automation</p>
          <h1 className="hp-title hp-title-xl">
            Die richtigen Kunden.
            <br />
            <span className="hp-accent">Im richtigen Moment.</span>
          </h1>
          <p className="hp-lead">
            Finde Zielgruppen über Kundendaten, Positionen und Transaktionen, hole Werte aus Deinen Systemen dazu und begleite jeden Kunden mit
            persönlichen Journeys – Schritt für Schritt.
          </p>
          <div className="hp-actions">
            <Link href="/login?return=%2F" className="btn btn-primary hp-btn">
              {loginLabel}
            </Link>
            <a href="#kunden" className="btn hp-btn">
              Mehr erfahren
            </a>
          </div>
          <nav aria-label="Bereiche" className="hp-anchors">
            {AREAS.map((a, i) => (
              <a key={a.id} href={`#${a.id}`}>
                <span className="hp-tabnum">0{i + 1}</span> {a.label}
              </a>
            ))}
            <a href="#sicherheit">Sicherheit</a>
          </nav>
        </div>
        <HeroVisual />
      </section>

      <div className="hp-wrap">
        <StatsStrip stats={stats} />
      </div>

      {AREAS.map((a, i) => (
        <section key={a.id} id={a.id} aria-labelledby={`${a.id}-title`} className={`hp-area${i % 2 === 0 ? " hp-band" : ""}`}>
          <div className="hp-wrap hp-area-grid">
            <div className="hp-area-text">
              <p className="hp-eyebrow hp-numbered">
                <span className="hp-tabnum">0{i + 1}</span>
                <span className="hp-rule" aria-hidden />
                {a.label}
              </p>
              <h2 id={`${a.id}-title`} className="hp-title hp-title-l">
                {a.title}
              </h2>
              <p className="hp-lead">{a.lead}</p>
              <ul className="hp-features">
                {a.features.map((f) => (
                  <li key={f.text}>
                    <span className="hp-icon">
                      <HomeIcon name={f.icon} />
                    </span>
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="hp-visual" aria-hidden>
              {a.visual}
            </div>
          </div>
        </section>
      ))}

      <section aria-labelledby="steps-title" className="hp-wrap hp-section">
        <h2 id="steps-title" className="hp-title hp-title-l">
          So funktioniert&apos;s
        </h2>
        <ol className="hp-steps">
          {STEPS(authMode).map((s, i) => (
            <li key={s.title}>
              <span className="hp-title hp-step-num">{i + 1}</span>
              <strong>{s.title}</strong>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="benefits-title" className="hp-dark">
        <div className="hp-wrap hp-section">
          <h2 id="benefits-title" className="hp-title hp-title-l">
            Warum nexusMAUT
          </h2>
          <ul className="hp-benefits">
            {BENEFITS.map((b) => (
              <li key={b.title}>
                <HomeIcon name={b.icon} size={26} />
                <strong>{b.title}</strong>
                <p>{b.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="hp-wrap hp-section hp-faq">
        <h2 id="faq-title" className="hp-title hp-title-l">
          Häufige Fragen
        </h2>
        <div>
          {FAQ(authMode).map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <span className="hp-plus" aria-hidden>
                  <HomeIcon name="plus" size={18} />
                </span>
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="sicherheit" aria-labelledby="security-title" className="hp-band">
        <div className="hp-wrap hp-section">
          <h2 id="security-title" className="hp-title hp-title-l">
            Sicherheit und Daten
          </h2>
          <p className="hp-lead" style={{ maxWidth: 720 }}>
            Kundendaten sind vertraulich. Der Zugang läuft {authMode === "local" ? "über die eigene Anmeldung" : "über nexusIdentity"}, Rechte werden auf dem Server geprüft, und die App läuft bei Vercel in
            Frankfurt (EU).
          </p>
          <ul className="hp-security">
            {SECURITY(authMode).map((s) => (
              <li key={s.title}>
                <span className="hp-icon">
                  <HomeIcon name={s.icon} />
                </span>
                <span>
                  <strong>{s.title}</strong>
                  <span className="hp-muted">{s.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="hp-wrap hp-cta">
        <p className="hp-title hp-title-m">Bereit für Deine erste Journey?</p>
        <Link href="/login?return=%2F" className="btn btn-primary hp-btn">
          {loginLabel}
        </Link>
      </section>

      <footer className="hp-footer hp-wrap">
        <span>nexusMAUT · Marketing Automation der nexus-Apps</span>
      </footer>
    </div>
  );
}

// --- illustrations (fictional example data) -------------------------------------------------

/** Eye-catcher: customers → a Kunden Selektion → a journey with steps (decorative). */
function HeroVisual() {
  // a 8×6 grid of customers, the selected ones highlighted
  const picked = new Set([3, 9, 12, 20, 26, 31, 37, 44]);
  const steps = [
    { label: "Begrüssung", done: true },
    { label: "Beratung", done: true },
    { label: "Angebot", done: false },
    { label: "Feedback", done: false },
  ];
  return (
    <figure aria-hidden className="hp-hero-visual">
      <svg viewBox="0 0 560 360" className="hp-svg">
        <defs>
          <linearGradient id="hpflow" x1="0" x2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.05" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {/* customers */}
        <text x="20" y="28" className="hp-svg-label">KUNDEN</text>
        {Array.from({ length: 48 }, (_, i) => {
          const x = 30 + (i % 8) * 22;
          const y = 52 + Math.floor(i / 8) * 22;
          const on = picked.has(i);
          return <circle key={i} cx={x} cy={y} r={on ? 7 : 6} fill={on ? "var(--accent)" : "var(--border)"} className={on ? "hp-pulse" : undefined} style={on ? { animationDelay: `${(i % 5) * 0.4}s` } : undefined} />;
        })}
        {/* selection funnel */}
        <path d="M200 50 L262 92 L262 148 L200 190 Z" fill="url(#hpflow)" />
        <rect x="262" y="96" width="86" height="48" rx="10" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.5" />
        <text x="305" y="116" textAnchor="middle" className="hp-svg-strong">Selektion</text>
        <text x="305" y="133" textAnchor="middle" className="hp-svg-small">8 Treffer</text>
        {/* journey */}
        <path d="M348 120 C 390 120, 380 230, 420 230" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 4" className="hp-dash" />
        <text x="20" y="232" className="hp-svg-label">JOURNEY</text>
        {steps.map((s, i) => {
          const x = 30 + i * 128;
          return (
            <g key={s.label}>
              {i > 0 && <line x1={x - 68} y1="275" x2={x} y2="275" stroke={steps[i - 1].done && s.done ? "var(--accent)" : "var(--border)"} strokeWidth="2" />}
              <rect x={x} y="252" width="60" height="46" rx="10" fill={s.done ? "var(--accent)" : "var(--surface)"} stroke={s.done ? "var(--accent)" : "var(--border)"} strokeWidth="1.5" />
              {s.done ? (
                <path d={`M${x + 21} ${275} l6 6 l12 -12`} fill="none" stroke="var(--accent-text)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <text x={x + 30} y="280" textAnchor="middle" className="hp-svg-strong">{i + 1}</text>
              )}
              <text x={x + 30} y="320" textAnchor="middle" className="hp-svg-small">{s.label}</text>
            </g>
          );
        })}
        {/* service */}
        <rect x="430" y="40" width="110" height="44" rx="10" fill="var(--surface)" stroke="var(--border)" />
        <text x="452" y="67" className="hp-svg-strong">⚡ Service</text>
        <path d="M485 84 C 485 110, 380 100, 348 112" fill="none" stroke="var(--muted)" strokeOpacity="0.6" strokeDasharray="3 4" />
      </svg>
    </figure>
  );
}

function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hp-window">
      <div className="hp-window-bar">
        <span />
        <span />
        <span />
        <em>{title}</em>
      </div>
      <div className="hp-window-body">{children}</div>
    </div>
  );
}

function CustomerVisual() {
  const rows = [
    { name: "Meier", first: "Lea", anrede: "Frau", saldo: "84'250.00", vip: "Ja", mock: false, pos: 3 },
    { name: "Keller", first: "Marco", anrede: "Herr", saldo: "12'900.50", vip: "Nein", mock: false, pos: 2 },
    { name: "Studer", first: "Anna", anrede: "Frau", saldo: "3'120.00", vip: "Ja", mock: true, pos: 1 },
  ];
  return (
    <Window title="Kunden">
      <table className="hp-mini">
        <thead>
          <tr>
            <th />
            <th>Nachname</th>
            <th>Vorname</th>
            <th>Anrede</th>
            <th className="num">Saldo ⚡</th>
            <th>VIP ⚡</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="muted">▸ {r.pos}</td>
              <td>
                <strong>{r.name}</strong>
              </td>
              <td>{r.first}</td>
              <td>{r.anrede}</td>
              <td className="num svc-cell">
                {r.saldo}
                <span className="svc-tag svc-tag-real">echt</span>
              </td>
              <td className={`svc-cell${r.mock ? " svc-mock" : ""}`}>
                {r.vip}
                <span className={`svc-tag ${r.mock ? "svc-tag-mock" : "svc-tag-real"}`}>{r.mock ? "Mock" : "echt"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Window>
  );
}

function RuleVisual() {
  return (
    <Window title="Kunden Selektion · Geburtstag & Vermögen">
      <p className="hp-mini-head">
        Treffer, wenn <b>alle Bedingungen</b> erfüllt sind:
      </p>
      <div className="hp-cond">
        <span className="badge">Kunde</span> Geburtsdatum <b>Jahrestag in den nächsten 14 Tagen</b>
      </div>
      <div className="hp-cond">
        <span className="badge">Position</span> Konto mit Saldo <b>≥ 50&apos;000</b>: Anzahl ≥ 1
      </div>
      <div className="hp-cond">
        <span className="badge">Transaktion</span> Kreditkarte, letzte 90 Tage: Summe Betrag <b>≥ 1&apos;000</b>
      </div>
      <div className="hp-mini-foot">
        <span className="btn btn-sm">Treffer prüfen</span>
        <strong className="hp-accent">12 von 1&apos;240 Kunden</strong>
      </div>
    </Window>
  );
}

function JourneyVisual() {
  return (
    <Window title="Journey · Schritt 1 – Brief">
      <div className="hp-code">
        Grüezi <mark className="ph-filled">{"{{Kunde.Anrede}}"}</mark> <mark className="ph-filled">{"{{Kunde.Nachname}}"}</mark>
        <br />
        <br />
        Ihr Sparkonto weist einen Saldo von <mark className="ph-filled">{"{{Position.sparkonto.Saldo}}"}</mark> aus.
        <br />
        {"{{#Service.Depot.Positionen}}"}
        <br />
        &nbsp;&nbsp;– <mark className="ph-filled">{"{{Name}}"}</mark>: <mark className="ph-filled">{"{{Kurs}}"}</mark>
        <br />
        {"{{/Service.Depot.Positionen}}"}
      </div>
      <p className="hp-mini-head" style={{ marginTop: 10 }}>
        Test für Lea Meier:
      </p>
      <div className="hp-preview">
        Grüezi <mark className="ph-filled">Frau</mark> <mark className="ph-filled">Meier</mark> – Ihr Sparkonto weist einen Saldo von{" "}
        <mark className="ph-filled">84&apos;250.00</mark> aus.
      </div>
    </Window>
  );
}

function ServiceVisual() {
  return (
    <Window title="Service · Saldo">
      <div className="hp-two">
        <div>
          <p className="hp-mini-head">Anfrage (PUT-Attribute)</p>
          <pre className="hp-json">{`{
  "Vorname": "Lea",
  "Nachname": "Meier"
}`}</pre>
        </div>
        <div>
          <p className="hp-mini-head">Antwort → GET-Attribute</p>
          <pre className="hp-json">{`{
  "Saldo": 84250.00,
  "Waehrung": "CHF"
}`}</pre>
        </div>
      </div>
      <div className="hp-mini-foot">
        <span className="badge badge-ok">HTTP 200 · 84 ms</span>
        <label className="switch-field" style={{ margin: 0 }}>
          <input type="checkbox" role="switch" className="switch" readOnly checked={false} tabIndex={-1} />
          <span className="small">Mock</span>
        </label>
      </div>
    </Window>
  );
}

function RunVisual() {
  const runs = [
    { name: "Lea Meier", done: 3, total: 4, status: "aktiv", error: false },
    { name: "Marco Keller", done: 1, total: 4, status: "aktiv", error: true },
    { name: "Anna Studer", done: 4, total: 4, status: "abgeschlossen", error: false },
  ];
  return (
    <Window title="KundenJourneys · Onboarding">
      <table className="hp-mini">
        <thead>
          <tr>
            <th>Kunde</th>
            <th>Fortschritt</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.name}>
              <td>
                <strong>{r.name}</strong>
              </td>
              <td style={{ minWidth: 120 }}>
                <div className="small">
                  {r.done} / {r.total}
                </div>
                <div className="progress">
                  <div style={{ width: `${(r.done / r.total) * 100}%` }} />
                </div>
              </td>
              <td>
                <span className={`badge ${r.status === "aktiv" ? "badge-accent" : "badge-ok"}`}>{r.status}</span>
                {r.error && <span className="badge badge-danger" style={{ marginLeft: 4 }}>Datenfehler 1</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hp-feedback">
        <span className="rating">★★★★★</span> «Sehr hilfreiche Beratung» – Lea Meier
      </div>
    </Window>
  );
}
