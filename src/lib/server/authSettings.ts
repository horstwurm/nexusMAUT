import "server-only";
import type { AuthSettingsView } from "@/lib/types";
import { collections, type AuthMode } from "./db";

// How people log in: via nexusIdentity (OIDC, default) or with the own login
// (e-mail + password, stored here). Admin → Anmeldung switches it; without a
// saved setting AUTH_MODE=local|nexusIdentity decides (default nexusIdentity).

const envMode = (): AuthMode => (process.env.AUTH_MODE?.trim().toLowerCase() === "local" ? "local" : "nexusIdentity");

export async function authSettings(): Promise<{ mode: AuthMode; allowRegistration: boolean; source: "admin" | "env" }> {
  const { authSettings } = await collections();
  const saved = await authSettings.findOne({ _id: "auth" });
  if (saved) return { mode: saved.mode, allowRegistration: saved.allowRegistration, source: "admin" };
  return { mode: envMode(), allowRegistration: true, source: "env" };
}

export const authMode = async () => (await authSettings()).mode;

/** Client id + secret for nexusIdentity are set (the login there can work at all). */
export const oidcConfigured = () => Boolean(process.env.NEXUS_CLIENT_ID?.trim() && process.env.NEXUS_CLIENT_SECRET?.trim());

export async function authSettingsView(): Promise<AuthSettingsView> {
  const { authSettings: col } = await collections();
  const [s, saved] = await Promise.all([authSettings(), col.findOne({ _id: "auth" })]);
  return {
    mode: s.mode,
    allowRegistration: s.allowRegistration,
    source: s.source,
    oidcConfigured: oidcConfigured(),
    updatedAt: saved?.updatedAt.toISOString() ?? null,
  };
}
