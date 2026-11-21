import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { assertDomainValue } from "@/lib/server/domains";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { serviceInput } from "@/lib/server/schemas";
import { serviceCounts, toService } from "@/lib/server/services";

// PUT    /api/services/ID { name, serviceType, url? } – change (admins); a type deactivated since may stay
// DELETE /api/services/ID – with its PUT / GET attributes (admins)

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = parseId((await ctx.params).id);
  const input = await readJson(req, serviceInput);
  const { services } = await collections();
  const before = await services.findOne({ _id: id });
  if (!before) throw new HttpError(404, "Nicht gefunden");
  await assertDomainValue("serviceType", input.serviceType, before.serviceType);
  let doc;
  try {
    doc = await services.findOneAndUpdate({ _id: id }, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" });
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Den Service «${input.name}» gibt es schon`);
    throw err;
  }
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toService(doc, await serviceCounts(doc._id)), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = parseId((await ctx.params).id);
  const { services, servicePutAttributes, serviceGetAttributes } = await collections();
  const res = await services.deleteOne({ _id: id });
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  await Promise.all([servicePutAttributes.deleteMany({ serviceId: id }), serviceGetAttributes.deleteMany({ serviceId: id })]);
  return new Response(null, { status: 204 });
});
