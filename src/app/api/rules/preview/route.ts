import { requireUser } from "@/lib/server/auth";
import { NO_STORE, readJson, route } from "@/lib/server/http";
import { loadRuleDataset, matchingCustomers } from "@/lib/server/rules";
import { ruleInput } from "@/lib/server/schemas";

// POST /api/rules/preview { match, conditions } – matches of an unsaved rule
//      (the editor's «Treffer prüfen»): { count, customers: first 50 }

const LIMIT = 50;

export const POST = route(async (req: Request) => {
  await requireUser();
  const rule = await readJson(req, ruleInput.partial({ name: true }));
  const ds = await loadRuleDataset();
  const list = matchingCustomers(rule, ds);
  return Response.json(
    {
      count: list.length,
      customers: list.slice(0, LIMIT).map((c) => ({ id: c.id.toHexString(), name: c.name, lastname: c.lastname, dateOfBirth: c.dateOfBirth })),
    },
    { headers: NO_STORE },
  );
});
