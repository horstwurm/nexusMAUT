"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText } from "@/lib/client";

// Forms of the own login (Admin → Anmeldung «Eigene Anmeldung») and of «Mein Konto».

/** Runs a submission with busy and error state; `fn` returns an error text or null. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** Full page load after login: the server components read the new session. */
const go = (role: string, returnTo: string) => window.location.assign(role === "pending" ? "/pending" : returnTo);

export function LoginForm({ returnTo, allowRegistration }: { returnTo: string; allowRegistration: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const { role } = await api<{ role: string }>("/api/auth/login", { body: { email, password } });
          go(role, returnTo);
        });
      }}
    >
      <Notice kind="error">{error}</Notice>
      <Field label="E-Mail">
        <input type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Passwort">
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Anmelden …" : "Anmelden"}
      </button>
      <div className="auth-links">
        <Link href="/password/forgot">Passwort vergessen?</Link>
        {allowRegistration && <Link href={`/register?return=${encodeURIComponent(returnTo)}`}>Konto erstellen</Link>}
      </div>
    </form>
  );
}

export function RegisterForm({ returnTo }: { returnTo: string }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const { busy, error, run } = useSubmit();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const { role } = await api<{ role: string }>("/api/auth/register", { body: form });
          go(role, returnTo);
        });
      }}
    >
      <Notice kind="error">{error}</Notice>
      <Field label="Name">
        <input autoComplete="name" required autoFocus maxLength={100} value={form.name} onChange={set("name")} />
      </Field>
      <Field label="E-Mail">
        <input type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Passwort" hint="Mindestens 8 Zeichen">
        <input type="password" autoComplete="new-password" required minLength={8} maxLength={200} value={form.password} onChange={set("password")} />
      </Field>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Konto wird erstellt …" : "Konto erstellen"}
      </button>
      <div className="auth-links">
        <span className="muted">Schon registriert?</span>
        <Link href={`/login?return=${encodeURIComponent(returnTo)}`}>Anmelden</Link>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { busy, error, run } = useSubmit();
  if (sent) {
    return (
      <>
        <Notice kind="ok">{sent}</Notice>
        <div className="auth-links">
          <Link href="/login">Zurück zur Anmeldung</Link>
        </div>
      </>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => setSent((await api<{ message: string }>("/api/auth/password/forgot", { body: { email } })).message));
      }}
    >
      <Notice kind="error">{error}</Notice>
      <Field label="E-Mail">
        <input type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Senden …" : "Link senden"}
      </button>
      <div className="auth-links">
        <Link href="/login">Zurück zur Anmeldung</Link>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit();
  if (!token) return <Notice kind="error">Der Link ist unvollständig – bitte einen neuen anfordern.</Notice>;
  if (done) {
    return (
      <>
        <Notice kind="ok">Dein Passwort ist gespeichert. Du kannst Dich jetzt damit anmelden.</Notice>
        <Link href="/login" className="btn btn-primary btn-block">
          Anmelden
        </Link>
      </>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api("/api/auth/password/reset", { body: { token, password } });
          setDone(true);
        });
      }}
    >
      <Notice kind="error">
        {error && (
          <>
            {error} – <Link href="/password/forgot">neuen Link anfordern</Link>
          </>
        )}
      </Notice>
      <Field label="Neues Passwort" hint="Mindestens 8 Zeichen">
        <input type="password" autoComplete="new-password" required minLength={8} maxLength={200} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Speichern …" : "Passwort speichern"}
      </button>
    </form>
  );
}

/** «Mein Konto»: display name. */
export function ProfileForm({ name: initial }: { name: string }) {
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useSubmit();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(async () => {
          await api("/api/account", { method: "PATCH", body: { name } });
          setSaved(true);
        });
      }}
    >
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{saved ? "Gespeichert." : null}</Notice>
      <Field label="Name">
        <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <button className="btn btn-primary" disabled={busy}>
        Speichern
      </button>
    </form>
  );
}

/** «Mein Konto»: set (first time) or change the own password. */
export function PasswordForm({ hasPassword: initial }: { hasPassword: boolean }) {
  const [hasPassword, setHasPassword] = useState(initial);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useSubmit();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setDone(null);
        run(async () => {
          const { message } = await api<{ message: string }>("/api/account/password", {
            body: hasPassword ? form : { newPassword: form.newPassword },
          });
          setForm({ currentPassword: "", newPassword: "" });
          setHasPassword(true);
          setDone(`${message}. Andere Geräte wurden abgemeldet.`);
        });
      }}
    >
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{done}</Notice>
      {hasPassword && (
        <Field label="Aktuelles Passwort">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          />
        </Field>
      )}
      <Field label={hasPassword ? "Neues Passwort" : "Passwort"} hint="Mindestens 8 Zeichen">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={200}
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
        />
      </Field>
      <button className="btn btn-primary" disabled={busy}>
        {hasPassword ? "Passwort ändern" : "Passwort festlegen"}
      </button>
    </form>
  );
}
