import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { assertAction, feedbackOptionsOf, requireJourney, toStep } from "@/lib/server/journeys";
import { journeyStepInput } from "@/lib/server/schemas";

// Steps of a journey (relation journeySteps), in order, each with its feedback options.
// GET  /api/journeys/ID/steps – list (editors)
// POST /api/journeys/ID/steps { actionId, content? } – add at the end (admins)

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const journey = await requireJourney(parseId((await ctx.params).id));
  const { journeySteps } = await collections();
  const list = await journeySteps.find({ journeyId: journey._id }).sort({ sort: 1, createdAt: 1 }).toArray();
  const options = await feedbackOptionsOf(list.map((s) => s._id));
  return Response.json(list.map((s) => toStep(s, options)), { headers: NO_STORE });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const journey = await requireJourney(parseId((await ctx.params).id));
  const input = await readJson(req, journeyStepInput);
  const actionId = parseId(input.actionId);
  await assertAction(actionId);
  const { journeySteps } = await collections();
  const last = await journeySteps.find({ journeyId: journey._id }).sort({ sort: -1 }).limit(1).next();
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    journeyId: journey._id,
    actionId,
    content: input.content,
    sort: last ? last.sort + 10 : 10,
    createdAt: now,
    updatedAt: now,
  };
  await journeySteps.insertOne(doc);
  return Response.json(toStep(doc), { status: 201, headers: NO_STORE });
});
