import { toAction } from "@/lib/server/actions";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { actionInput } from "@/lib/server/schemas";

// PUT    /api/actions/ID { name, description?, url? } – change (admins)
// DELETE /api/actions/ID – with its attributes; refused while journey steps use it (admins)

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const input = await readJson(req, actionInput);
  const { actions } = await collections();
  let doc;
  try {
    doc = await actions.findOneAndUpdate(
      { _id: parseId((await ctx.params).id) },
      { $set: { ...input, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Die Aktion «${input.name}» gibt es schon`);
    throw err;
  }
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  const { actionAttributes } = await collections();
  return Response.json(toAction(doc, await actionAttributes.countDocuments({ actionId: doc._id })), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = parseId((await ctx.params).id);
  const { actions, actionAttributes, journeySteps } = await collections();
  const used = await journeySteps.countDocuments({ actionId: id });
  if (used) throw new HttpError(409, `Die Aktion wird in ${used} Schritt${used === 1 ? "" : "en"} von Journeys verwendet`);
  const res = await actions.deleteOne({ _id: id });
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  await actionAttributes.deleteMany({ actionId: id }); // its attributes go with it
  return new Response(null, { status: 204 });
});
