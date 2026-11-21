# nexusMAUT

Marketing-Automation für die nexus-Anwendungen: Kunden mit Produkten,
Positionen und Transaktionen, Kundenattribute, Regeln (Kundensegmente),
Journeys mit Schritten (Aktionen und Inhalte mit Platzhaltern) und Services,
die per HTTP aufgerufen werden. Anmeldung über **nexusIdentity** (OpenID Connect).

## Start

1. In nexusIdentity (<http://localhost:3005>) unter **Administration → Anwendungen**
   eine *vertrauliche* Anwendung anlegen:
   - Client-ID `nexus-maut`
   - Redirect-URI `http://localhost:3006/auth/callback`
   - Post-Logout-URI `http://localhost:3006/`
2. Das angezeigte Client-Secret in `.env.local` bei `NEXUS_CLIENT_SECRET` eintragen
   (Vorlage: `.env.example`).
3. ```bash
   npm install
   npm run dev -- -p 3006
   ```
4. <http://localhost:3006> öffnen und anmelden – **die erste Person wird Admin**,
   alle weiteren warten auf Freischaltung unter **Benutzer**.
5. Optional Beispieldaten: `npm run sample:create` (100 Kunden), entfernen mit `npm run sample:remove`.

Ohne SMTP-Konfiguration erscheint die Testmail (Administration → E-Mail) in der Konsole.

## Produktion

- `APP_URL` = öffentliche URL; Redirect- und Post-Logout-URI in nexusIdentity entsprechend.
- `SECRET_KEY` (`openssl rand -base64 32`) verschlüsselt das in der Administration
  gespeicherte SMTP-Passwort – nicht mehr ändern.
- SMTP über Brevo (oder in Administration → E-Mail), Hosting Vercel `fra1`.

Details: [CLAUDE.md](CLAUDE.md).
