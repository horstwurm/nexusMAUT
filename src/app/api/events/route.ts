import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { listEvents, requireEventJourney, requireTriggerService, toEvent } from "@/lib/server/events";
import { HttpError, isDuplicate, NO_STORE, readJson, route } from "@/lib/server/http";
import { eventInput } from "@/lib/server/schemas";

// Events (Ereignisse), managed in Admin.
// GET  /api/events – all, by name (editors)
// POST /api/events { name, description?, serviceId, updateFrequency, journeyId } – add (admins); the service must be a trigger service

export const GET = route(async () => {
  await requireUser();
  return Response.json(await listEvents(), { headers: NO_STORE });
});

export const POST = route(async (req: Request) => {
  await requireUser("admin");
  const input = await readJson(req, eventInput);
  const service = await requireTriggerService(input.serviceId);
  const journey = await requireEventJourney(input.journeyId);
  const now = new Date();
  const doc = { _id: new ObjectId(), ...input, serviceId: service._id, journeyId: journey._id, createdAt: now, updatedAt: now };
  const { events } = await collections();
  try {
    await events.insertOne(doc);
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Das Event «${input.name}» gibt es schon`);
    throw err;
  }
  return Response.json(toEvent(doc, service, journey), { status: 201, headers: NO_STORE });
});
