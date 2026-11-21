import { requireUser } from "@/lib/server/auth";
import { encrypt } from "@/lib/server/crypto";
import { collections } from "@/lib/server/db";
import { NO_STORE, readJson, route } from "@/lib/server/http";
import { mailSettingsView } from "@/lib/server/mailSettings";
import { mailSettingsInput } from "@/lib/server/schemas";

// E-mail settings (Admin → E-Mail). All admins only.
// GET    /api/settings/mail – current settings (password only as «set»)
// PUT    /api/settings/mail { host, port, user, password?, clearPassword?, from, replyTo } – save
// DELETE /api/settings/mail – remove the Admin settings (back to the env vars)

export const GET = route(async () => {
  await requireUser("admin");
  return Response.json(await mailSettingsView(), { headers: NO_STORE });
});

export const PUT = route(async (req: Request) => {
  const user = await requireUser("admin");
  const { password, clearPassword, ...input } = await readJson(req, mailSettingsInput);
  const { settings } = await collections();
  const before = await settings.findOne({ _id: "mail" });
  const passwordEnc = clearPassword ? "" : password ? encrypt(password) : (before?.passwordEnc ?? "");
  await settings.updateOne(
    { _id: "mail" },
    { $set: { ...input, passwordEnc, updatedAt: new Date(), updatedBy: user._id } },
    { upsert: true },
  );
  return Response.json(await mailSettingsView(), { headers: NO_STORE });
});

export const DELETE = route(async () => {
  await requireUser("admin");
  const { settings } = await collections();
  await settings.deleteOne({ _id: "mail" });
  return Response.json(await mailSettingsView(), { headers: NO_STORE });
});
