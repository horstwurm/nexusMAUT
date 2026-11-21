import { ObjectId } from "mongodb";
import { requireAction, toActionAttribute } from "@/lib/server/actions";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, isDuplicate, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { typeAttributeInput } from "@/lib/server/schemas";

// Attributes of an action (relation actionAttributes).
// GET  /api/actions/ID/attributes – list in order (editors)
// POST /api/actions/ID/attributes { attribute, attributeType, options? } – add (admins)

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const action = await requireAction(parseId((await ctx.params).id));
  const { actionAttributes } = await collections();
  const list = await actionAttributes.find({ actionId: action._id }).sort({ sort: 1, attribute: 1 }).toArray();
  return Response.json(list.map(toActionAttribute), { headers: NO_STORE });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const action = await requireAction(parseId((await ctx.params).id));
  const input = await readJson(req, typeAttributeInput);
  const { actionAttributes } = await collections();
  const last = await actionAttributes.find({ actionId: action._id }).sort({ sort: -1 }).limit(1).next();
  const now = new Date();
  const doc = { _id: new ObjectId(), actionId: action._id, ...input, sort: last ? last.sort + 10 : 10, createdAt: now, updatedAt: now };
  try {
    await actionAttributes.insertOne(doc);
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Das Attribut «${input.attribute}» gibt es bei dieser Aktion schon`);
    throw err;
  }
  return Response.json(toActionAttribute(doc), { status: 201, headers: NO_STORE });
});
