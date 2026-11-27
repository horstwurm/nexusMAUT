import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { rulesOfAction, testResult } from "@/lib/server/stepContent";
import { previewStep } from "@/lib/server/stepPreview";

// POST /api/journeys/ID/steps/SID/test { customerId, content? } – the step's
// content (or an unsaved `content`) rendered for one customer, placeholders
// filled; services used in it are called (admins). Answers
// { customer, segments, services, rules, content, html } – see stepPreview.ts for the
// rules, stepContent.ts for the formatted text (the action's content format).

export const maxDuration = 60;

const testInput = z.object({
  customerId: z.string().regex(/^[0-9a-f]{24}$/, "Kunde wählen"),
  content: z.string().max(10_000).optional(),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string; stepId: string }> }) => {
  await requireUser("admin");
  const p = await ctx.params;
  const { customerId, content } = await readJson(req, testInput);
  const { journeySteps } = await collections();
  const step = await journeySteps.findOne({ _id: parseId(p.stepId), journeyId: parseId(p.id) });
  if (!step) throw new HttpError(404, "Schritt nicht gefunden");
  const rules = await rulesOfAction(step.actionId);
  const preview = await previewStep(content ?? step.content ?? "", parseId(customerId), undefined, rules.contentFormat);
  return Response.json(testResult(preview, rules), { headers: NO_STORE });
});
