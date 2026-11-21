import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, route } from "@/lib/server/http";
import { loadRuleDataset, matchingCustomers } from "@/lib/server/rules";

// GET /api/rules/ID/matches – all customers matching the saved rule
//     [{ id, name, lastname, dateOfBirth }], in name order

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { rules } = await collections();
  const doc = await rules.findOne({ _id: parseId((await ctx.params).id) });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  const list = matchingCustomers(doc, await loadRuleDataset());
  return Response.json(
    list.map((c) => ({ id: c.id.toHexString(), name: c.name, lastname: c.lastname, dateOfBirth: c.dateOfBirth })),
    { headers: NO_STORE },
  );
});
