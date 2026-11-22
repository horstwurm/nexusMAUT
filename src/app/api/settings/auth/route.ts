import { requireUser } from "@/lib/server/auth";
import { authSettingsView, oidcConfigured } from "@/lib/server/authSettings";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, readJson, route } from "@/lib/server/http";
import { authSettingsInput } from "@/lib/server/schemas";

// GET / PUT /api/settings/auth { mode, allowRegistration } – Admin →
// Anmeldung (admins). Guards against locking oneself out: the own login needs
// a password of the admin switching; nexusIdentity needs client id + secret.

export const GET = route(async () => {
  await requireUser("admin");
  return Response.json(await authSettingsView(), { headers: NO_STORE });
});

export const PUT = route(async (req: Request) => {
  const me = await requireUser("admin");
  const input = await readJson(req, authSettingsInput);
  if (input.mode === "local" && !me.passwordHash) {
    throw new HttpError(409, "Lege zuerst unter «Mein Konto» ein eigenes Passwort fest – sonst kannst Du Dich danach nicht mehr anmelden");
  }
  if (input.mode === "nexusIdentity" && !oidcConfigured()) {
    throw new HttpError(409, "nexusIdentity ist nicht konfiguriert (NEXUS_CLIENT_ID / NEXUS_CLIENT_SECRET fehlen)");
  }
  const { authSettings } = await collections();
  await authSettings.updateOne(
    { _id: "auth" },
    { $set: { mode: input.mode, allowRegistration: input.allowRegistration, updatedAt: new Date(), updatedBy: me._id } },
    { upsert: true },
  );
  return Response.json(await authSettingsView(), { headers: NO_STORE });
});
