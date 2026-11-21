import { requireUser } from "@/lib/server/auth";
import { setStepStatus, toCustomerJourneyViews, toStepViews } from "@/lib/server/customerJourneys";
import { collections } from "@/lib/server/db";
import { NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerJourneyStepPatch } from "@/lib/server/schemas";

// PATCH /api/customer-journeys/ID/steps/SID { status: open | done | skipped, note? } (editors)
//       «done» renders the step's content for the customer (placeholders filled,
//       services called) and keeps it; the run's status follows its steps.
//       Answers the updated run with its steps.

export const maxDuration = 60;

export const PATCH = route(async (req: Request, ctx: { params: Promise<{ id: string; stepId: string }> }) => {
  await requireUser();
  const p = await ctx.params;
  const runId = parseId(p.id);
  const { status, note } = await readJson(req, customerJourneyStepPatch);
  await setStepStatus(runId, parseId(p.stepId), status, note);
  const { customerJourneys, customerJourneySteps } = await collections();
  const run = (await customerJourneys.findOne({ _id: runId }))!;
  const [view] = await toCustomerJourneyViews([run]);
  const steps = await customerJourneySteps.find({ customerJourneyId: runId }).sort({ sort: 1 }).toArray();
  return Response.json({ ...view, steps: await toStepViews(steps) }, { headers: NO_STORE });
});
