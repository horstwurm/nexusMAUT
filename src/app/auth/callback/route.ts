import { cookies } from "next/headers";
import { STATE_COOKIE, startSession, upsertUser } from "@/lib/server/auth";
import { safeEqual } from "@/lib/server/crypto";
import { collections } from "@/lib/server/db";
import { redirectTo, route } from "@/lib/server/http";
import { exchangeCode, provider } from "@/lib/server/oidc";

// GET /auth/callback – nexusIdentity returns here with ?code&state&iss (or
// ?error). Checks state (cookie + DB, single use) and iss (RFC 9207),
// exchanges the code, verifies the ID token and starts our session.

const fail = (code: string) => redirectTo(`/login?error=${encodeURIComponent(code)}`);

export const GET = route(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const store = await cookies();
  const cookieState = store.get(STATE_COOKIE)?.value ?? "";
  store.delete(STATE_COOKIE);

  const state = params.get("state") ?? "";
  if (!state || !safeEqual(state, cookieState)) return fail("state");
  const { loginStates } = await collections();
  const pending = await loginStates.findOneAndDelete({ _id: state, expiresAt: { $gt: new Date() } });
  if (!pending) return fail("state");

  const { meta } = await provider();
  const iss = params.get("iss");
  if (iss && iss !== meta.issuer) return fail("issuer");

  const error = params.get("error");
  if (error) {
    // login_required etc. – the user cancelled or isn't allowed
    console.warn(`[auth] nexusIdentity returned ${error}: ${params.get("error_description") ?? ""}`);
    return fail(error === "access_denied" ? "access_denied" : "provider");
  }
  const code = params.get("code");
  if (!code) return fail("provider");

  let result;
  try {
    result = await exchangeCode(code, pending.codeVerifier, pending.nonce);
  } catch (err) {
    console.error("[auth] code exchange failed:", err);
    return fail("token");
  }
  if (!result.claims.email) return fail("email");

  const user = await upsertUser(result.claims);
  await startSession(user._id, result.idToken);
  return redirectTo(user.role === "pending" ? "/pending" : pending.returnTo);
});
