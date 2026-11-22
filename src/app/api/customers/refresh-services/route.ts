import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { refreshCustomers } from "@/lib/server/serviceAttributes";

// POST /api/customers/refresh-services { customerIds? } – «Daten aktualisieren» on the
// Kunden list: fetches the «Service» attributes of these customers (omitted = all)
// with their positions and transactions again (editors).
// → { customers, records, values, errors, messages }

export const maxDuration = 300;

const input = z.object({ customerIds: z.array(z.string()).max(5000).optional() });

export const POST = route(async (req: Request) => {
  await requireUser();
  const { customerIds } = await readJson(req, input);
  return Response.json(await refreshCustomers(customerIds?.map(parseId)), { headers: NO_STORE });
});
