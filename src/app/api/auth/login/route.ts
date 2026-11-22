import { ObjectId } from "mongodb";
import { startSession } from "@/lib/server/auth";
import { authMode } from "@/lib/server/authSettings";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, readJson, route } from "@/lib/server/http";
import { dummyPasswordHash, verifyPassword } from "@/lib/server/passwords";
import { loginInput } from "@/lib/server/schemas";

// POST /api/auth/login { email, password } – own login (only when Admin →
// Anmeldung is set to «Eigene Anmeldung»). Wrong input = 400 (not 401: the
// browser helper treats 401 as «session gone»). After 10 failures for an
// e-mail within 15 minutes: 429.

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

export const POST = route(async (req: Request) => {
  if ((await authMode()) !== "local") throw new HttpError(403, "Die Anmeldung läuft über nexusIdentity");
  const { email, password } = await readJson(req, loginInput);
  const { users, loginFailures } = await collections();
  if ((await loginFailures.countDocuments({ email, at: { $gt: new Date(Date.now() - WINDOW_MS) } })) >= MAX_FAILURES) {
    throw new HttpError(429, "Zu viele Fehlversuche – bitte in 15 Minuten nochmals versuchen");
  }
  const user = await users.findOne({ email, passwordHash: { $exists: true } });
  // always hash, so the response time doesn't reveal whether the e-mail exists
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash()));
  if (!user || !ok) {
    await loginFailures.insertOne({ _id: new ObjectId(), email, at: new Date() });
    throw new HttpError(400, "E-Mail oder Passwort falsch");
  }
  await loginFailures.deleteMany({ email });
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await startSession(user._id);
  return Response.json({ role: user.role }, { headers: NO_STORE });
});
