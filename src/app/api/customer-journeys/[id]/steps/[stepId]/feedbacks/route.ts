import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { toFeedbackView } from "@/lib/server/customerJourneys";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerFeedbackInput } from "@/lib/server/schemas";

// Customer feedback on a KundenJourney step (relation customerFeedback).
// GET  /api/customer-journeys/ID/steps/SID/feedbacks – oldest first (editors)
// POST /api/customer-journeys/ID/steps/SID/feedbacks { feedback, feedbackComment?, feedbackRating? 1–5 | null } (editors)

type Ctx = { params: Promise<{ id: string; stepId: string }> };

async function requireStep(ctx: Ctx) {
  const p = await ctx.params;
  const { customerJourneySteps } = await collections();
  const step = await customerJourneySteps.findOne({ _id: parseId(p.stepId), customerJourneyId: parseId(p.id) });
  if (!step) throw new HttpError(404, "Schritt nicht gefunden");
  return step;
}

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const step = await requireStep(ctx);
  const { customerFeedbacks } = await collections();
  const list = await customerFeedbacks.find({ customerJourneyStepId: step._id }).sort({ createdAt: 1 }).toArray();
  return Response.json(list.map(toFeedbackView), { headers: NO_STORE });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const step = await requireStep(ctx);
  const input = await readJson(req, customerFeedbackInput);
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    customerJourneyStepId: step._id,
    customerJourneyId: step.customerJourneyId,
    customerId: step.customerId,
    ...input,
    createdBy: user._id,
    createdAt: now,
    updatedAt: now,
  };
  const { customerFeedbacks } = await collections();
  await customerFeedbacks.insertOne(doc);
  return Response.json(toFeedbackView(doc), { status: 201, headers: NO_STORE });
});
