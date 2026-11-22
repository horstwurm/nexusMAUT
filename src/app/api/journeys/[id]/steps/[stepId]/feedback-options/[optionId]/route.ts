import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { toFeedbackOption } from "@/lib/server/journeys";
import { feedbackOptionInput } from "@/lib/server/schemas";

// PUT    /api/journeys/ID/steps/SID/feedback-options/OID { option, meaning } – change (admins)
// PATCH  /api/journeys/ID/steps/SID/feedback-options/OID { sort } – reorder (admins)
// DELETE /api/journeys/ID/steps/SID/feedback-options/OID (admins)

type Ctx = { params: Promise<{ id: string; stepId: string; optionId: string }> };

async function filterOf(ctx: Ctx) {
  const p = await ctx.params;
  return { _id: parseId(p.optionId), stepId: parseId(p.stepId), journeyId: parseId(p.id) };
}

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const filter = await filterOf(ctx);
  const input = await readJson(req, feedbackOptionInput);
  const { feedbackOptions } = await collections();
  let doc;
  try {
    doc = await feedbackOptions.findOneAndUpdate(
      filter,
      { $set: { option: input.option, meaning: input.meaning, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Die Option «${input.option}» gibt es bei diesem Schritt schon`);
    throw err;
  }
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toFeedbackOption(doc), { headers: NO_STORE });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const filter = await filterOf(ctx);
  const { sort } = await readJson(req, z.object({ sort: z.number().int().min(0).max(1_000_000) }));
  const { feedbackOptions } = await collections();
  const doc = await feedbackOptions.findOneAndUpdate(filter, { $set: { sort, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toFeedbackOption(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { feedbackOptions } = await collections();
  const res = await feedbackOptions.deleteOne(await filterOf(ctx));
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
