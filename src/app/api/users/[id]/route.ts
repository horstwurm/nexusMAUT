import { z } from "zod";
import { requireUser, toMe } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, readJson, route } from "@/lib/server/http";

// PATCH  /api/users/SUB { role } – admins give or take access
// DELETE /api/users/SUB         – remove a user (and their sessions)

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const me = await requireUser("admin");
  const id = (await ctx.params).id;
  const { role } = await readJson(req, z.object({ role: z.enum(["admin", "editor", "pending"]) }));
  if (id === me._id && role !== "admin") throw new HttpError(400, "Die eigene Admin-Rolle kann nicht entfernt werden");
  const { users, sessions } = await collections();
  const user = await users.findOneAndUpdate({ _id: id }, { $set: { role } }, { returnDocument: "after" });
  if (!user) throw new HttpError(404, "Nicht gefunden");
  if (role === "pending") await sessions.deleteMany({ userId: id });
  return Response.json(toMe(user), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const me = await requireUser("admin");
  const id = (await ctx.params).id;
  if (id === me._id) throw new HttpError(400, "Das eigene Konto kann nicht entfernt werden");
  const { users, sessions } = await collections();
  const res = await users.deleteOne({ _id: id });
  if (!res.deletedCount) throw new HttpError(404, "Nicht gefunden");
  await sessions.deleteMany({ userId: id });
  return new Response(null, { status: 204 });
});
