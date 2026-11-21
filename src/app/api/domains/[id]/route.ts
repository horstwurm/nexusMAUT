import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { domainUsage, toAdminDomainValue } from "@/lib/server/domains";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { domainValuePatch } from "@/lib/server/schemas";

// PATCH  /api/domains/ID { label?, active?, sort? } – the code can't change (admins)
// DELETE /api/domains/ID – only when no record uses it; otherwise deactivate (admins).
//        Removes the type's position and transaction attributes too.

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const input = await readJson(req, domainValuePatch);
  const { domainValues } = await collections();
  const doc = await domainValues.findOneAndUpdate(
    { _id: parseId((await ctx.params).id) },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(await toAdminDomainValue(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { domainValues, positionAttributes, trxAttributes } = await collections();
  const doc = await domainValues.findOne({ _id: parseId((await ctx.params).id) });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  const usage = await domainUsage(doc.domain, doc.code);
  if (usage > 0) {
    throw new HttpError(409, `«${doc.label}» wird ${usage}× verwendet – stattdessen deaktivieren`);
  }
  await domainValues.deleteOne({ _id: doc._id });
  // its attributes go with it
  await Promise.all([positionAttributes.deleteMany({ typeId: doc._id }), trxAttributes.deleteMany({ typeId: doc._id })]);
  return new Response(null, { status: 204 });
});
