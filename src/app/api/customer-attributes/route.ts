import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { toTypeAttribute } from "@/lib/server/domains";
import { HttpError, NO_STORE, readJson, route } from "@/lib/server/http";
import { sourcedAttributeInput } from "@/lib/server/schemas";
import { resolveAttributeSource } from "@/lib/server/serviceSources";

// Customer attributes (relation customerAttributes): attributes every customer
// can have, values in `customers.attributes`. Same shape as type attributes.
// GET  /api/customer-attributes – list in order (editors)
// POST /api/customer-attributes { attribute, attributeType, options?, service? { serviceId, attrId } } – add (admins)
//      with `service`: a «Service» attribute – value fetched from that GET attribute

export const GET = route(async () => {
  await requireUser();
  const { customerAttributes } = await collections();
  const list = await customerAttributes.find().sort({ sort: 1, attribute: 1 }).toArray();
  return Response.json(list.map((a) => toTypeAttribute({ ...a, typeId: null })), { headers: NO_STORE });
});

export const POST = route(async (req: Request) => {
  await requireUser("admin");
  const input = await resolveAttributeSource(await readJson(req, sourcedAttributeInput));
  const { customerAttributes } = await collections();
  const last = await customerAttributes.find().sort({ sort: -1 }).limit(1).next();
  const now = new Date();
  const doc = { _id: new ObjectId(), ...input, sort: last ? last.sort + 10 : 10, createdAt: now, updatedAt: now };
  try {
    await customerAttributes.insertOne(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new HttpError(409, `Das Kundenattribut «${input.attribute}» gibt es schon`);
    throw err;
  }
  return Response.json(toTypeAttribute({ ...doc, typeId: null }), { status: 201, headers: NO_STORE });
});
