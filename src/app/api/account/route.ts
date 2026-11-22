import { requireSignedIn, toMe } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { NO_STORE, readJson, route } from "@/lib/server/http";
import { profileInput } from "@/lib/server/schemas";

// PATCH /api/account { firstname, lastname } – «Mein Konto»: the own name (a
// nexusIdentity login sets it again from there).

export const PATCH = route(async (req: Request) => {
  const me = await requireSignedIn();
  const { firstname, lastname } = await readJson(req, profileInput);
  const { users } = await collections();
  const user = await users.findOneAndUpdate(
    { _id: me._id },
    { $set: { firstname, lastname, name: `${firstname} ${lastname}` } },
    { returnDocument: "after" },
  );
  return Response.json(toMe(user!), { headers: NO_STORE });
});
