import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const newToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

const DEV_KEY = "nexus-maut-dev-key-do-not-use-in-production";
let warned = false;

function secretKey() {
  const key = process.env.SECRET_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === "production") throw new Error("SECRET_KEY is not set");
  if (!warned) {
    console.warn("[nexusMAUT] SECRET_KEY not set – using a fixed development key");
    warned = true;
  }
  return DEV_KEY;
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// --- secrets at rest (e.g. the SMTP password in the settings) --------------------
// AES-256-GCM, key = sha256(SECRET_KEY). Stored as "v1.iv.tag.ciphertext"
// (base64url). Changing SECRET_KEY makes stored secrets unreadable.

const aesKey = () => createHash("sha256").update(`aes:${secretKey()}`).digest();

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** The plain text, or null when the value can't be decrypted (other key, tampered). */
export function decrypt(sealed: string): string | null {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", aesKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
