import { z } from "zod";
import { parsePosition } from "@/lib/positions";
import { requireUser } from "@/lib/server/auth";
import { attributeDefsOf, requireCustomerPosition, toPositionTransaction } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { transactionInput } from "@/lib/server/schemas";
import { refreshTransaction } from "@/lib/server/serviceAttributes";

// PUT    /api/customers/ID/positions/POS/transactions/TRX { values } – replace the values
// PATCH  /api/customers/ID/positions/POS/transactions/TRX { sort } – reorder
// DELETE /api/customers/ID/positions/POS/transactions/TRX

type Ctx = { params: Promise<{ id: string; posId: string; trxId: string }> };

async function target(ctx: Ctx) {
  const p = await ctx.params;
  const position = await requireCustomerPosition(parseId(p.id), parseId(p.posId));
  return { position, filter: { _id: parseId(p.trxId), positionId: position._id } };
}

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const { position, filter } = await target(ctx);
  const { values: input } = await readJson(req, transactionInput);
  const parsed = parsePosition(await attributeDefsOf(position.productServiceType, "trx"), input);
  if ("error" in parsed) throw new HttpError(400, parsed.error);
  const { positionTransactions } = await collections();
  const doc = await positionTransactions.findOneAndUpdate(
    filter,
    { $set: { values: parsed.values, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  await refreshTransaction(doc._id); // «Service» transaction attributes
  return Response.json(toPositionTransaction((await positionTransactions.findOne({ _id: doc._id }))!), { headers: NO_STORE });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const { filter } = await target(ctx);
  const { sort } = await readJson(req, z.object({ sort: z.number().int().min(0).max(1_000_000) }));
  const { positionTransactions } = await collections();
  const doc = await positionTransactions.findOneAndUpdate(filter, { $set: { sort, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toPositionTransaction(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { filter } = await target(ctx);
  const { positionTransactions } = await collections();
  const res = await positionTransactions.deleteOne(filter);
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
