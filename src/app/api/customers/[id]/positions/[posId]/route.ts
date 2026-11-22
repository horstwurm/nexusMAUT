import { z } from "zod";
import { parsePosition } from "@/lib/positions";
import { requireUser } from "@/lib/server/auth";
import { attributeDefsOf, toCustomerPosition } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { assertDomainValue } from "@/lib/server/domains";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerPositionInput } from "@/lib/server/schemas";
import { refreshPosition } from "@/lib/server/serviceAttributes";

// PUT    /api/customers/ID/positions/POS { productServiceType, values } – replace (a new
//        type is fine while there are no transactions: the values are checked against its attributes)
// PATCH  /api/customers/ID/positions/POS { sort } – reorder
// DELETE /api/customers/ID/positions/POS – with its transactions

type Ctx = { params: Promise<{ id: string; posId: string }> };

async function filterOf(ctx: Ctx) {
  const p = await ctx.params;
  return { _id: parseId(p.posId), customerId: parseId(p.id) };
}

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const filter = await filterOf(ctx);
  const { productServiceType, values: input } = await readJson(req, customerPositionInput);
  const { customerPositions } = await collections();
  const before = await customerPositions.findOne(filter);
  if (!before) throw new HttpError(404, "Nicht gefunden");
  await assertDomainValue("productServiceType", productServiceType, before.productServiceType);
  if (productServiceType !== before.productServiceType) {
    // the transactions hold values of the old type's transaction attributes
    const { positionTransactions } = await collections();
    const n = await positionTransactions.countDocuments({ positionId: before._id });
    if (n > 0) throw new HttpError(409, `Der Typ kann nicht geändert werden – es gibt ${n} Transaktion${n === 1 ? "" : "en"}`);
  }
  const parsed = parsePosition(await attributeDefsOf(productServiceType), input);
  if ("error" in parsed) throw new HttpError(400, parsed.error);
  const doc = await customerPositions.findOneAndUpdate(
    filter,
    { $set: { productServiceType, values: parsed.values, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  await refreshPosition(doc._id); // «Service» position attributes
  return Response.json(toCustomerPosition((await customerPositions.findOne({ _id: doc._id }))!), { headers: NO_STORE });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const filter = await filterOf(ctx);
  const { sort } = await readJson(req, z.object({ sort: z.number().int().min(0).max(1_000_000) }));
  const { customerPositions } = await collections();
  const doc = await customerPositions.findOneAndUpdate(filter, { $set: { sort, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toCustomerPosition(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const filter = await filterOf(ctx);
  const { customerPositions, positionTransactions } = await collections();
  const res = await customerPositions.deleteOne(filter);
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  await positionTransactions.deleteMany({ positionId: filter._id }); // its transactions go with it
  return new Response(null, { status: 204 });
});
