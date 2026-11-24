import { ObjectId } from "mongodb";
import { MANUAL_SOURCE_NAME } from "@/lib/uploads";
import { dayToDb } from "@/lib/customers";
import { requireUser } from "@/lib/server/auth";
import { parseCustomerAttributes, toCustomer } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { NO_STORE, readJson, route } from "@/lib/server/http";
import { customerInput } from "@/lib/server/schemas";
import { refreshCustomer } from "@/lib/server/serviceAttributes";

// GET  /api/customers?q=&limit= – list, sorted by last name, with positionCount
// POST /api/customers           – create { name, lastname, dateOfBirth: "YYYY-MM-DD", attributes?: { ATTR_ID: value } }

export const GET = route(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const limit = Math.min(Number(params.get("limit")) || 200, 1000);
  const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
  const { customers, customerPositions } = await collections();
  const list = await customers
    .find(rx ? { $or: [{ name: rx }, { lastname: rx }] } : {}, { collation: { locale: "de" } })
    .sort({ lastname: 1, name: 1 })
    .limit(limit)
    .toArray();
  const counts = await customerPositions
    .aggregate<{ _id: ObjectId; n: number }>([
      { $match: { customerId: { $in: list.map((c) => c._id) } } },
      { $group: { _id: "$customerId", n: { $sum: 1 } } },
    ])
    .toArray();
  const countOf = new Map(counts.map((c) => [c._id.toHexString(), c.n]));
  return Response.json(
    list.map((c) => ({ ...toCustomer(c), positionCount: countOf.get(c._id.toHexString()) ?? 0 })),
    { headers: NO_STORE },
  );
});

export const POST = route(async (req: Request) => {
  await requireUser();
  const { attributes, ...input } = await readJson(req, customerInput);
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    ...input,
    dateOfBirth: dayToDb(input.dateOfBirth),
    attributes: attributes ? await parseCustomerAttributes(attributes) : {},
    uploadName: MANUAL_SOURCE_NAME, // entered by hand
    uploadDate: now,
    createdAt: now,
    updatedAt: now,
  };
  const { customers } = await collections();
  await customers.insertOne(doc);
  await refreshCustomer(doc._id); // «Service» customer attributes
  return Response.json(toCustomer((await customers.findOne({ _id: doc._id }))!), { status: 201, headers: NO_STORE });
});
