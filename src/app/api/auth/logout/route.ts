import { endSession } from "@/lib/server/auth";
import { NO_STORE, route } from "@/lib/server/http";
import { endSessionUrl } from "@/lib/server/oidc";

// POST /api/auth/logout – ends our session and returns where the browser goes
// next: after a nexusIdentity login its single sign-out, after a password
// login the start page. POST + JSON-free body is fine here: sameSite=lax
// cookies aren't sent on cross-site POSTs.

export const POST = route(async () => {
  const idToken = await endSession();
  let url = "/";
  if (idToken) {
    try {
      url = await endSessionUrl(idToken);
    } catch (err) {
      console.error("[auth] single sign-out unavailable:", err); // our session is gone either way
    }
  }
  return Response.json({ url }, { headers: NO_STORE });
});
