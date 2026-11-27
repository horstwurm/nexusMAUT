import { requireUser } from "@/lib/server/auth";
import { collections } from "@/lib/server/db";
import { HttpError, NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { textBlockInput } from "@/lib/server/schemas";
import { blockUsage, requireTextBlock, toTextBlock } from "@/lib/server/textBlocks";

// PUT    /api/text-blocks/ID { label, category?, content } – change (admins); the code stays
// DELETE /api/text-blocks/ID – refused while journey steps or open KundenJourney steps refer to it (admins)

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const before = await requireTextBlock(parseId((await ctx.params).id));
  const { label, category, content } = await readJson(req, textBlockInput);
  const { textBlocks } = await collections();
  const doc = await textBlocks.findOneAndUpdate({ _id: before._id }, { $set: { label, category, content, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!doc) throw new HttpError(404, "Nicht gefunden");
  return Response.json(toTextBlock(doc, await blockUsage(doc.code)), { headers: NO_STORE });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const block = await requireTextBlock(parseId((await ctx.params).id));
  const { steps, runs } = await blockUsage(block.code);
  if (steps || runs)
    throw new HttpError(
      409,
      `Der Textbaustein wird verwendet: ${[steps && `${steps} Journey-Schritt${steps === 1 ? "" : "e"}`, runs && `${runs} offene KundenJourney-Schritt${runs === 1 ? "" : "e"}`].filter(Boolean).join(", ")} – zuerst dort entfernen`,
    );
  const { textBlocks } = await collections();
  await textBlocks.deleteOne({ _id: block._id });
  return new Response(null, { status: 204 });
});
