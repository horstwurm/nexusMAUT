"use client";

import Link from "next/link";
import { useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import type { AuthSettingsView } from "@/lib/types";

/** Admin → Anmeldung: nexusIdentity (single sign-on) or the own login with e-mail and password. */
export function AuthAdmin({ initial, myPassword, myIdentity }: { initial: AuthSettingsView; myPassword: boolean; myIdentity: boolean }) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const local = view.mode === "local";

  async function save(next: Pick<AuthSettingsView, "mode" | "allowRegistration">, done: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      setView(await api<AuthSettingsView>("/api/settings/auth", { method: "PUT", body: next }));
      setInfo(done);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleMode(toLocal: boolean) {
    const question = toLocal
      ? "Auf die eigene Anmeldung umstellen? Ab sofort meldet man sich mit E-Mail und Passwort an. Wer noch kein Passwort hat, legt es über «Passwort vergessen» fest. Bestehende Sitzungen bleiben gültig."
      : `Auf nexusIdentity umstellen? Ab sofort meldet man sich dort an.${myIdentity ? "" : " Achtung: Dein Konto wurde noch nie über nexusIdentity angemeldet – es wird bei der ersten Anmeldung über die bestätigte E-Mail-Adresse verknüpft."}`;
    if (!window.confirm(question)) return;
    save(
      { mode: toLocal ? "local" : "nexusIdentity", allowRegistration: view.allowRegistration },
      toLocal ? "Eigene Anmeldung ist aktiv." : "Anmeldung über nexusIdentity ist aktiv.",
    );
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Anmeldung</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Wie man sich bei nexusMAUT anmeldet. Rollen werden in beiden Fällen hier vergeben (Tab «Benutzer»).
          </p>
        </div>
        <span className={`badge ${local ? "badge-accent" : "badge-ok"}`}>{local ? "Eigene Anmeldung" : "nexusIdentity"}</span>
      </div>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{info}</Notice>

      <label className="switch-field">
        <input type="checkbox" role="switch" className="switch" checked={local} disabled={busy} onChange={(e) => toggleMode(e.target.checked)} />
        <span>
          <strong>Eigene Anmeldung (E-Mail und Passwort)</strong>
          <span className="small muted" style={{ display: "block" }}>
            {local
              ? "Aktiv: nexusMAUT prüft E-Mail und Passwort selbst (Passwörter als scrypt-Hash gespeichert, «Passwort vergessen» per E-Mail, nach 10 Fehlversuchen 15 Minuten Pause)."
              : "Aus: Anmeldung über nexusIdentity (OpenID Connect, Single Sign-on) – nexusMAUT speichert dabei keine Passwörter."}
          </span>
        </span>
      </label>

      <label className="switch-field">
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={view.allowRegistration}
          disabled={busy || !local}
          onChange={(e) =>
            save(
              { mode: view.mode, allowRegistration: e.target.checked },
              e.target.checked ? "Registrierung ist erlaubt." : "Registrierung ist ausgeschaltet.",
            )
          }
        />
        <span>
          <strong>Registrierung erlauben</strong>
          <span className="small muted" style={{ display: "block" }}>
            Nur bei eigener Anmeldung: wer sich registriert, wartet auf eine Rolle. Aus = nur bestehende Benutzer melden sich an.
          </span>
        </span>
      </label>

      {!myPassword && !local && (
        <Notice kind="info">
          Du hast noch kein eigenes Passwort. Lege es vor dem Umstellen unter <Link href="/account">Mein Konto</Link> fest.
        </Notice>
      )}
      {!view.oidcConfigured && <Notice kind="warn">nexusIdentity ist nicht konfiguriert (NEXUS_CLIENT_ID / NEXUS_CLIENT_SECRET fehlen).</Notice>}
      {local && <Notice kind="info">Für «Passwort vergessen» muss der E-Mail-Versand eingerichtet sein (Tab «E-Mail»); in der Entwicklung steht der Link in der Server-Konsole.</Notice>}
      <p className="small muted" style={{ marginBottom: 0 }}>
        {view.source === "admin" ? `Zuletzt geändert ${formatDate(view.updatedAt, true)}.` : "Noch nicht gespeichert – es gilt AUTH_MODE (Standard: eigene Anmeldung)."} Notfall:{" "}
        <code>npm run auth:mode -- nexusIdentity</code> bzw. <code>local</code>.
      </p>
    </section>
  );
}
