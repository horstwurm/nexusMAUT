import { z } from "zod";
import { kindFromPath } from "@/lib/typeAttributes";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { attributeCollection, toTypeAttribute } from "@/lib/server/domains";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { sourcedAttributeInput } from "@/lib/server/schemas";
import { resolveAttributeSource } from "@/lib/server/serviceSources";

// KIND = position-attributes | trx-attributes (see ../route.ts)
// PUT    /api/domains/TYPE_ID/KIND/AID { attribute, attributeType, options? } – replace (admins)
// PATCH  /api/domains/TYPE_ID/KIND/AID { sort } – reorder (admins)
// DELETE /api/domains/TYPE_ID/KIND/AID – its values leave the positions / transactions (admins)

type Ctx = { params: Promise<{ id: string; kind: string; attrId: string }> };

async function target(ctx: Ctx) {
  const p = await ctx.params;
  const kind = kindFromPath(p.kind);
  if (!kind) throw new HttpError(404, "Nicht gefunden");
  return { kind, col: await attributeCollection(kind), filter: { _id: parseId(p.attrId), typeId: parseId(p.id) } };
}

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { col, filter } = await target(ctx);
  const input = await resolveAttributeSource(await readJson(req, sourcedAttributeInput));
  let doc;
  try {
    doc = await col.findOneAndUpdate(filter, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new HttpError(409, `Das Attribut «${input.attribute}» gibt es bei diesem Typ schon`);
    throw err;
  }
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toTypeAttribute(doc), { headers: NO_STORE });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { col, filter } = await target(ctx);
  const { sort } = await readJson(req, z.object({ sort: z.number().int().min(0).max(100_000) }));
  const doc = await col.findOneAndUpdate(filter, { $set: { sort, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toTypeAttribute(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { kind, col, filter } = await target(ctx);
  const res = await col.deleteOne(filter);
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  // its values leave the positions / transactions (records left without any value stay, shown empty)
  const { customerPositions, positionTransactions } = await collections();
  const key = `values.${filter._id.toHexString()}`;
  const meta = `serviceFetched.${filter._id.toHexString()}`;
  const holders = kind === "position" ? customerPositions : positionTransactions;
  await holders.updateMany({ $or: [{ [key]: { $exists: true } }, { [meta]: { $exists: true } }] }, { $unset: { [key]: "", [meta]: "" } });
  return new Response(null, { status: 204 });
});
