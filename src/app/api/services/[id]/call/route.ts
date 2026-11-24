import { z } from "zod";
import { parseAttributeValues } from "@/lib/positions";
import { requireUser } from "@/lib/server/auth";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { callService } from "@/lib/server/serviceCaller";
import { requireService, serviceAttributeDefs } from "@/lib/server/services";
import { CALL_METHODS, usesCustomerNumbers } from "@/lib/serviceCall";
import { sampleCustomerNumbers } from "@/lib/server/customers";

// POST /api/services/ID/call { method, values: { PUT_ATTRIBUTE_ID: value } } – calls
// the service (admins, «Testen» in Admin) via `callService`: PUT attributes
// by name as JSON body (GET: query parameters), the JSON response mapped onto
// the GET attributes. Answers 200 also when the service fails – the result
// says what happened; not available → `mock` with sample data. A service with
// «Mock» switched on isn't called: `random: true` and random values («Kundennummer»
// attributes: ids of real customers).

export const maxDuration = 30;

const callInput = z.object({
  method: z.enum(CALL_METHODS).default("POST"),
  values: z.record(z.string().max(40), z.unknown()).default({}),
});

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser("admin");
  const service = await requireService(parseId((await ctx.params).id));
  if (!service.url && !service.mock) throw new HttpError(400, "Für diesen Service ist keine URL erfasst");
  const { method, values: input } = await readJson(req, callInput);
  const [putDefs, getDefs] = await Promise.all([serviceAttributeDefs(service._id, "put"), serviceAttributeDefs(service._id, "get")]);
  const parsed = parseAttributeValues(putDefs, input);
  if ("error" in parsed) throw new HttpError(400, parsed.error);
  const customerNumbers = service.mock && usesCustomerNumbers(getDefs) ? await sampleCustomerNumbers() : undefined;
  return Response.json(await callService(service.url ?? "", method, putDefs, getDefs, parsed.values, { mock: service.mock, customerNumbers }), {
    headers: NO_STORE,
  });
});
