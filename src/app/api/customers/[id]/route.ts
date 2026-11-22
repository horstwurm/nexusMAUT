import { dayToDb } from "@/lib/customers";
import { requireUser } from "@/lib/server/auth";
import { parseCustomerAttributes, toCustomer } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerInput } from "@/lib/server/schemas";
import { refreshCustomer } from "@/lib/server/serviceAttributes";

// GET    /api/customers/ID – one customer
// PATCH  /api/customers/ID – change { name, lastname, dateOfBirth, attributes? } (attributes omitted = kept)
// DELETE /api/customers/ID – remove

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const id = parseId((await ctx.params).id);
  const { customers } = await collections();
  const doc = await customers.findOne({ _id: id });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toCustomer(doc), { headers: NO_STORE });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const id = parseId((await ctx.params).id);
  const { attributes, ...input } = await readJson(req, customerInput);
  const { customers } = await collections();
  const doc = await customers.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        ...input,
        dateOfBirth: dayToDb(input.dateOfBirth),
        ...(attributes && { attributes: await parseCustomerAttributes(attributes) }),
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  await refreshCustomer(id); // «Service» customer attributes (the PUT values may have changed)
  return Response.json(toCustomer((await customers.findOne({ _id: id }))!), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const id = parseId((await ctx.params).id);
  const { customers, customerProducts, customerComPrefs, customerPositions, positionTransactions, customerJourneys, customerJourneySteps, customerFeedbacks } = await collections();
  const res = await customers.deleteOne({ _id: id });
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  // relations go with the customer
  await Promise.all([
    customerProducts.deleteMany({ customerId: id }),
    customerComPrefs.deleteMany({ customerId: id }),
    customerPositions.deleteMany({ customerId: id }),
    positionTransactions.deleteMany({ customerId: id }),
    customerJourneys.deleteMany({ customerId: id }),
    customerJourneySteps.deleteMany({ customerId: id }),
    customerFeedbacks.deleteMany({ customerId: id }),
  ]);
  return new Response(null, { status: 204 });
});
