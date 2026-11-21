import { requireUser } from "@/lib/server/auth";
import { toCustomerJourneyViews, toStepViews, updateRunStatus } from "@/lib/server/customerJourneys";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerJourneyPatch } from "@/lib/server/schemas";

// GET    /api/customer-journeys/ID – the run with its steps (editors)
// PATCH  /api/customer-journeys/ID { status: "cancelled" | "active" } – cancel / reactivate (editors)
// DELETE /api/customer-journeys/ID – with its steps (editors)

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { customerJourneys, customerJourneySteps } = await collections();
  const run = await customerJourneys.findOne({ _id: parseId((await ctx.params).id) });
  if (!run) throw new HttpError(404, "Nicht gefunden");
  const steps = await customerJourneySteps.find({ customerJourneyId: run._id }).sort({ sort: 1 }).toArray();
  const [view] = await toCustomerJourneyViews([run]);
  return Response.json({ ...view, steps: await toStepViews(steps) }, { headers: NO_STORE });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const id = parseId((await ctx.params).id);
  const { status } = await readJson(req, customerJourneyPatch);
  const { customerJourneys } = await collections();
  const run = await customerJourneys.findOne({ _id: id });
  if (!run) throw new HttpError(404, "Nicht gefunden");
  const now = new Date();
  if (status === "cancelled") {
    await customerJourneys.updateOne({ _id: id }, { $set: { status: "cancelled", completedAt: now, updatedAt: now } });
  } else if (run.status === "cancelled") {
    // reactivate: active again (or done, if all steps are finished)
    try {
      await customerJourneys.updateOne({ _id: id }, { $set: { status: "active", completedAt: null, updatedAt: now } });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new HttpError(409, "Der Kunde hat diese Journey bereits aktiv");
      throw err;
    }
    await updateRunStatus(id);
  }
  const [view] = await toCustomerJourneyViews([(await customerJourneys.findOne({ _id: id }))!]);
  return Response.json(view, { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const id = parseId((await ctx.params).id);
  const { customerJourneys, customerJourneySteps } = await collections();
  const res = await customerJourneys.deleteOne({ _id: id });
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  await customerJourneySteps.deleteMany({ customerJourneyId: id });
  return new Response(null, { status: 204 });
});
