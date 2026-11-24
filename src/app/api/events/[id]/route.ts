import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { requireEventJourney, requireTriggerService, toEvents } from "@/lib/server/events";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { eventInput } from "@/lib/server/schemas";

// PUT    /api/events/ID { name, description?, serviceId, updateFrequency, journeyId } – change (admins)
// DELETE /api/events/ID – (admins)

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = parseId((await ctx.params).id);
  const input = await readJson(req, eventInput);
  const { events } = await collections();
  const before = await events.findOne({ _id: id });
  if (!before) throw new HttpError(404, "Nicht gefunden");
  const service = await requireTriggerService(input.serviceId, before.serviceId);
  const journey = await requireEventJourney(input.journeyId);
  let doc;
  try {
    doc = await events.findOneAndUpdate(
      { _id: id },
      { $set: { ...input, serviceId: service._id, journeyId: journey._id, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Das Event «${input.name}» gibt es schon`);
    throw err;
  }
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json((await toEvents([doc]))[0], { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { events } = await collections();
  const res = await events.deleteOne({ _id: parseId((await ctx.params).id) });
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
