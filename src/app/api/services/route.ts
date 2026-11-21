import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { assertDomainValue } from "@/lib/server/domains";
import { HttpError, isDuplicate, NO_STORE, readJson, route } from "@/lib/server/http";
import { serviceInput } from "@/lib/server/schemas";
import { listServices, toService } from "@/lib/server/services";

// Services, managed in Admin.
// GET  /api/services – all, by name, with PUT / GET attribute counts (editors)
// POST /api/services { name, serviceType, url? } – add (admins)

export const GET = route(async () => {
  await requireUser();
  return Response.json(await listServices(), { headers: NO_STORE });
});

export const POST = route(async (req: Request) => {
  await requireUser("admin");
  const input = await readJson(req, serviceInput);
  await assertDomainValue("serviceType", input.serviceType);
  const now = new Date();
  const doc = { _id: new ObjectId(), ...input, createdAt: now, updatedAt: now };
  const { services } = await collections();
  try {
    await services.insertOne(doc);
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Den Service «${input.name}» gibt es schon`);
    throw err;
  }
  return Response.json(toService(doc), { status: 201, headers: NO_STORE });
});
