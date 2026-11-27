import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, isDuplicate, NO_STORE, readJson, route } from "@/lib/server/http";
import { textBlockInput } from "@/lib/server/schemas";
import { listTextBlocks, toTextBlock } from "@/lib/server/textBlocks";

// Text building blocks (Textbausteine), managed in Admin; used as {{Baustein.code}} in step contents.
// GET  /api/text-blocks – all, with usage (editors)
// POST /api/text-blocks { code, label, category?, content } – add (admins); code unique, fixed afterwards

export const GET = route(async () => {
  await requireUser();
  return Response.json(await listTextBlocks(), { headers: NO_STORE });
});

export const POST = route(async (req: Request) => {
  await requireUser("admin");
  const { code, ...input } = await readJson(req, textBlockInput);
  if (!code) throw new HttpError(400, "Code fehlt");
  const now = new Date();
  const doc = { _id: new ObjectId(), code, ...input, createdAt: now, updatedAt: now };
  const { textBlocks } = await collections();
  try {
    await textBlocks.insertOne(doc);
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `Den Code «${code}» gibt es schon`);
    throw err;
  }
  return Response.json(toTextBlock(doc), { status: 201, headers: NO_STORE });
});
