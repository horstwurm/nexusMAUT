import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, route } from "@/lib/server/http";
import { rulesOfAction, testResult } from "@/lib/server/stepContent";
import { previewStep } from "@/lib/server/stepPreview";

// POST /api/customer-journeys/ID/steps/SID/test – the step's content (as copied at
// assignment) rendered for the run's customer, placeholders filled, services called.
// Changes nothing (the step keeps its status). Editors. → { customer, segments, services, rules, content, html }

export const maxDuration = 60;

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string; stepId: string }> }) => {
  await requireUser();
  const p = await ctx.params;
  const { customerJourneys, customerJourneySteps } = await collections();
  const run = await customerJourneys.findOne({ _id: parseId(p.id) });
  if (!run) throw new HttpError(404, "KundenJourney nicht gefunden");
  const step = await customerJourneySteps.findOne({ _id: parseId(p.stepId), customerJourneyId: run._id });
  if (!step) throw new HttpError(404, "Schritt nicht gefunden");
  const rules = await rulesOfAction(step.actionId);
  const preview = await previewStep(step.template, run.customerId, undefined, rules.contentFormat);
  return Response.json(testResult(preview, rules), { headers: NO_STORE });
});
