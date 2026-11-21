import "server-only";
import type { MailSettingsView } from "@/lib/types";
import { collections } from "./db";
import { mailConfig } from "./mail";

/** The effective e-mail settings for Admin – never the password itself. */
export async function mailSettingsView(): Promise<MailSettingsView> {
  const [c, saved] = await Promise.all([mailConfig(), collections().then(({ settings }) => settings.findOne({ _id: "mail" }))]);
  return {
    source: c.source,
    host: c.host,
    port: c.port,
    user: c.user,
    from: c.from,
    replyTo: c.replyTo,
    passwordSet: Boolean(c.password),
    updatedAt: saved?.updatedAt.toISOString() ?? null,
  };
}
