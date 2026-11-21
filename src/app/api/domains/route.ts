import { ObjectId } from "mongodb";
import { DOMAIN_NAMES, type DomainName } from "@/lib/domains";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { domainValues, toAdminDomainValue, toDomainValue } from "@/lib/server/domains";
import { HttpError, NO_STORE, readJson, route } from "@/lib/server/http";
import { domainValueInput } from "@/lib/server/schemas";

// GET  /api/domains?domain=productServiceType|comPrefs[&usage=1] – values (editors: for the
//      selects; usage counts for admins only)
// POST /api/domains { domain, code, label, active?, sort? } – new value (admins)

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const domain = params.get("domain") as DomainName;
  if (!DOMAIN_NAMES.includes(domain)) throw new HttpError(400, "Unbekannte Werteliste");
  const list = await domainValues(domain);
  const withUsage = params.get("usage") === "1" && user.role === "admin";
  const result = withUsage
    ? await Promise.all(list.map(toAdminDomainValue))
    : list.map((v) => toDomainValue(v));
  return Response.json(result, { headers: NO_STORE });
});

export const POST = route(async (req: Request) => {
  await requireUser("admin");
  const input = await readJson(req, domainValueInput);
  const { domainValues: values } = await collections();
  const last = await values.find({ domain: input.domain }).sort({ sort: -1 }).limit(1).next();
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    ...input,
    sort: input.sort ?? (last ? last.sort + 10 : 10),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await values.insertOne(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new HttpError(409, `Den Code «${input.code}» gibt es schon`);
    throw err;
  }
  return Response.json(toDomainValue(doc, 0), { status: 201, headers: NO_STORE });
});
