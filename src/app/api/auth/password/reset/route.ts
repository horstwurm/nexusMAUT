import { authMode } from "@/lib/server/authSettings";
import { sha256 } from "@/lib/server/crypto";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, readJson, route } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/passwords";
import { resetPasswordInput } from "@/lib/server/schemas";

// POST /api/auth/password/reset { token, password } – sets the password from a
// «Passwort vergessen» link (single use) and logs the user out everywhere.

export const POST = route(async (req: Request) => {
  if ((await authMode()) !== "local") throw new HttpError(403, "Die Anmeldung läuft über nexusIdentity");
  const { token, password } = await readJson(req, resetPasswordInput);
  const { users, passwordResets, sessions } = await collections();
  // consumed even if the rest fails
  const reset = await passwordResets.findOneAndDelete({ _id: sha256(token), expiresAt: { $gt: new Date() } });
  if (!reset) throw new HttpError(400, "Der Link ist ungültig oder abgelaufen");
  const res = await users.updateOne({ _id: reset.userId }, { $set: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() } });
  if (!res.matchedCount) throw new HttpError(400, "Der Link ist ungültig oder abgelaufen");
  // whoever knew the old password loses access
  await sessions.deleteMany({ userId: reset.userId });
  return Response.json({ message: "Passwort gespeichert" }, { headers: NO_STORE });
});
