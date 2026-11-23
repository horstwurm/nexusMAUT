import { ObjectId } from "mongodb";
import { actionOfKey, bearerOf } from "@/lib/server/apiKeys";
import { requireUser } from "@/lib/server/auth";
import { toFeedbackView } from "@/lib/server/customerJourneys";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerFeedbackInput } from "@/lib/server/schemas";

// Customer feedback on a KundenJourney step (relation customerFeedback).
// GET  /api/customer-journeys/ID/steps/SID/feedbacks – oldest first (editors)
// POST /api/customer-journeys/ID/steps/SID/feedbacks { feedback, feedbackComment?, feedbackRating? 1–5 | null }
//      editors (session) – or the system carrying out the step's action with that
//      action's API key: `Authorization: Bearer nxm_…` (Admin → Aktionen)

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
  const key = bearerOf(req);
  let createdBy: string;
  const keyAction = key ? await actionOfKey(key) : null;
  if (!keyAction) createdBy = (await requireUser())._id;
  else createdBy = `action:${keyAction._id.toHexString()}`;
  const step = await requireStep(ctx);
  if (keyAction && !step.actionId.equals(keyAction._id)) {
    throw new HttpError(403, `Der API-Schlüssel gehört zur Aktion «${keyAction.name}» – dieser Schritt hat eine andere Aktion`);
  }
  const input = await readJson(req, customerFeedbackInput);
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    customerJourneyStepId: step._id,
    customerJourneyId: step.customerJourneyId,
    customerId: step.customerId,
    ...input,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const { customerFeedbacks } = await collections();
  await customerFeedbacks.insertOne(doc);
  return Response.json(toFeedbackView(doc), { status: 201, headers: NO_STORE });
});
