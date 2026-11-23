import { toAction } from "@/lib/server/actions";
import { newApiKey } from "@/lib/server/apiKeys";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, route } from "@/lib/server/http";

// API key of an action (admins) – for the feedback API of its KundenJourney steps.
// POST   /api/actions/ID/api-key – create a new key (replaces the old one); → { key, action } – the key only now
// DELETE /api/actions/ID/api-key – revoke

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req: Request, ctx: Ctx) => {
  const me = await requireUser("admin");
  const id = parseId((await ctx.params).id);
  const { key, hash, hint } = newApiKey();
  const { actions } = await collections();
  const action = await actions.findOneAndUpdate(
    { _id: id },
    { $set: { apiKey: { hash, hint, createdAt: new Date(), createdBy: me._id } } },
    { returnDocument: "after" },
  );
  if (!action) throw new HttpError(404, "Aktion nicht gefunden");
  return Response.json({ key, action: toAction(action) }, { status: 201, headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = parseId((await ctx.params).id);
  const { actions } = await collections();
  const action = await actions.findOneAndUpdate({ _id: id }, { $unset: { apiKey: "" } }, { returnDocument: "after" });
  if (!action) throw new HttpError(404, "Aktion nicht gefunden");
  return Response.json({ action: toAction(action) }, { headers: NO_STORE });
});
