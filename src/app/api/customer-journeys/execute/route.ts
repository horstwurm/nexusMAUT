import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { executeJourney, executionPreview } from "@/lib/server/execute";
import { NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { requireJourney } from "@/lib/server/journeys";

// «Ausführen» on the KundenJourneys page (editors).
// GET  /api/customer-journeys/execute?journeyId=… – what would be sent (steps «Bereit zur Ausführung»)
// POST /api/customer-journeys/execute { journeyId } – render and send them to their action's URL

export const maxDuration = 60;

export const GET = route(async (req: Request) => {
  await requireUser();
  const journey = await requireJourney(parseId(new URL(req.url).searchParams.get("journeyId") ?? ""));
  return Response.json(await executionPreview(journey._id), { headers: NO_STORE });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { journeyId } = await readJson(req, z.object({ journeyId: z.string().max(40) }));
  const journey = await requireJourney(parseId(journeyId));
  return Response.json(await executeJourney(journey._id, user._id), { headers: NO_STORE });
});
