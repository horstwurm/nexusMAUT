import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { NO_STORE, parseId, readJson, route } from "@/lib/server/http";
import { testResult } from "@/lib/server/stepContent";
import { previewStep } from "@/lib/server/stepPreview";
import { requireTextBlock } from "@/lib/server/textBlocks";

// POST /api/text-blocks/ID/test { customerId } – the block rendered for one customer
// (placeholders filled, conditions decided, services called; formatted). Admins.
// → { customer, segments, services, conditions, rules, content, html } like the step tests.

export const maxDuration = 60;

const testInput = z.object({ customerId: z.string().regex(/^[0-9a-f]{24}$/, "Kunde wählen") });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser("admin");
  const block = await requireTextBlock(parseId((await ctx.params).id));
  const { customerId } = await readJson(req, testInput);
  const preview = await previewStep(block.content, parseId(customerId));
  return Response.json(testResult(preview, { contentFormat: "markdown", maxChars: null }), { headers: NO_STORE });
});
