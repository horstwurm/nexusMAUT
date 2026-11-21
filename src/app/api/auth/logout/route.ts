import { endSession } from "@/lib/server/auth";
import { NO_STORE, route } from "@/lib/server/http";
import { endSessionUrl } from "@/lib/server/oidc";

// POST /api/auth/logout – ends our session and returns the URL of the single
// sign-out at nexusIdentity (the browser goes there next). POST + JSON-free
// body is fine here: sameSite=lax cookies aren't sent on cross-site POSTs.

export const POST = route(async () => {
  const idToken = await endSession();
  return Response.json({ url: await endSessionUrl(idToken) }, { headers: NO_STORE });
});
