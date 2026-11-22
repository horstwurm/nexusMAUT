import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { serviceGetAttributeInput, typeAttributeInput } from "@/lib/server/schemas";
import { serviceKindFromPath } from "@/lib/services";
import { serviceAttributeCollection, toServiceAttribute } from "@/lib/server/services";
import { serviceSourceUsage, syncSourcedAttributes } from "@/lib/server/serviceSources";

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
  if (kind === "get" && "list" in input && input.list) {
    const used = await serviceSourceUsage({ attrId: filter._id });
    if (used.length) throw new HttpError(409, `Liefert Werte für ${used.join(", ")} – kann keine Liste werden`);
  }
  let doc;
  try {
    doc = await col.findOneAndUpdate(filter, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" });
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Das Attribut «${input.attribute}» gibt es bei diesem Service schon`);
    throw err;
  }
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  // attributes fed by this GET attribute keep its type / options
  if (kind === "get") await syncSourcedAttributes(doc._id, doc.attributeType, doc.options);
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
  const { kind, col, filter } = await target(ctx);
  if (kind === "get") {
    const used = await serviceSourceUsage({ attrId: filter._id });
    if (used.length) throw new HttpError(409, `Liefert Werte für ${used.join(", ")} – zuerst dort ändern`);
  }
  const res = await col.deleteOne(filter);
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  return new Response(null, { status: 204 });
});
