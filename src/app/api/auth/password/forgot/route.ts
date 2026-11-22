import { authMode } from "@/lib/server/authSettings";
import { newToken, sha256 } from "@/lib/server/crypto";
import { collections } from "@/lib/server/db";
import { appUrl, HttpError, NO_STORE, readJson, route } from "@/lib/server/http";
import { sendMail } from "@/lib/server/mail";
import { forgotPasswordInput } from "@/lib/server/schemas";

// POST /api/auth/password/forgot { email } – mails a single-use link to set a
// new password (60 min). Same answer whether or not the e-mail is known.

const RESET_MINUTES = 60;
const ANSWER = "Falls die E-Mail-Adresse registriert ist, ist ein Link unterwegs.";

export const POST = route(async (req: Request) => {
  if ((await authMode()) !== "local") throw new HttpError(403, "Die Anmeldung läuft über nexusIdentity");
  const { email } = await readJson(req, forgotPasswordInput);
  const { users, passwordResets } = await collections();
  const user = await users.findOne({ email }, { sort: { passwordHash: -1 } });
  if (user) {
    const token = newToken();
    await passwordResets.deleteMany({ userId: user._id }); // one open link per user
    await passwordResets.insertOne({ _id: sha256(token), userId: user._id, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) });
    try {
      await sendMail(
        user.email,
        "nexusMAUT – Passwort festlegen",
        [
          `Hallo ${user.name}`,
          "",
          `Mit diesem Link legst Du ein neues Passwort für nexusMAUT fest. Er ist ${RESET_MINUTES} Minuten gültig und nur einmal verwendbar:`,
          "",
          `${appUrl()}/password/reset?token=${token}`,
          "",
          "Falls Du das nicht angefordert hast, kannst Du diese E-Mail ignorieren – Dein Passwort bleibt unverändert.",
        ].join("\n"),
      );
    } catch (err) {
      console.error("[auth] password reset mail failed:", err);
      throw new HttpError(502, "Die E-Mail konnte nicht gesendet werden – bitte später nochmals versuchen");
    }
  }
  return Response.json({ message: ANSWER }, { headers: NO_STORE });
});
