import { ObjectId } from "mongodb";
import { parsePosition } from "@/lib/positions";
import { requireUser } from "@/lib/server/auth";
import { attributeDefsOf, requireCustomer, toCustomerPosition, toCustomerPositions } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { assertDomainValue } from "@/lib/server/domains";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerPositionInput } from "@/lib/server/schemas";
import { refreshPosition } from "@/lib/server/serviceAttributes";

// Positions of a customer: a product/service type and values of that type's
// position attributes (productServiceTypePositionAttributes).
// GET  /api/customers/ID/positions – list in order, with transactionCount
// POST /api/customers/ID/positions { productServiceType, values: { ATTRIBUTE_ID: value } } – add

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const customer = await requireCustomer(parseId((await ctx.params).id));
  const { customerPositions } = await collections();
  const list = await customerPositions.find({ customerId: customer._id }).sort({ sort: 1, createdAt: 1 }).toArray();
  return Response.json(await toCustomerPositions(list), { headers: NO_STORE });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const customer = await requireCustomer(parseId((await ctx.params).id));
  const { productServiceType, values: input } = await readJson(req, customerPositionInput);
  await assertDomainValue("productServiceType", productServiceType);
  const defs = await attributeDefsOf(productServiceType);
  if (!defs.length) throw new HttpError(400, "Für diesen Typ sind keine Positionsattribute definiert");
  const parsed = parsePosition(defs, input);
  if ("error" in parsed) throw new HttpError(400, parsed.error);
  const { customerPositions } = await collections();
  const last = await customerPositions.find({ customerId: customer._id }).sort({ sort: -1 }).limit(1).next();
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    customerId: customer._id,
    productServiceType,
    values: parsed.values,
    sort: last ? last.sort + 10 : 10,
    createdAt: now,
    updatedAt: now,
  };
  await customerPositions.insertOne(doc);
  await refreshPosition(doc._id); // «Service» position attributes
  return Response.json({ ...toCustomerPosition((await customerPositions.findOne({ _id: doc._id }))!), transactionCount: 0 }, { status: 201, headers: NO_STORE });
});
