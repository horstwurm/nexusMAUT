import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { refreshAttribute } from "@/lib/server/serviceAttributes";

// POST /api/service-attributes/refresh { kind: customer | position | trx, attrId } –
// fetches one «Service» attribute for all customers / positions / transactions
// it applies to (Admin «Werte aktualisieren»; admins). → { records, values, errors, messages }

export const maxDuration = 300;

const input = z.object({ kind: z.enum(["customer", "position", "trx"]), attrId: z.string() });

export const POST = route(async (req: Request) => {
  await requireUser("admin");
  const { kind, attrId } = await readJson(req, input);
  return Response.json(await refreshAttribute(kind, parseId(attrId)), { headers: NO_STORE });
});
