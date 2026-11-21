import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { requireCustomer, toCustomerProduct } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { assertDomainValue } from "@/lib/server/domains";
import { NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerProductInput } from "@/lib/server/schemas";

// GET  /api/customers/ID/products – the customer's products and services
// POST /api/customers/ID/products { name, productServiceType } – add one

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const customer = await requireCustomer(parseId((await ctx.params).id));
  const { customerProducts } = await collections();
  const list = await customerProducts
    .find({ customerId: customer._id }, { collation: { locale: "de" } })
    .sort({ name: 1 })
    .toArray();
  return Response.json(list.map(toCustomerProduct), { headers: NO_STORE });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const customer = await requireCustomer(parseId((await ctx.params).id));
  const input = await readJson(req, customerProductInput);
  await assertDomainValue("productServiceType", input.productServiceType);
  const now = new Date();
  const doc = { _id: new ObjectId(), customerId: customer._id, ...input, createdAt: now, updatedAt: now };
  const { customerProducts } = await collections();
  await customerProducts.insertOne(doc);
  return Response.json(toCustomerProduct(doc), { status: 201, headers: NO_STORE });
});
