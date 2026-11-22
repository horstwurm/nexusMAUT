import { ObjectId } from "mongodb";
import { kindFromPath } from "@/lib/typeAttributes";
import { requireUser } from "@/lib/server/auth";
import { attributeCollection, requireProductType, toTypeAttribute, typeAttributesOf } from "@/lib/server/domains";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { sourcedAttributeInput } from "@/lib/server/schemas";
import { resolveAttributeSource } from "@/lib/server/serviceSources";

// Attributes of a product/service type – KIND = position-attributes
// (productServiceTypePositionAttributes) or trx-attributes
// (productServiceTypeTrxAttributes).
// GET  /api/domains/TYPE_ID/KIND – list in order (editors)
// POST /api/domains/TYPE_ID/KIND { attribute, attributeType, options? } – add (admins)

type Ctx = { params: Promise<{ id: string; kind: string }> };

async function target(ctx: Ctx) {
  const p = await ctx.params;
  const kind = kindFromPath(p.kind);
  if (!kind) throw new HttpError(404, "Nicht gefunden");
  return { kind, type: await requireProductType(parseId(p.id)) };
}

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { kind, type } = await target(ctx);
  return Response.json((await typeAttributesOf(type._id, kind)).map(toTypeAttribute), { headers: NO_STORE });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { kind, type } = await target(ctx);
  const input = await resolveAttributeSource(await readJson(req, sourcedAttributeInput));
  const col = await attributeCollection(kind);
  const last = await col.find({ typeId: type._id }).sort({ sort: -1 }).limit(1).next();
  const now = new Date();
  const doc = { _id: new ObjectId(), typeId: type._id, ...input, sort: last ? last.sort + 10 : 10, createdAt: now, updatedAt: now };
  try {
    await col.insertOne(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new HttpError(409, `Das Attribut «${input.attribute}» gibt es bei diesem Typ schon`);
    throw err;
  }
  return Response.json(toTypeAttribute(doc), { status: 201, headers: NO_STORE });
});
