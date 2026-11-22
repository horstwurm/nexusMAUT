import { cookies } from "next/headers";
import { cookieOptions, STATE_COOKIE } from "@/lib/server/auth";
import { authMode } from "@/lib/server/authSettings";
import { newToken } from "@/lib/server/crypto";
import { collections } from "@/lib/server/db";
import { redirectTo, route } from "@/lib/server/http";
import { authorizeUrl } from "@/lib/server/oidc";
import { safeReturn } from "@/lib/urls";

// GET /auth/login?return=/path[&prompt=login] – starts the OIDC login at
// nexusIdentity. The state is stored in the DB and bound to this browser by
// a cookie (no login CSRF).

const STATE_MINUTES = 10;

export const GET = route(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  // own login switched on in Admin → Anmeldung: the form on /login
  if ((await authMode()) !== "nexusIdentity") return redirectTo(`/login?return=${encodeURIComponent(safeReturn(params.get("return")))}`);
  const state = newToken();
  const nonce = newToken();
  const codeVerifier = newToken(48);
  const expiresAt = new Date(Date.now() + STATE_MINUTES * 60 * 1000);
  const { loginStates } = await collections();
  await loginStates.insertOne({ _id: state, nonce, codeVerifier, returnTo: safeReturn(params.get("return")), expiresAt });
  (await cookies()).set(STATE_COOKIE, state, cookieOptions(expiresAt));
  return redirectTo(
    await authorizeUrl({ state, nonce, codeVerifier, prompt: params.get("prompt") === "login" ? "login" : undefined }),
  );
});
