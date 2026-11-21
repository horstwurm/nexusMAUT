import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { requireCustomer, toCustomerComPref } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { assertDomainValue } from "@/lib/server/domains";
import { NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerComPrefInput } from "@/lib/server/schemas";

// GET  /api/customers/ID/communication-preferences – the customer's preferences
// POST /api/customers/ID/communication-preferences { usageInstruction, comPrefType } – add one

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const customer = await requireCustomer(parseId((await ctx.params).id));
  const { customerComPrefs } = await collections();
  const list = await customerComPrefs.find({ customerId: customer._id }).sort({ createdAt: 1 }).toArray();
  return Response.json(list.map(toCustomerComPref), { headers: NO_STORE });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const customer = await requireCustomer(parseId((await ctx.params).id));
  const input = await readJson(req, customerComPrefInput);
  await assertDomainValue("comPrefs", input.comPrefType);
  const now = new Date();
  const doc = { _id: new ObjectId(), customerId: customer._id, ...input, createdAt: now, updatedAt: now };
  const { customerComPrefs } = await collections();
  await customerComPrefs.insertOne(doc);
  return Response.json(toCustomerComPref(doc), { status: 201, headers: NO_STORE });
});
