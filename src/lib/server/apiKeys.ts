import "server-only";
import { newToken, sha256 } from "./crypto";
import { collections } from "./db";
import { HttpError } from "./http";

// API keys of actions (Admin → Aktionen): the system that carries out an
// action sets the customer's feedback on KundenJourney steps with that action,
// sending `Authorization: Bearer nxm_…`. Only sha256 + the last 4 characters
// are stored; a key is shown once. A new key replaces the old one.

export const KEY_PREFIX = "nxm_";

export function newApiKey() {
  const key = `${KEY_PREFIX}${newToken(32)}`;
  return { key, hash: sha256(key), hint: `${KEY_PREFIX}…${key.slice(-4)}` };
}

/** The Bearer token of a request, or null without an Authorization header. */
export function bearerOf(req: Request) {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) throw new HttpError(401, "Authorization erwartet: Bearer <API-Schlüssel>");
  return m[1];
}

/** The action a key belongs to (and notes its use); 401 for an unknown / revoked key. */
export async function actionOfKey(key: string) {
  const { actions } = await collections();
  const action = await actions.findOneAndUpdate(
    { "apiKey.hash": sha256(key) },
    { $set: { "apiKey.lastUsedAt": new Date() } },
    { returnDocument: "after" },
  );
  if (!action) throw new HttpError(401, "Ungültiger oder widerrufener API-Schlüssel");
  return action;
}
