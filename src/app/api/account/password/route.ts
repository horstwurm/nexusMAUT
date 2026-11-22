import { endOtherSessions, requireSignedIn } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, readJson, route } from "@/lib/server/http";
import { hashPassword, verifyPassword } from "@/lib/server/passwords";
import { changePasswordInput } from "@/lib/server/schemas";

// POST /api/account/password { currentPassword?, newPassword } – sets or
// changes the own password (works in both login modes, so a nexusIdentity
// user can prepare the own login). The current one is needed once a password
// exists; other devices are logged out.

export const POST = route(async (req: Request) => {
  const me = await requireSignedIn();
  const { currentPassword, newPassword } = await readJson(req, changePasswordInput);
  if (me.passwordHash && !(await verifyPassword(currentPassword ?? "", me.passwordHash))) {
    throw new HttpError(400, "Das aktuelle Passwort ist falsch");
  }
  const { users } = await collections();
  await users.updateOne({ _id: me._id }, { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() } });
  await endOtherSessions(me._id);
  return Response.json({ message: me.passwordHash ? "Passwort geändert" : "Passwort festgelegt" }, { headers: NO_STORE });
});
