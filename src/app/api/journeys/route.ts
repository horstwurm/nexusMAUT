import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, isDuplicate, NO_STORE, readJson, route } from "@/lib/server/http";
import { listJourneys, toJourney } from "@/lib/server/journeys";
import { journeyInput } from "@/lib/server/schemas";

// Journeys, managed in Admin.
// GET  /api/journeys – all, by name (editors)
// POST /api/journeys { name, description? } – add (admins)

export const GET = route(async () => {
  await requireUser();
  return Response.json(await listJourneys(), { headers: NO_STORE });
});

export const POST = route(async (req: Request) => {
  await requireUser("admin");
  const input = await readJson(req, journeyInput);
  const now = new Date();
  const doc = { _id: new ObjectId(), ...input, createdAt: now, updatedAt: now };
  const { journeys } = await collections();
  try {
    await journeys.insertOne(doc);
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Die Journey «${input.name}» gibt es schon`);
    throw err;
  }
  return Response.json(toJourney(doc), { status: 201, headers: NO_STORE });
});
