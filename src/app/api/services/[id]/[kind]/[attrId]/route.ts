import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { serviceGetAttributeInput, typeAttributeInput } from "@/lib/server/schemas";
import { serviceKindFromPath } from "@/lib/services";
import { serviceAttributeCollection, toServiceAttribute } from "@/lib/server/services";

// KIND = put-attributes | get-attributes (see ../route.ts)
// PUT    /api/services/ID/KIND/AID { attribute, attributeType, options? } – replace (admins)
// PATCH  /api/services/ID/KIND/AID { sort } – reorder (admins)
// DELETE /api/services/ID/KIND/AID (admins)

type Ctx = { params: Promise<{ id: string; kind: string; attrId: string }> };

async function target(ctx: Ctx) {
  const p = await ctx.params;
  const kind = serviceKindFromPath(p.kind);
  if (!kind) throw new HttpError(404, "Nicht gefunden");
  return { kind, col: await serviceAttributeCollection(kind), filter: { _id: parseId(p.attrId), serviceId: parseId(p.id) } };
}

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { kind, col, filter } = await target(ctx);
  const input = await readJson(req, kind === "get" ? serviceGetAttributeInput : typeAttributeInput);
  let doc;
  try {
    doc = await col.findOneAndUpdate(filter, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" });
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Das Attribut «${input.attribute}» gibt es bei diesem Service schon`);
    throw err;
  }
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toServiceAttribute(doc), { headers: NO_STORE });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { col, filter } = await target(ctx);
  const { sort } = await readJson(req, z.object({ sort: z.number().int().min(0).max(100_000) }));
  const doc = await col.findOneAndUpdate(filter, { $set: { sort, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toServiceAttribute(doc), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { col, filter } = await target(ctx);
  const res = await col.deleteOne(filter);
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
