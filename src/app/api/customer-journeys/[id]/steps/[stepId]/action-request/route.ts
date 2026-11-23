import { requireUser } from "@/lib/server/auth";
import { actionRequest } from "@/lib/server/execute";
import { NO_STORE, parseId, route } from "@/lib/server/http";

// POST /api/customer-journeys/ID/steps/SID/action-request – the request that
// hands this step to its action (shown in «API»): POST to the action's URL with
// the step content for the customer as JSON (done: the stored content; otherwise
// the template rendered now – services may be called). Changes and sends
// nothing. Editors. → { action: { name, url }, contentSource, body }

export const maxDuration = 60;

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string; stepId: string }> }) => {
  await requireUser();
  const p = await ctx.params;
  return Response.json(await actionRequest(parseId(p.id), parseId(p.stepId)), { headers: NO_STORE });
});
