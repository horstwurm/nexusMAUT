import { requireUser } from "@/lib/server/auth";
import { HttpError, NO_STORE, readJson, route } from "@/lib/server/http";
import { sendTestMail } from "@/lib/server/mail";
import { testMailInput } from "@/lib/server/schemas";

// POST /api/settings/mail/test { to } – sends a test mail with the current
// settings (admins). SMTP problems come back as 502 with the server's message.

export const maxDuration = 60;

export const POST = route(async (req: Request) => {
  await requireUser("admin");
  const { to } = await readJson(req, testMailInput);
  try {
    const result = await sendTestMail(to);
    return Response.json({ to, ...result }, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[mail] test mail failed:", message);
    throw new HttpError(502, `Versand fehlgeschlagen: ${message.slice(0, 300)}`);
  }
});
