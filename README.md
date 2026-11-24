# nexusMAUT

Marketing-Automation für die nexus-Anwendungen – live auf <https://nexus-maut.vercel.app>.

- **Kunden** mit Produkten, Positionen, Transaktionen und eigenen Attributen;
  «Service»-Attribute holen Werte aus anderen Systemen (mit Mock-Schalter).
- **Kunden Selektionen** finden Zielgruppen über Kunde, Positionen und Transaktionen.
- **Journeys** sind Folgen von Schritten: Aktion, Inhalt mit Platzhaltern und
  **Feedback-Optionen** (Lead, Chance, Interesse, Indifferent, Kein Interesse aktuell,
  Kein Interesse).
- **KundenJourneys (Kampagnen)** begleiten jeden Kunden: Status pro Schritt (Vorschlag, Bereit zur
  Ausführung, Ausgesetzt, Erledigt, Übersprungen), «Daten prüfen», Kundenfeedback,
  **«Ausführen»** sendet die bereiten Schritte an das System der Aktion.
- **Events** (erste Version, wird noch überarbeitet): Ereignisse mit Trigger-Service,
  Aktualisierung und Journey; «Service jetzt aufrufen» zeigt den letzten Aufruf. Ein
  Zeitgeber im Hintergrund kann fällige Events abfragen – standardmässig ausgeschaltet.
- **Data Management:** Initial Upload von Kunden, Positionen und Transaktionen aus CSV,
  Excel oder JSON (Test, Quellname, Fortschritt, frühere Uploads löschen); jeder Datensatz
  zeigt seine Quelle (Upload oder «Manuell»).
- **Anmeldung** mit E-Mail und Passwort (Standard) oder über **nexusIdentity**
  (OpenID Connect) – umschaltbar unter Administration → Anmeldung.

UI auf Deutsch, Code auf Englisch. Details zu Architektur und Entscheidungen: [CLAUDE.md](CLAUDE.md).

## Entwicklung

```bash
npm install
cp .env.example .env.local   # Werte eintragen, siehe unten
npm run dev -- -p 3006       # http://localhost:3006
npm run lint && npm run typecheck && npm test
```

**Achtung:** `.env.local` zeigt derzeit auf die **produktive** Datenbank (MongoDB Atlas,
`nexus-maut`). Alles, was lokal gespeichert wird, ist sofort live. Für Tests eine eigene
Datenbank verwenden (z.B. die lokale MongoDB auf Port 27019).

Die erste Person, die sich registriert bzw. anmeldet, wird Admin; alle weiteren warten,
bis ein Admin ihnen unter **Administration → Benutzer** eine Rolle gibt.

Nützliche Skripte:

| Befehl | Zweck |
|---|---|
| `npm run sample:create` / `sample:remove` | 100 Beispielkunden anlegen / wieder entfernen |
| `npm run admin:grant -- name@example.ch` | eine angemeldete Person zum Admin machen |
| `npm run auth:mode -- local\|nexusIdentity` | Anmeldeart im Notfall umstellen |
| `npm run attributes:age` | Alter jedes Kunden ins Kundenattribut «Alter» kopieren |
| `npm run samples:upload` | 250 fiktive Kunden als Upload-Quellen (CSV, Excel, JSON) in `samples/upload` |

## Umgebungsvariablen

| Variable | Bedeutung |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Datenbank (`nexus-maut`) |
| `APP_URL` | öffentliche URL ohne `/` am Ende – in Produktion Pflicht |
| `SECRET_KEY` | `openssl rand -base64 32`; verschlüsselt das in der Administration gespeicherte SMTP-Passwort – nicht mehr ändern |
| `AUTH_MODE` | `local` (Standard) oder `nexusIdentity`, solange in der Administration nichts gespeichert ist |
| `NEXUS_ISSUER`, `NEXUS_CLIENT_ID`, `NEXUS_CLIENT_SECRET` | nur für die Anmeldung über nexusIdentity |
| `NEXUS_POST_LOGOUT_URI` | optional, falls die in nexusIdentity registrierte Post-Logout-URI von `APP_URL` abweicht |
| `EVENT_TIMER` | `on` startet den Zeitgeber für die Trigger-Services der Events (sonst aus) |
| `NODE_MAILER_*` | SMTP (z.B. Brevo) für «Passwort vergessen» und die Testmail; ohne SMTP erscheinen Mails in der Entwicklung in der Konsole |

Für nexusIdentity dort eine *vertrauliche* Anwendung anlegen mit Redirect-URI
`APP_URL/auth/callback` und Post-Logout-URI `APP_URL` (genau so, ohne `/`).

## Schnittstellen für andere Systeme

- **Aktion ausführen:** «Ausführen» sendet pro Schritt ein `POST` mit JSON (Inhalt für den
  Kunden, Kunde, Feedback-Optionen, `feedbackUrl`) an die URL der Aktion. Antwort 2xx →
  Schritt erledigt. Das genaue Format zeigt «API» bei jedem Schritt.
- **Feedback zurückmelden:** `POST {feedbackUrl}` mit
  `{ "feedback": "…", "feedbackComment": "", "feedbackRating": null }` und
  `Authorization: Bearer nxm_…` – den API-Schlüssel der Aktion erzeugt ein Admin unter
  **Administration → Aktionen** (wird nur einmal angezeigt). Ein Schlüssel gilt nur für
  Schritte seiner Aktion.

## Verkaufspräsentation

[`nexusMAUT-Uebersicht.pptx`](nexusMAUT-Uebersicht.pptx) – 17 Folien auf Deutsch, erzeugt mit
`node scripts/deck/build-deck.cjs`. Die Screenshots stammen aus einer Demo-Datenbank mit
fiktiven Kunden, nie aus den produktiven Daten (Ablauf in [CLAUDE.md](CLAUDE.md)).

## Produktion

Vercel-Projekt `nexus-maut` (Region `fra1`), Deployment bei jedem Push auf `main`.
Impressum und Datenschutz: `/impressum` (Link im Fuss jeder Seite).
Datenbank: MongoDB Atlas (Network Access `0.0.0.0/0`). Umgebungsvariablen wie oben.
