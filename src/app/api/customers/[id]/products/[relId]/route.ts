import { requireUser } from "@/lib/server/auth";
import { toCustomerProduct } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { assertDomainValue } from "@/lib/server/domains";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerProductInput } from "@/lib/server/schemas";

// PATCH  /api/customers/ID/products/PID { name, productServiceType }
// DELETE /api/customers/ID/products/PID

type Ctx = { params: Promise<{ id: string; relId: string }> };

async function ids(ctx: Ctx) {
  const p = await ctx.params;
  return { _id: parseId(p.relId), customerId: parseId(p.id) };
}

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const filter = await ids(ctx);
  const input = await readJson(req, customerProductInput);
  const { customerProducts } = await collections();
  const before = await customerProducts.findOne(filter);
  if (!before) throw new HttpError(404, "Nicht gefunden");
  await assertDomainValue("productServiceType", input.productServiceType, before.productServiceType);
  const doc = await customerProducts.findOneAndUpdate(
    filter,
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toCustomerProduct(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const filter = await ids(ctx);
  const { customerProducts } = await collections();
  const res = await customerProducts.deleteOne(filter);
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
