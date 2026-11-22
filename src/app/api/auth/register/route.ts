import { createLocalUser, startSession } from "@/lib/server/auth";
import { authSettings } from "@/lib/server/authSettings";
import { HttpError, NO_STORE, readJson, route } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/passwords";
import { registerInput } from "@/lib/server/schemas";

// POST /api/auth/register { firstname, lastname, email, password } – own login with
// self-registration allowed (Admin → Anmeldung). The account waits for a role
// («pending»); the very first user becomes admin.

export const POST = route(async (req: Request) => {
  const s = await authSettings();
  if (s.mode !== "local") throw new HttpError(403, "Die Anmeldung läuft über nexusIdentity");
  if (!s.allowRegistration) throw new HttpError(403, "Die Registrierung ist ausgeschaltet – bitte an einen Admin wenden");
  const input = await readJson(req, registerInput);
  const user = await createLocalUser({ email: input.email, firstname: input.firstname, lastname: input.lastname, passwordHash: await hashPassword(input.password) });
  await startSession(user._id);
  return Response.json({ role: user.role }, { status: 201, headers: NO_STORE });
});
