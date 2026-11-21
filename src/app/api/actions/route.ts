import { ObjectId } from "mongodb";
import { listActions, toAction } from "@/lib/server/actions";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, isDuplicate, NO_STORE, readJson, route } from "@/lib/server/http";
import { actionInput } from "@/lib/server/schemas";

// Actions (Aktionen), managed in Admin.
// GET  /api/actions – all, by name (editors)
// POST /api/actions { name, description?, url? } – add (admins)

export const GET = route(async () => {
  await requireUser();
  return Response.json(await listActions(), { headers: NO_STORE });
});

export const POST = route(async (req: Request) => {
  await requireUser("admin");
  const input = await readJson(req, actionInput);
  const now = new Date();
  const doc = { _id: new ObjectId(), ...input, createdAt: now, updatedAt: now };
  const { actions } = await collections();
  try {
    await actions.insertOne(doc);
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Die Aktion «${input.name}» gibt es schon`);
    throw err;
  }
  return Response.json(toAction(doc), { status: 201, headers: NO_STORE });
});
