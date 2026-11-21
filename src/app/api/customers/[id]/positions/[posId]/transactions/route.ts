import { ObjectId } from "mongodb";
import { parsePosition } from "@/lib/positions";
import { requireUser } from "@/lib/server/auth";
import { attributeDefsOf, requireCustomerPosition, toPositionTransaction } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { transactionInput } from "@/lib/server/schemas";

// Transactions of a customer position: values of the transaction attributes
// (productServiceTypeTrxAttributes) of the position's type.
// GET  /api/customers/ID/positions/POS/transactions – list in order
// POST /api/customers/ID/positions/POS/transactions { values: { TRX_ATTRIBUTE_ID: value } } – add

type Ctx = { params: Promise<{ id: string; posId: string }> };

async function positionOf(ctx: Ctx) {
  const p = await ctx.params;
  return requireCustomerPosition(parseId(p.id), parseId(p.posId));
}

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const position = await positionOf(ctx);
  const { positionTransactions } = await collections();
  const list = await positionTransactions.find({ positionId: position._id }).sort({ sort: 1, createdAt: 1 }).toArray();
  return Response.json(list.map(toPositionTransaction), { headers: NO_STORE });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const position = await positionOf(ctx);
  const { values: input } = await readJson(req, transactionInput);
  const defs = await attributeDefsOf(position.productServiceType, "trx");
  if (!defs.length) throw new HttpError(400, "Für diesen Typ sind keine Transaktionsattribute definiert");
  const parsed = parsePosition(defs, input);
  if ("error" in parsed) throw new HttpError(400, parsed.error);
  const { positionTransactions } = await collections();
  const last = await positionTransactions.find({ positionId: position._id }).sort({ sort: -1 }).limit(1).next();
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    positionId: position._id,
    customerId: position.customerId,
    values: parsed.values,
    sort: last ? last.sort + 10 : 10,
    createdAt: now,
    updatedAt: now,
  };
  await positionTransactions.insertOne(doc);
  return Response.json(toPositionTransaction(doc), { status: 201, headers: NO_STORE });
});
