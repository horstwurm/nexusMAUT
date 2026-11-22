import { requireUser } from "@/lib/server/auth";
import { checkData } from "@/lib/server/customerJourneys";
import { NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { dataCheckInput } from "@/lib/server/schemas";

// POST /api/customer-journeys/check { journeyId } | { customerJourneyId } – «Daten prüfen»:
// renders the open steps of the active runs for their customers and sets each step's
// dataStatus (ok / error = «Datenfehler» with the problems). → { runs, steps, ok, errors, failed }
// Editors. Services used in the steps are called (once per customer).

export const maxDuration = 300;

export const POST = route(async (req: Request) => {
  await requireUser();
  const input = await readJson(req, dataCheckInput);
  const result = await checkData({
    journeyId: input.journeyId ? parseId(input.journeyId) : undefined,
    customerJourneyId: input.customerJourneyId ? parseId(input.customerJourneyId) : undefined,
  });
  return Response.json(result, { headers: NO_STORE });
});
