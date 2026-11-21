import { ObjectId, type Filter } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { assignJourney, toCustomerJourneyViews } from "@/lib/server/customerJourneys";
import { collections, type CustomerJourneyDoc } from "@/lib/server/db";
import { NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { assignJourneyInput } from "@/lib/server/schemas";

// KundenJourneys (journeys of customers).
// GET  /api/customer-journeys?journeyId=&status=&customerId=&q=&limit= – newest first (editors)
// POST /api/customer-journeys { journeyId, customerIds? | ruleId? } – assign; customers with
//      an active run of that journey are skipped → { created, skipped, matched } (editors)

export const maxDuration = 60;

export const GET = route(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const filter: Filter<CustomerJourneyDoc> = {};
  const journeyId = params.get("journeyId");
  if (journeyId) filter.journeyId = parseId(journeyId);
  const customerId = params.get("customerId");
  if (customerId) filter.customerId = parseId(customerId);
  const status = params.get("status");
  if (status === "active" || status === "done" || status === "cancelled") filter.status = status;
  const { customerJourneys, customers } = await collections();
  const q = params.get("q")?.trim();
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const ids = (await customers.find({ $or: [{ name: rx }, { lastname: rx }] }, { projection: { _id: 1 } }).toArray()).map((c) => c._id);
    filter.customerId = filter.customerId ? (ids.some((i) => i.equals(filter.customerId as ObjectId)) ? filter.customerId : { $in: [] }) : { $in: ids };
  }
  const limit = Math.min(Number(params.get("limit")) || 500, 2000);
  const list = await customerJourneys.find(filter).sort({ startedAt: -1, _id: -1 }).limit(limit).toArray();
  return Response.json(await toCustomerJourneyViews(list), { headers: NO_STORE });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = await readJson(req, assignJourneyInput);
  const result = await assignJourney({
    journeyId: parseId(input.journeyId),
    customerIds: input.customerIds?.map((i) => new ObjectId(i)),
    ruleId: input.ruleId ? parseId(input.ruleId) : undefined,
    userId: user._id,
  });
  return Response.json(result, { status: 201, headers: NO_STORE });
});
