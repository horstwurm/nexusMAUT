import { requireUser } from "@/lib/server/auth";
import { toFeedbackView } from "@/lib/server/customerJourneys";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerFeedbackInput } from "@/lib/server/schemas";

// PUT    /api/customer-journeys/ID/steps/SID/feedbacks/FID { feedback, feedbackComment?, feedbackRating? } (editors)
// DELETE /api/customer-journeys/ID/steps/SID/feedbacks/FID (editors)

type Ctx = { params: Promise<{ id: string; stepId: string; feedbackId: string }> };

const filterOf = async (ctx: Ctx) => {
  const p = await ctx.params;
  return { _id: parseId(p.feedbackId), customerJourneyStepId: parseId(p.stepId), customerJourneyId: parseId(p.id) };
};

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const filter = await filterOf(ctx);
  const input = await readJson(req, customerFeedbackInput);
  const { customerFeedbacks } = await collections();
  const doc = await customerFeedbacks.findOneAndUpdate(filter, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toFeedbackView(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { customerFeedbacks } = await collections();
  const res = await customerFeedbacks.deleteOne(await filterOf(ctx));
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
