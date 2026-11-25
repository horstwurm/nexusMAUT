import { requireUser } from "@/lib/server/auth";
import { startEventJourneys } from "@/lib/server/events";
import { NO_STORE, parseId, route } from "@/lib/server/http";

// POST /api/events/ID/start – «Journeys starten»: the event's journey for every customer
// named in its last service call (editors). Customers with an active run are skipped,
// unknown customer numbers reported; the result is stored as `lastStart`. Answers the event.

export const maxDuration = 60;

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  return Response.json(await startEventJourneys(parseId((await ctx.params).id), user._id), { headers: NO_STORE });
});
