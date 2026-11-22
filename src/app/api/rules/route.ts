import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { NO_STORE, readJson, route } from "@/lib/server/http";
import { loadRuleDataset, matchingCustomers, toRuleView } from "@/lib/server/rules";
import { ruleInput } from "@/lib/server/schemas";

// GET  /api/rules – all rules with their number of matching customers
// POST /api/rules { name, description?, match, conditions } – new rule

export const GET = route(async () => {
  await requireUser();
  const { rules } = await collections();
  const list = await rules.find({}, { collation: { locale: "de" } }).sort({ name: 1 }).toArray();
  const ds = await loadRuleDataset();
  return Response.json(
    list.map((r) => toRuleView(r, matchingCustomers(r, ds).length)),
    { headers: NO_STORE },
  );
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const input = await readJson(req, ruleInput);
  const now = new Date();
  const doc = { _id: new ObjectId(), ...input, createdBy: user._id, createdAt: now, updatedAt: now };
  const { rules } = await collections();
  await rules.insertOne(doc);
  return Response.json(toRuleView(doc, matchingCustomers(doc, await loadRuleDataset()).length), { status: 201, headers: NO_STORE });
});
