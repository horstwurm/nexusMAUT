import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Password hashes for the own login (same scheme as nexusEAM):
// "scrypt$<salt>$<hash>" (base64), 16-byte salt, 64-byte key, NFKC-normalised.

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const MIN_PASSWORD = 8;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;
/** Hashed against when the e-mail is unknown, so the login time doesn't reveal which e-mails exist. */
export const dummyPasswordHash = () => (dummyHash ??= hashPassword("dummy-password-for-timing"));
