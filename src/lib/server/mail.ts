import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { decrypt } from "./crypto";
import { collections } from "./db";

// E-mail via SMTP (Nodemailer) – currently the Admin test mail. The settings come from Admin → E-Mail
// (`settings` doc "mail", password encrypted) or, when none are saved there,
// from the environment – production uses Brevo (smtp-relay.brevo.com:587):
//   NODE_MAILER_HOST, NODE_MAILER_PORT (587 = STARTTLS, 465 = TLS),
//   NODE_MAILER_USER, NODE_MAILER_PASSWORD, NODE_MAILER_FROM_MAIL.
// Without either, development prints mails to the server console;
// production refuses to send.

export type MailConfig = {
  /** where the settings come from */
  source: "admin" | "env" | "none";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  replyTo: string;
};

/** An env value without surrounding spaces / quotes (easily pasted into a dashboard). */
function env(name: string) {
  return (process.env[name] ?? "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
}

export async function mailConfig(): Promise<MailConfig> {
  const { settings } = await collections();
  const saved = await settings.findOne({ _id: "mail" });
  if (saved?.host) {
    return {
      source: "admin",
      host: saved.host,
      port: saved.port,
      secure: saved.port === 465,
      user: saved.user,
      password: (saved.passwordEnc && decrypt(saved.passwordEnc)) || "",
      from: saved.from,
      replyTo: saved.replyTo,
    };
  }
  const port = Number(env("NODE_MAILER_PORT")) || 587;
  const host = env("NODE_MAILER_HOST");
  return {
    source: host ? "env" : "none",
    host,
    port,
    secure: port === 465,
    user: env("NODE_MAILER_USER"),
    password: env("NODE_MAILER_PASSWORD"),
    from: env("NODE_MAILER_FROM_MAIL"),
    replyTo: "",
  };
}

export const isConfigured = (c: MailConfig) => Boolean(c.host && c.from);

// one pooled transport per configuration – rebuilt when the settings change
let cached: { key: string; transport: Transporter } | undefined;
function transportFor(c: MailConfig) {
  const key = JSON.stringify([c.host, c.port, c.user, c.password]);
  if (cached?.key !== key) {
    cached?.transport.close();
    cached = {
      key,
      transport: nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.secure,
        ...(c.user && { auth: { user: c.user, pass: c.password } }),
        pool: true,
        connectionTimeout: 15_000,
      }),
    };
  }
  return cached.transport;
}

/**
 * Admin → E-Mail → «Testmail senden». Checks the connection first so a wrong
 * host / login shows up as such. «console» = no SMTP configured (development).
 */
export async function sendTestMail(to: string): Promise<{ mode: "smtp" | "console"; source: MailConfig["source"] }> {
  const c = await mailConfig();
  const text = `Dies ist eine Testmail von nexusMAUT.\n\nEinstellungen: ${c.source === "admin" ? "Administration" : c.source === "env" ? "Umgebungsvariablen" : "keine"}\nServer: ${c.host || "–"}:${c.port}\nAbsender: ${c.from || "–"}\nGesendet: ${new Date().toISOString()}`;
  if (!isConfigured(c)) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP ist nicht konfiguriert");
    console.log(`\n[mail] TEST to ${to}\n${text}\n`);
    return { mode: "console", source: c.source };
  }
  const transport = transportFor(c);
  await transport.verify();
  await transport.sendMail({ from: c.from, ...(c.replyTo && { replyTo: c.replyTo }), to, subject: "nexusMAUT – Testmail", text });
  return { mode: "smtp", source: c.source };
}
