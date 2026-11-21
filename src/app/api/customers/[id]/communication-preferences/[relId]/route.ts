import { requireUser } from "@/lib/server/auth";
import { toCustomerComPref } from "@/lib/server/customers";
import { collections } from "@/lib/server/db";
import { assertDomainValue } from "@/lib/server/domains";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { customerComPrefInput } from "@/lib/server/schemas";

// PATCH  /api/customers/ID/communication-preferences/CID { usageInstruction, comPrefType }
// DELETE /api/customers/ID/communication-preferences/CID

type Ctx = { params: Promise<{ id: string; relId: string }> };

async function ids(ctx: Ctx) {
  const p = await ctx.params;
  return { _id: parseId(p.relId), customerId: parseId(p.id) };
}

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser();
  const filter = await ids(ctx);
  const input = await readJson(req, customerComPrefInput);
  const { customerComPrefs } = await collections();
  const before = await customerComPrefs.findOne(filter);
  if (!before) throw new HttpError(404, "Nicht gefunden");
  await assertDomainValue("comPrefs", input.comPrefType, before.comPrefType);
  const doc = await customerComPrefs.findOneAndUpdate(
    filter,
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toCustomerComPref(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { customerComPrefs } = await collections();
  const res = await customerComPrefs.deleteOne(await ids(ctx));
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
