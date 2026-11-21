import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { serviceGetAttributeInput, typeAttributeInput } from "@/lib/server/schemas";
import { serviceKindFromPath } from "@/lib/services";
import { requireService, serviceAttributeCollection, toServiceAttribute } from "@/lib/server/services";

// Attributes of a service – KIND = put-attributes (putAttributes) or
// get-attributes (getAttributes). Same shape as product type attributes;
// GET attributes can also be lists (`list: { path, columns }`).
// GET  /api/services/ID/KIND – list in order (editors)
// POST /api/services/ID/KIND { attribute, attributeType, options? } – add (admins)

type Ctx = { params: Promise<{ id: string; kind: string }> };

async function target(ctx: Ctx) {
  const p = await ctx.params;
  const kind = serviceKindFromPath(p.kind);
  if (!kind) throw new HttpError(404, "Nicht gefunden");
  return { kind, col: await serviceAttributeCollection(kind), service: await requireService(parseId(p.id)) };
}

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { col, service } = await target(ctx);
  const list = await col.find({ serviceId: service._id }).sort({ sort: 1, attribute: 1 }).toArray();
  return Response.json(list.map(toServiceAttribute), { headers: NO_STORE });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { kind, col, service } = await target(ctx);
  const input = await readJson(req, kind === "get" ? serviceGetAttributeInput : typeAttributeInput);
  const last = await col.find({ serviceId: service._id }).sort({ sort: -1 }).limit(1).next();
  const now = new Date();
  const doc = { _id: new ObjectId(), serviceId: service._id, ...input, sort: last ? last.sort + 10 : 10, createdAt: now, updatedAt: now };
  try {
    await col.insertOne(doc);
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Das Attribut «${input.attribute}» gibt es bei diesem Service schon`);
    throw err;
  }
  return Response.json(toServiceAttribute(doc), { status: 201, headers: NO_STORE });
});
