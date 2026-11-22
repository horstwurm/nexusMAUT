import { requireUser } from "@/lib/server/auth";
import { journeyRunCounts } from "@/lib/server/customerJourneys";
import { NO_STORE, route } from "@/lib/server/http";

// GET /api/customer-journeys/summary – per journey: { journeyId, active, done, cancelled } (editors)
// (counts for the journey list on the KundenJourneys page)

export const GET = route(async () => {
  await requireUser();
  return Response.json(await journeyRunCounts(), { headers: NO_STORE });
});
