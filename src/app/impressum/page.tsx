import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Impressum und Datenschutz" };

// Publisher – shown in the Impressum and as the controller in the privacy policy
// (same publisher as nexusEAM, nexusAd and nexusPPM).
const PRODUCT = "nexusMAUT";
const OWNER = "Horst Wurm";
const STREET = "Bruggmühle 13";
const CITY = "9220 Bischofszell";
const COUNTRY = "Schweiz";
const EMAIL = "horst.wurm@bluewin.ch";
const LAST_UPDATED = "November 2026";

// Service providers that process personal data – keep in step with the hosting (Vercel fra1,
// MongoDB Atlas Frankfurt) and the SMTP provider in production (NODE_MAILER_* / Admin → E-Mail).
const PROCESSORS = [
  { name: "Vercel Inc.", purpose: "Betrieb der Anwendung, Server-Logs", location: "Frankfurt (EU)" },
  { name: "MongoDB Inc. (MongoDB Atlas)", purpose: "Datenbank", location: "Frankfurt (EU)" },
  { name: "Brevo (Sendinblue SAS)", purpose: "Versand von E-Mails (Links zum Festlegen des Passworts, Testmails)", location: "EU" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="legal-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

const Mail = () => <a href={`mailto:${EMAIL}`}>{EMAIL}</a>;

// Public page: Impressum and privacy policy (Datenschutzerklärung), linked from the footer
// of every page («Impressum» → /impressum, «Datenschutz» → /impressum#datenschutz).
export default function ImpressumPage() {
  return (
    <main className="page legal">
      <p className="small">
        <Link href="/">← nexusMAUT</Link>
      </p>

      {/* ---- Impressum ---- */}
      <header>
        <p className="legal-eyebrow">Rechtliches</p>
        <h1>Impressum</h1>
      </header>

      <Section title="Kontakt">
        <p>
          <strong>{PRODUCT}</strong>
          <br />
          {OWNER}
          <br />
          {STREET}
          <br />
          {CITY}
          <br />
          {COUNTRY}
        </p>
        <p>
          E-Mail: <Mail />
        </p>
      </Section>

      <Section title="Geltungsbereich">
        <p>
          Dieses Impressum und die Datenschutzerklärung gelten für die Website und die Anwendung {PRODUCT}. Für die Inhalte, die
          Benutzerinnen und Benutzer erfassen – Kunden, Kunden Selektionen, Journeys, Inhalte, Feedbacks –, sind diese bzw. die
          Organisation verantwortlich, für die sie {PRODUCT} einsetzen.
        </p>
      </Section>

      <Section title="Haftungsausschluss">
        <p>
          Die Inhalte dieser Website werden mit grösster Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität
          der Inhalte – auch der berechneten Selektionen, aufbereiteten Inhalte und von Services gelieferten Werte – wird jedoch
          keine Gewähr übernommen. Haftungsansprüche wegen Schäden materieller oder immaterieller Art, die aus dem Zugriff auf die
          veröffentlichten Informationen, aus Missbrauch der Verbindung oder aus technischen Störungen entstehen, sind im
          gesetzlich zulässigen Rahmen ausgeschlossen.
        </p>
        <p>
          Alle Angebote sind unverbindlich. Wir behalten uns vor, Teile der Seiten oder das gesamte Angebot ohne gesonderte
          Ankündigung zu verändern, zu ergänzen, zu löschen oder die Veröffentlichung zeitweise oder endgültig einzustellen.
        </p>
      </Section>

      <Section title="Haftung für Links und angebundene Systeme">
        <p>
          Verweise und Links auf Websites Dritter sowie die von Administratoren hinterlegten Services und Aktionen (deren URLs)
          liegen ausserhalb unseres Verantwortungsbereichs. Für deren Inhalte und Datenverarbeitung sind ausschliesslich deren
          Betreiber verantwortlich.
        </p>
      </Section>

      <Section title="Urheberrechte">
        <p>
          Die Urheber- und alle anderen Rechte an Inhalten, Bildern, Texten und der Software dieser Website gehören ausschliesslich{" "}
          {PRODUCT} oder den speziell genannten Rechteinhabern. Für die Reproduktion jeglicher Elemente ist die schriftliche
          Zustimmung der Rechteinhaber im Voraus einzuholen. Von Benutzern erfasste Daten bleiben im Eigentum der jeweiligen
          Organisation.
        </p>
      </Section>

      {/* ---- Datenschutzerklärung ---- */}
      <header id="datenschutz" className="legal-break">
        <p className="legal-eyebrow">Datenschutz</p>
        <h2>Datenschutzerklärung</h2>
      </header>

      <Section title="Verantwortlicher">
        <p>
          Verantwortlich für die Bearbeitung von Personendaten auf dieser Website ist {PRODUCT}, {OWNER}, {STREET}, {CITY},{" "}
          {COUNTRY}, E-Mail: <Mail />. Kundendaten, die eine Organisation in {PRODUCT} erfasst, bearbeiten wir in deren Auftrag; für
          diese Daten ist die Organisation verantwortlich.
        </p>
      </Section>

      <Section title="Rechtsgrundlagen">
        <p>
          Wir bearbeiten Personendaten nach dem schweizerischen Datenschutzgesetz (DSG) und, soweit anwendbar, nach der
          Datenschutz-Grundverordnung der EU (DSGVO). Rechtsgrundlagen sind die Erfüllung des Vertrags über die Nutzung von{" "}
          {PRODUCT} (Art. 6 Abs. 1 lit. b DSGVO), unser berechtigtes Interesse an einem sicheren und stabilen Betrieb (Art. 6 Abs.
          1 lit. f DSGVO) sowie gesetzliche Pflichten.
        </p>
      </Section>

      <Section title="Welche Daten wir bearbeiten">
        <ul>
          <li>
            <strong>Benutzerkonto:</strong> Vor- und Nachname, E-Mail-Adresse, Rolle (Redaktion, Admin oder ohne Zugang) und
            Zeitpunkt der letzten Anmeldung. Bei der eigenen Anmeldung zusätzlich das Passwort – nur als scrypt-Hash, nie im
            Klartext. Bei der Anmeldung über nexusIdentity die dortige Benutzerkennung, Name und E-Mail-Adresse.
          </li>
          <li>
            <strong>Kundendaten:</strong> was die nutzende Organisation über ihre Kunden erfasst – Name, Geburtsdatum,
            Kundenattribute, Produkte, Positionen, Transaktionen, Kommunikationspräferenzen, KundenJourneys mit den aufbereiteten
            Inhalten und die Feedbacks der Kunden.
          </li>
          <li>
            <strong>Sitzungen:</strong> pro Anmeldung eine Sitzung mit Ablaufdatum; gespeichert wird nur ein Hash des
            Cookie-Schlüssels. Fehlgeschlagene Anmeldungen werden 15 Minuten mit der E-Mail-Adresse vermerkt (Schutz vor
            Passwort-Raten).
          </li>
          <li>
            <strong>API-Schlüssel:</strong> von Aktionen nur als Hash, mit Erstellungs- und letztem Verwendungszeitpunkt.
          </li>
          <li>
            <strong>Server-Logs:</strong> IP-Adresse, Zeitpunkt, aufgerufene Seite und Browser, die der Hosting-Anbieter aus
            technischen Gründen aufzeichnet.
          </li>
        </ul>
        <p>Wir setzen keine Tracking-, Analyse- oder Werbedienste ein und verkaufen keine Daten.</p>
      </Section>

      <Section title="Weitergabe von Personendaten">
        <p>
          Personendaten geben wir nur an Dienstleister weiter, die wir für den Betrieb benötigen (Auftragsbearbeiter). Sie sind
          vertraglich zum Datenschutz verpflichtet und dürfen die Daten nur in unserem Auftrag bearbeiten:
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Anbieter</th>
                <th scope="col">Zweck</th>
                <th scope="col">Ort</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSORS.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.purpose}</td>
                  <td>{p.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Die Daten werden in der EU (Frankfurt) bearbeitet und gespeichert; die EU gilt nach Schweizer Recht als Staat mit
          angemessenem Datenschutz. Einige Anbieter haben ihren Sitz in den USA; allfällige Zugriffe von dort sind durch das
          Swiss-U.S. bzw. EU-U.S. Data Privacy Framework oder Standardvertragsklauseln abgesichert.
        </p>
        <p>
          <strong>Von der Organisation angebundene Systeme:</strong> Administratoren können Services und Aktionen mit eigenen
          URLs hinterlegen. Beim Abruf eines Service werden die dafür nötigen Kundendaten (z.B. Name, Geburtsdatum) an dessen URL
          gesendet; «Ausführen» übergibt die für den Kunden aufbereiteten Inhalte an die URL der Aktion. Für diese Systeme und die
          Weitergabe dorthin ist die Organisation verantwortlich, die sie einrichtet. Die Schriften liefert die Anwendung selbst
          aus; an Schriften-Dienste gehen keine Daten. Behörden erhalten Daten nur, wenn wir gesetzlich dazu verpflichtet sind.
        </p>
      </Section>

      <Section title="Verschlüsselung">
        <p>
          Die gesamte Kommunikation zwischen Browser und Anwendung ist mit HTTPS (TLS) verschlüsselt. Die Datenbank wird vom
          Anbieter verschlüsselt gespeichert. Passwörter, Sitzungen, API-Schlüssel und Links zum Festlegen des Passworts werden
          nur als Hash gespeichert; diese Links sind einmal verwendbar und 60 Minuten gültig. Das SMTP-Passwort ist mit AES-256-GCM
          verschlüsselt.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          {PRODUCT} verwendet nur technisch notwendige Cookies: <code>sid</code> enthält nach der Anmeldung Deine Sitzung (7 Tage
          gültig, für Skripte nicht lesbar) und wird beim Abmelden gelöscht; <code>oidc_state</code> sichert eine laufende
          Anmeldung über nexusIdentity ab (10 Minuten). Tracking-, Analyse- oder Werbe-Cookies werden nicht gesetzt, eine
          Einwilligung ist deshalb nicht nötig.
        </p>
      </Section>

      <Section title="Aufbewahrung">
        <p>
          Kontodaten bleiben gespeichert, solange das Konto besteht. Ein Admin löscht Konten auf Anfrage; damit werden auch die
          Sitzungen und offenen Links zum Festlegen des Passworts gelöscht. Abgelaufene Sitzungen und Vermerke über
          Fehlversuche werden automatisch gelöscht. Kundendaten bleiben, bis sie die Organisation löscht; das Löschen eines
          Kunden löscht auch seine Positionen, Transaktionen, KundenJourneys und Feedbacks.
        </p>
      </Section>

      <Section title="Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft über Deine Personendaten, auf Berichtigung, Löschung, Einschränkung der Bearbeitung und
          Datenübertragbarkeit sowie das Recht, der Bearbeitung zu widersprechen. Wende Dich dafür an <Mail />. Für Kundendaten
          ist die Organisation Ansprechpartnerin, die sie erfasst hat. Du kannst Dich zudem beim Eidgenössischen Datenschutz- und
          Öffentlichkeitsbeauftragten (EDÖB) oder bei einer Datenschutzaufsichtsbehörde in der EU beschweren.
        </p>
      </Section>

      <Section title="Änderungen">
        <p>
          Wir können diese Datenschutzerklärung jederzeit anpassen. Es gilt die auf dieser Seite veröffentlichte Fassung. Stand:{" "}
          {LAST_UPDATED}.
        </p>
      </Section>
    </main>
  );
}
