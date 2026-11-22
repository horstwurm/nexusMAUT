import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Me } from "@/lib/types";
import { randomUUID } from "node:crypto";
import { newToken, sha256 } from "./crypto";
import { collections, type Role, type UserDoc } from "./db";
import { HttpError } from "./http";
import type { IdClaims } from "./oidc";

// Our own session after the login – at nexusIdentity (OIDC) or with the own
// login (e-mail + password, Admin → Anmeldung): httpOnly cookie `sid`, only
// its sha256 stored. Access is decided here (roles), not at nexusIdentity: the
// very first user becomes admin, later ones wait as "pending" until an admin
// gives them a role.

const SESSION_COOKIE = "sid";
export const STATE_COOKIE = "oidc_state";
export const SESSION_DAYS = 7;

export const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  expires,
});

export function toMe(doc: UserDoc): Me {
  return { id: doc._id, email: doc.email, name: doc.name, role: doc.role };
}

/** The first user to log in sets the app up. */
async function promoteFirstUser(user: UserDoc) {
  const { users } = await collections();
  if (user.role === "pending" && (await users.countDocuments({ role: "admin" })) === 0) {
    await users.updateOne({ _id: user._id }, { $set: { role: "admin" } });
    user.role = "admin";
  }
  return user;
}

/**
 * Creates or updates the user from the ID token claims. A user registered here
 * (own login) with the same, verified e-mail is linked (`oidcSub`) instead of
 * getting a second account.
 */
export async function upsertUser(claims: IdClaims) {
  const { users } = await collections();
  const now = new Date();
  const email = (claims.email ?? "").toLowerCase();
  const name = claims.name?.trim() || email;
  const linked =
    (await users.findOne({ $or: [{ _id: claims.sub }, { oidcSub: claims.sub }] })) ??
    (claims.email_verified === true && email ? await users.findOne({ email, _id: /^local_/, oidcSub: { $exists: false } }) : null);
  if (linked) {
    const user = await users.findOneAndUpdate(
      { _id: linked._id },
      { $set: { email, name, lastLoginAt: now, ...(linked._id !== claims.sub && { oidcSub: claims.sub }) } },
      { returnDocument: "after" },
    );
    return promoteFirstUser(user!);
  }
  const user: UserDoc = { _id: claims.sub, email, name, role: "pending", createdAt: now, lastLoginAt: now };
  await users.insertOne(user);
  return promoteFirstUser(user);
}

/** Own login: a new account (waits for a role – unless it is the very first user). */
export async function createLocalUser(p: { email: string; name: string; passwordHash: string }) {
  const { users } = await collections();
  if (await users.findOne({ email: p.email })) throw new HttpError(409, "Diese E-Mail-Adresse ist bereits registriert");
  const now = new Date();
  const user: UserDoc = {
    _id: `local_${randomUUID()}`,
    email: p.email,
    name: p.name,
    role: "pending",
    passwordHash: p.passwordHash,
    passwordChangedAt: now,
    createdAt: now,
    lastLoginAt: now,
  };
  await users.insertOne(user);
  return promoteFirstUser(user);
}

export async function startSession(userId: string, idToken?: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const { sessions } = await collections();
  await sessions.insertOne({ _id: sha256(token), userId, ...(idToken && { idToken }), expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

/** Logs the user out everywhere except in this browser (after a password change). */
export async function endOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const { sessions } = await collections();
  await sessions.deleteMany({ userId, ...(token && { _id: { $ne: sha256(token) } }) });
}

/** Ends the local session; returns its ID token for the single sign-out. */
export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  let idToken: string | null = null;
  if (token) {
    const { sessions } = await collections();
    idToken = (await sessions.findOneAndDelete({ _id: sha256(token) }))?.idToken ?? null;
  }
  store.delete(SESSION_COOKIE);
  return idToken;
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { sessions, users } = await collections();
  const session = await sessions.findOne({ _id: sha256(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return users.findOne({ _id: session.userId });
}

const RANK: Record<Role, number> = { pending: 0, editor: 1, admin: 2 };

/** For API routes: any logged-in user, also one waiting for a role («Mein Konto»). */
export async function requireSignedIn() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Nicht angemeldet");
  return user;
}

/** For API routes: 401 without login, 403 below the role. */
export async function requireUser(min: Exclude<Role, "pending"> = "editor") {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Nicht angemeldet");
  if (RANK[user.role] < RANK[min]) throw new HttpError(403, "Keine Berechtigung");
  return user;
}

/** For pages: to the login, or to the waiting page without a role. */
export async function requirePageUser(returnTo: string, min: Exclude<Role, "pending"> = "editor") {
  const user = await currentUser();
  if (!user) redirect(`/login?return=${encodeURIComponent(returnTo)}`);
  if (user.role === "pending") redirect("/pending");
  if (RANK[user.role] < RANK[min]) redirect("/");
  return user;
}
