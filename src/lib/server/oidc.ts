import "server-only";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { appUrl } from "./http";

// OpenID Connect client for nexusIdentity: authorization code + PKCE (S256),
// confidential client (client_secret_basic). The ID token is verified
// against the issuer's JWKS; access / refresh tokens aren't needed – this
// app keeps its own session after login.

export const SCOPE = "openid profile email";

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const issuerUrl = () => (process.env.NEXUS_ISSUER?.trim() || "http://localhost:3005").replace(/\/$/, "");
export const redirectUri = () => `${appUrl()}/auth/callback`;
/**
 * Where nexusIdentity sends the browser after the single sign-out – compared
 * there **exactly** with the app's registered post-logout URIs. Default APP_URL
 * as is (no trailing slash: «http://localhost:3006»); NEXUS_POST_LOGOUT_URI
 * overrides it when the registration differs.
 */
export const postLogoutRedirectUri = () => process.env.NEXUS_POST_LOGOUT_URI?.trim() || appUrl();

const g = globalThis as unknown as {
  __nexusMautOidc?: Promise<{ meta: Discovery; jwks: ReturnType<typeof createRemoteJWKSet> }>;
};

/** Discovery document + JWKS of nexusIdentity, cached per server instance. */
export function provider() {
  g.__nexusMautOidc ??= (async () => {
    const iss = issuerUrl();
    const res = await fetch(`${iss}/.well-known/openid-configuration`, { cache: "no-store" });
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
    const meta = (await res.json()) as Discovery;
    if (meta.issuer !== iss) throw new Error(`OIDC issuer mismatch: ${meta.issuer} ≠ ${iss}`);
    return { meta, jwks: createRemoteJWKSet(new URL(meta.jwks_uri)) };
  })().catch((err) => {
    g.__nexusMautOidc = undefined;
    throw err;
  });
  return g.__nexusMautOidc;
}

export const codeChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export async function authorizeUrl(p: { state: string; nonce: string; codeVerifier: string; prompt?: "login" }) {
  const { meta } = await provider();
  const url = new URL(meta.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env("NEXUS_CLIENT_ID"),
    redirect_uri: redirectUri(),
    scope: SCOPE,
    state: p.state,
    nonce: p.nonce,
    code_challenge: codeChallenge(p.codeVerifier),
    code_challenge_method: "S256",
    ...(p.prompt && { prompt: p.prompt }),
  }).toString();
  return url.toString();
}

export type IdClaims = JWTPayload & {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  nonce?: string;
};

/** Code → tokens; returns the verified ID token and its claims. */
export async function exchangeCode(code: string, codeVerifier: string, nonce: string) {
  const { meta, jwks } = await provider();
  // RFC 6749 2.3.1: id and secret are form-urlencoded before Basic encoding
  const basic = Buffer.from(
    `${encodeURIComponent(env("NEXUS_CLIENT_ID"))}:${encodeURIComponent(env("NEXUS_CLIENT_SECRET"))}`,
  ).toString("base64");
  const res = await fetch(meta.token_endpoint, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: codeVerifier,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.id_token) {
    throw new Error(`Token request failed: ${body.error ?? res.status} ${body.error_description ?? ""}`.trim());
  }
  const { payload } = await jwtVerify<IdClaims>(body.id_token, jwks, {
    issuer: meta.issuer,
    audience: env("NEXUS_CLIENT_ID"),
    algorithms: ["RS256"],
  });
  if (payload.nonce !== nonce) throw new Error("ID token nonce mismatch");
  return { idToken: body.id_token, claims: payload };
}

/** Single sign-out at nexusIdentity, back to our start page afterwards. */
export async function endSessionUrl(idToken: string | null) {
  const { meta } = await provider();
  const url = new URL(meta.end_session_endpoint ?? `${issuerUrl()}/oidc/logout`);
  if (idToken) url.searchParams.set("id_token_hint", idToken);
  url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri());
  url.searchParams.set("client_id", env("NEXUS_CLIENT_ID"));
  return url.toString();
}
