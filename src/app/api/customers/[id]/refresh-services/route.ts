import { requireUser } from "@/lib/server/auth";
import { NO_STORE, parseId, route } from "@/lib/server/http";
import { refreshCustomer } from "@/lib/server/serviceAttributes";

// POST /api/customers/ID/refresh-services – fetches the customer's «Service»
// attributes and those of its positions and transactions again (editors).
// → { records, values, errors, messages }

export const maxDuration = 120;

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser();
  return Response.json(await refreshCustomer(parseId((await ctx.params).id), true), { headers: NO_STORE });
});
