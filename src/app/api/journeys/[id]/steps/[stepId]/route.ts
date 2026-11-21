import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { assertAction, toStep } from "@/lib/server/journeys";
import { journeyStepInput } from "@/lib/server/schemas";

// PUT    /api/journeys/ID/steps/SID { actionId, content? } – change (admins)
// PATCH  /api/journeys/ID/steps/SID { sort } – reorder (admins)
// DELETE /api/journeys/ID/steps/SID (admins)

type Ctx = { params: Promise<{ id: string; stepId: string }> };

async function filterOf(ctx: Ctx) {
  const p = await ctx.params;
  return { _id: parseId(p.stepId), journeyId: parseId(p.id) };
}

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const filter = await filterOf(ctx);
  const input = await readJson(req, journeyStepInput);
  const { journeySteps } = await collections();
  const before = await journeySteps.findOne(filter);
  if (!before) throw new HttpError(404, "Nicht gefunden");
  const actionId = parseId(input.actionId);
  if (!actionId.equals(before.actionId)) await assertAction(actionId);
  const doc = await journeySteps.findOneAndUpdate(
    filter,
    { $set: { actionId, content: input.content, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toStep(doc), { headers: NO_STORE });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const filter = await filterOf(ctx);
  const { sort } = await readJson(req, z.object({ sort: z.number().int().min(0).max(1_000_000) }));
  const { journeySteps } = await collections();
  const doc = await journeySteps.findOneAndUpdate(filter, { $set: { sort, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toStep(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { journeySteps } = await collections();
  const res = await journeySteps.deleteOne(await filterOf(ctx));
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
