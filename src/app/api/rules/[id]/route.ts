import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { loadRuleDataset, matchingCustomers, toRuleView } from "@/lib/server/rules";
import { ruleInput } from "@/lib/server/schemas";

// GET    /api/rules/ID – one rule with its number of matches
// PUT    /api/rules/ID { name, description?, match, conditions } – replace
// DELETE /api/rules/ID

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { rules } = await collections();
  const doc = await rules.findOne({ _id: parseId((await ctx.params).id) });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toRuleView(doc, matchingCustomers(doc, await loadRuleDataset()).length), { headers: NO_STORE });
});

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const input = await readJson(req, ruleInput);
  const { rules } = await collections();
  const doc = await rules.findOneAndUpdate(
    { _id: parseId((await ctx.params).id) },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toRuleView(doc, matchingCustomers(doc, await loadRuleDataset()).length), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { rules } = await collections();
  const res = await rules.deleteOne({ _id: parseId((await ctx.params).id) });
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
