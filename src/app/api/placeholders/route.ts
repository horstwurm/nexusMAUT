import { requireUser } from "@/lib/server/auth";
import { NO_STORE, route } from "@/lib/server/http";
import { placeholderCatalog } from "@/lib/server/placeholders";

// GET /api/placeholders – placeholders for texts (journey step contents):
// [{ id, label, items: [{ token, label, type }] }], built from the
// attributes defined in Admin (editors).

export const GET = route(async () => {
  await requireUser();
  return Response.json(await placeholderCatalog(), { headers: NO_STORE });
});
