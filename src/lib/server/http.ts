import "server-only";
import { ObjectId } from "mongodb";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

/** Wraps a route handler so thrown errors become `{ error }` JSON responses. */
export function route<Ctx>(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx) => {
    await connection(); // never prerender
    try {
      return await handler(req, ctx);
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status, headers: NO_STORE });
      }
      if (err instanceof z.ZodError) {
        return Response.json({ error: err.issues[0]?.message ?? "Ungültige Eingabe" }, { status: 400, headers: NO_STORE });
      }
      console.error(err);
      return Response.json({ error: "Interner Serverfehler" }, { status: 500, headers: NO_STORE });
    }
  };
}

/**
 * Parses a JSON request body. Requiring application/json also blocks
 * cross-site form posts, which can't send that content type.
 */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    throw new HttpError(415, "Erwarte JSON");
  }
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new HttpError(400, "Ungültiges JSON");
  }
  return schema.parse(data);
}

/** MongoDB duplicate-key error (unique index). */
export const isDuplicate = (err: unknown) => (err as { code?: number }).code === 11000;

export function parseId(id: string) {
  if (!ObjectId.isValid(id)) throw new HttpError(404, "Nicht gefunden");
  return new ObjectId(id);
}

/** Public base URL of this app. Never derived from the request in production. */
export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL is not set");
  return "http://localhost:3006";
}

/** 302 to a path on this site or an absolute URL, never cached. */
export function redirectTo(target: string) {
  const url = new URL(target, appUrl() + "/");
  return new Response(null, { status: 302, headers: { Location: url.toString(), ...NO_STORE } });
}

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: "Ungültige E-Mail-Adresse" }));
