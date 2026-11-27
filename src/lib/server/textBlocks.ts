import "server-only";
import type { ObjectId } from "mongodb";
import type { TextBlockView } from "@/lib/types";
import { usesBlock } from "@/lib/textBlocks";
import { collections, type TextBlockDoc } from "./db";
import { HttpError } from "./http";

// Text building blocks (Textbausteine): Admin tab, referenced as {{Baustein.code}} in
// journey step contents; expanded by previewStep (expandBlocks in src/lib/textBlocks.ts).

const blockRe = (code: string) => new RegExp(`\\{\\{\\s*Baustein\\.${code.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}\\s*\\}\\}`, "i");

/** Where a block is referenced: journey steps, and open KundenJourney steps (their copied template). */
export async function blockUsage(code: string) {
  const { journeySteps, customerJourneySteps } = await collections();
  const re = blockRe(code);
  const [steps, runs] = await Promise.all([
    journeySteps.countDocuments({ content: re }),
    customerJourneySteps.countDocuments({ template: re, status: { $nin: ["done", "skipped"] } }),
  ]);
  return { steps, runs };
}

export const toTextBlock = (b: TextBlockDoc, usage = { steps: 0, runs: 0 }): TextBlockView => ({
  id: b._id.toHexString(),
  code: b.code,
  label: b.label,
  category: b.category,
  content: b.content,
  usedInSteps: usage.steps,
  usedInRuns: usage.runs,
  updatedAt: b.updatedAt.toISOString(),
});

/** All blocks by category and label, with their usage. */
export async function listTextBlocks() {
  const { textBlocks, journeySteps, customerJourneySteps } = await collections();
  const [blocks, steps, runs] = await Promise.all([
    textBlocks.find({}, { collation: { locale: "de" } }).sort({ category: 1, label: 1 }).toArray(),
    journeySteps.find({ content: /\{\{\s*Baustein\./i }, { projection: { content: 1 } }).toArray(),
    customerJourneySteps.find({ template: /\{\{\s*Baustein\./i, status: { $nin: ["done", "skipped"] } }, { projection: { template: 1 } }).toArray(),
  ]);
  return blocks.map((b) =>
    toTextBlock(b, { steps: steps.filter((s) => usesBlock(s.content, b.code)).length, runs: runs.filter((r) => usesBlock(r.template, b.code)).length }),
  );
}

/** The blocks for rendering (code + content). */
export async function textBlocksForRendering() {
  const { textBlocks } = await collections();
  return textBlocks.find({}, { projection: { code: 1, content: 1 } }).toArray();
}

export async function requireTextBlock(id: ObjectId) {
  const { textBlocks } = await collections();
  const b = await textBlocks.findOne({ _id: id });
  if (!b) throw new HttpError(404, "Textbaustein nicht gefunden");
  return b;
}
