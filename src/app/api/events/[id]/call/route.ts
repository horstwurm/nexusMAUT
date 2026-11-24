import { requireUser } from "@/lib/server/auth";
import { callEventService } from "@/lib/server/events";
import { NO_STORE, parseId, route } from "@/lib/server/http";

// POST /api/events/ID/call – calls the event's trigger service now (GET, no input
// values) and stores the result as the event's `lastCall` (editors; KundenJourneys →
// Events → «Service jetzt aufrufen»). Answers the event; service problems are part
// of `lastCall`, not an error status.

export const maxDuration = 30;

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  return Response.json(await callEventService(parseId((await ctx.params).id), user._id), { headers: NO_STORE });
});
