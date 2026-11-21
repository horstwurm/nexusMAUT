"use client";

import { useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import type { MailSettingsView } from "@/lib/types";

const SOURCE: Record<MailSettingsView["source"], { label: string; badge: string; text: string }> = {
  admin: { label: "Administration", badge: "badge-ok", text: "Die hier gespeicherten Einstellungen werden verwendet." },
  env: { label: "Umgebungsvariablen", badge: "badge-accent", text: "Es gelten die NODE_MAILER_*-Variablen (.env.local / Hosting). Speichern übersteuert sie." },
  none: {
    label: "nicht konfiguriert",
    badge: "badge-warn",
    text: "Kein SMTP-Server: in der Entwicklung erscheinen E-Mails in der Server-Konsole, in Produktion wird nicht versendet.",
  },
};

/** Admin → E-Mail: SMTP settings and a test mail. */
export function MailAdmin({ initial, myEmail }: { initial: MailSettingsView; myEmail: string }) {
  const [view, setView] = useState(initial);
  const [form, setForm] = useState({
    host: initial.host,
    port: String(initial.port || 587),
    user: initial.user,
    password: "",
    clearPassword: false,
    from: initial.from,
    replyTo: initial.replyTo,
  });
  const [to, setTo] = useState(myEmail);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const src = SOURCE[view.source];

  const apply = (v: MailSettingsView) => {
    setView(v);
    setForm({ host: v.host, port: String(v.port || 587), user: v.user, password: "", clearPassword: false, from: v.from, replyTo: v.replyTo });
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>E-Mail-Versand</h2>
            <p className="small muted" style={{ margin: 0 }}>
              SMTP-Server für den E-Mail-Versand (derzeit die Testmail).
            </p>
          </div>
          <span className={`badge ${src.badge}`}>Quelle: {src.label}</span>
        </div>
        <Notice kind="info">{src.text}</Notice>
        <Notice kind="error">{error}</Notice>
        <Notice kind="ok">{info}</Notice>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const body = {
                host: form.host,
                port: Number(form.port),
                user: form.user,
                ...(form.password && { password: form.password }),
                clearPassword: form.clearPassword,
                from: form.from,
                replyTo: form.replyTo,
              };
              apply(await api<MailSettingsView>("/api/settings/mail", { method: "PUT", body }));
              setInfo("E-Mail-Einstellungen gespeichert.");
            });
          }}
        >
          <div className="grid2">
            <label className="field">
              <span>SMTP-Server</span>
              <input type="text" required maxLength={200} value={form.host} onChange={set("host")} placeholder="smtp-relay.brevo.com" />
            </label>
            <label className="field">
              <span>Port</span>
              <input type="number" required min={1} max={65535} value={form.port} onChange={set("port")} />
              <span className="hint">587 = STARTTLS, 465 = TLS</span>
            </label>
            <label className="field">
              <span>Benutzer</span>
              <input type="text" maxLength={200} value={form.user} onChange={set("user")} autoComplete="off" />
            </label>
            <label className="field">
              <span>Passwort</span>
              <input
                type="password"
                maxLength={500}
                value={form.password}
                onChange={set("password")}
                autoComplete="new-password"
                placeholder={view.passwordSet ? "•••••••• (gespeichert – leer lassen = behalten)" : "nicht gesetzt"}
                disabled={form.clearPassword}
              />
              {view.passwordSet && view.source === "admin" && (
                <label className="check small" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={form.clearPassword} onChange={set("clearPassword")} />
                  <span>Passwort entfernen (Server ohne Anmeldung)</span>
                </label>
              )}
            </label>
            <label className="field">
              <span>Absender</span>
              <input type="text" required maxLength={300} value={form.from} onChange={set("from")} placeholder="nexusMAUT <noreply@example.ch>" />
            </label>
            <label className="field">
              <span>Antwortadresse</span>
              <input type="email" maxLength={254} value={form.replyTo} onChange={set("replyTo")} placeholder="optional" />
            </label>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="small muted">{view.updatedAt ? `Zuletzt gespeichert ${formatDate(view.updatedAt, true)}` : ""}</span>
            <div className="row">
              {view.source === "admin" && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Gespeicherte E-Mail-Einstellungen entfernen? Danach gelten wieder die Umgebungsvariablen.")) return;
                    run(async () => {
                      apply(await api<MailSettingsView>("/api/settings/mail", { method: "DELETE" }));
                      setInfo("Einstellungen entfernt – es gelten wieder die Umgebungsvariablen.");
                    });
                  }}
                >
                  Zurücksetzen
                </button>
              )}
              <button className="btn btn-primary" disabled={busy}>
                Speichern
              </button>
            </div>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Das Passwort wird verschlüsselt gespeichert (mit SECRET_KEY) und nie angezeigt.
          </p>
        </form>
      </section>

      <section className="card">
        <h2>Testmail</h2>
        <p className="small muted">Sendet eine kurze E-Mail mit den aktuell gültigen Einstellungen (vorher gespeicherte Änderungen).</p>
        {testResult && <Notice kind={testResult.kind}>{testResult.text}</Notice>}
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setTestResult(null);
            try {
              const r = await api<{ to: string; mode: "smtp" | "console" }>("/api/settings/mail/test", { body: { to } });
              setTestResult(
                r.mode === "smtp"
                  ? { kind: "ok", text: `Testmail an ${r.to} versendet – bitte Posteingang (und Spam) prüfen.` }
                  : { kind: "info", text: `Kein SMTP-Server konfiguriert: die Testmail an ${r.to} steht in der Server-Konsole.` },
              );
            } catch (err) {
              setTestResult({ kind: "error", text: errorText(err) });
            } finally {
              setBusy(false);
            }
          }}
        >
          <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 320 }} aria-label="Empfänger" />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Sende …" : "Testmail senden"}
          </button>
        </form>
      </section>
    </>
  );
}
