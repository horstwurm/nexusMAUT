import { z } from "zod";
import { toActionAttribute } from "@/lib/server/actions";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { typeAttributeInput } from "@/lib/server/schemas";

// PUT    /api/actions/ID/attributes/AID { attribute, attributeType, options? } – replace (admins)
// PATCH  /api/actions/ID/attributes/AID { sort } – reorder (admins)
// DELETE /api/actions/ID/attributes/AID (admins)

type Ctx = { params: Promise<{ id: string; attrId: string }> };

async function filterOf(ctx: Ctx) {
  const p = await ctx.params;
  return { _id: parseId(p.attrId), actionId: parseId(p.id) };
}

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const filter = await filterOf(ctx);
  const input = await readJson(req, typeAttributeInput);
  const { actionAttributes } = await collections();
  let doc;
  try {
    doc = await actionAttributes.findOneAndUpdate(filter, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" });
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Das Attribut «${input.attribute}» gibt es bei dieser Aktion schon`);
    throw err;
  }
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toActionAttribute(doc), { headers: NO_STORE });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const filter = await filterOf(ctx);
  const { sort } = await readJson(req, z.object({ sort: z.number().int().min(0).max(100_000) }));
  const { actionAttributes } = await collections();
  const doc = await actionAttributes.findOneAndUpdate(filter, { $set: { sort, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toActionAttribute(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { actionAttributes } = await collections();
  const res = await actionAttributes.deleteOne(await filterOf(ctx));
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
