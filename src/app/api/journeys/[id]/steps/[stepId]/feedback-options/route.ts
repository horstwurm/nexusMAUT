import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { requireJourney, requireStep, toFeedbackOption } from "@/lib/server/journeys";
import { feedbackOptionInput } from "@/lib/server/schemas";

// Feedback options of a journey step (relation journeyStepFeedbackOptions), in order.
// GET  /api/journeys/ID/steps/SID/feedback-options – list (editors)
// POST /api/journeys/ID/steps/SID/feedback-options { option, meaning } – add at the end (admins)

type Ctx = { params: Promise<{ id: string; stepId: string }> };

async function stepOf(ctx: Ctx) {
  const p = await ctx.params;
  const journey = await requireJourney(parseId(p.id));
  return requireStep(journey._id, parseId(p.stepId));
}

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const step = await stepOf(ctx);
  const { feedbackOptions } = await collections();
  const list = await feedbackOptions.find({ stepId: step._id }).sort({ sort: 1, createdAt: 1 }).toArray();
  return Response.json(list.map(toFeedbackOption), { headers: NO_STORE });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const step = await stepOf(ctx);
  const input = await readJson(req, feedbackOptionInput);
  const { feedbackOptions } = await collections();
  const last = await feedbackOptions.find({ stepId: step._id }).sort({ sort: -1 }).limit(1).next();
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    journeyId: step.journeyId,
    stepId: step._id,
    option: input.option,
    meaning: input.meaning,
    sort: last ? last.sort + 10 : 10,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await feedbackOptions.insertOne(doc);
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Die Option «${input.option}» gibt es bei diesem Schritt schon`);
    throw err;
  }
  return Response.json(toFeedbackOption(doc), { status: 201, headers: NO_STORE });
});
