import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { toTypeAttribute } from "@/lib/server/domains";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { sourcedAttributeInput } from "@/lib/server/schemas";
import { resolveAttributeSource } from "@/lib/server/serviceSources";

// PUT    /api/customer-attributes/ID { attribute, attributeType, options?, service? } – replace (admins)
// PATCH  /api/customer-attributes/ID { sort } – reorder (admins)
// DELETE /api/customer-attributes/ID – its values leave all customers (admins)

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const input = await resolveAttributeSource(await readJson(req, sourcedAttributeInput));
  const { customerAttributes } = await collections();
  let doc;
  try {
    doc = await customerAttributes.findOneAndUpdate(
      { _id: parseId((await ctx.params).id) },
      { $set: { ...input, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new HttpError(409, `Das Kundenattribut «${input.attribute}» gibt es schon`);
    throw err;
  }
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toTypeAttribute({ ...doc, typeId: null }), { headers: NO_STORE });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { sort } = await readJson(req, z.object({ sort: z.number().int().min(0).max(100_000) }));
  const { customerAttributes } = await collections();
  const doc = await customerAttributes.findOneAndUpdate(
    { _id: parseId((await ctx.params).id) },
    { $set: { sort, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toTypeAttribute({ ...doc, typeId: null }), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = parseId((await ctx.params).id);
  const { customerAttributes, customers } = await collections();
  const res = await customerAttributes.deleteOne({ _id: id });
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  const key = `attributes.${id.toHexString()}`;
  const meta = `serviceFetched.${id.toHexString()}`;
  await customers.updateMany({ $or: [{ [key]: { $exists: true } }, { [meta]: { $exists: true } }] }, { $unset: { [key]: "", [meta]: "" } });
  return new Response(null, { status: 204 });
});
