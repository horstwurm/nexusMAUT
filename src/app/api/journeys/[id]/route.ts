import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { eventsOfJourney } from "@/lib/server/events";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { toJourney } from "@/lib/server/journeys";
import { journeyInput } from "@/lib/server/schemas";

// PUT    /api/journeys/ID { name, description? } – change (admins)
// DELETE /api/journeys/ID – with its steps (admins); refused while KundenJourneys or events use it

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const input = await readJson(req, journeyInput);
  const { journeys } = await collections();
  let doc;
  try {
    doc = await journeys.findOneAndUpdate(
      { _id: parseId((await ctx.params).id) },
      { $set: { ...input, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Die Journey «${input.name}» gibt es schon`);
    throw err;
  }
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  const { journeySteps } = await collections();
  return Response.json(toJourney(doc, await journeySteps.countDocuments({ journeyId: doc._id })), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = parseId((await ctx.params).id);
  const { journeys, journeySteps, customerJourneys, feedbackOptions } = await collections();
  const used = await customerJourneys.countDocuments({ journeyId: id });
  if (used) throw new HttpError(409, `Die Journey ist ${used} Kunden zugewiesen (KundenJourneys) – zuerst dort löschen`);
  const events = await eventsOfJourney(id);
  if (events.length) throw new HttpError(409, `Die Journey gehört zu den Events ${events.join(", ")} – zuerst dort ändern`);
  const res = await journeys.deleteOne({ _id: id });
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  await journeySteps.deleteMany({ journeyId: id }); // its steps go with it
  await feedbackOptions.deleteMany({ journeyId: id });
  return new Response(null, { status: 204 });
});
