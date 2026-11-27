import "server-only";
import type { ObjectId } from "mongodb";
import { contentFormatOf, contentFromSegments, contentHtml, type ContentRules } from "@/lib/contentFormats";
import type { ActionDoc } from "./db";
import { collections } from "./db";
import type { StepPreview } from "./stepPreview";

// A step content rendered for a customer, by its action's content rules
// (contentFormat / maxChars – Admin → Aktionen): the text (placeholder values
// escaped for Markdown), the HTML for formatted actions and the placeholders
// that got no value. Shared by «Erledigt», «Ausführen», «API» and the step tests.

export const rulesOf = (action: Pick<ActionDoc, "contentFormat" | "maxChars"> | null): ContentRules => ({
  contentFormat: contentFormatOf(action),
  maxChars: action?.maxChars ?? null,
});

export async function rulesOfAction(actionId: ObjectId): Promise<ContentRules> {
  const { actions } = await collections();
  return rulesOf(await actions.findOne({ _id: actionId }, { projection: { contentFormat: 1, maxChars: 1 } }));
}

export function rendered(preview: StepPreview, rules: ContentRules) {
  const content = contentFromSegments(preview.segments, rules.contentFormat);
  return {
    content,
    html: contentHtml(content, rules.contentFormat),
    unfilled: preview.segments.flatMap((s) => (s.kind === "placeholder" && s.value === null ? [s.token] : [])),
  };
}

/** The answer of the step tests: the preview plus the rules and the rendered text / HTML. */
export const testResult = (preview: StepPreview, rules: ContentRules) => {
  const r = rendered(preview, rules);
  return { ...preview, rules, content: r.content, html: r.html };
};
