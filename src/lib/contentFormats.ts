// Content format of an action (Aktion): how its journey step contents are written and sent (pure).
import { escapeMarkdown, markdownToHtml } from "./markdown";
import type { Segment } from "./placeholders";

export const CONTENT_FORMATS = ["markdown", "text"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  markdown: "Formatiert (Markdown)",
  text: "Nur Text",
};

/** Actions saved before the field existed: formatted (plain texts render as before). */
export const contentFormatOf = (a: { contentFormat?: ContentFormat | null } | null | undefined): ContentFormat => a?.contentFormat ?? "markdown";

/** An action's content rules as the pages and the payload need them. */
export type ContentRules = { contentFormat: ContentFormat; maxChars: number | null };

/**
 * A rendered step content as text: the template's text with the placeholder values;
 * for Markdown the values are escaped, so a customer's «Muster*AG» doesn't format.
 * Placeholders without a value stay as their token.
 */
export function contentFromSegments(segments: Segment[], format: ContentFormat) {
  return segments.map((s) => (s.kind === "text" ? s.text : s.value === null ? s.token : format === "markdown" ? escapeMarkdown(s.value) : s.value)).join("");
}

/** The HTML for a formatted content – null for «Nur Text». */
export const contentHtml = (content: string, format: ContentFormat) => (format === "markdown" ? markdownToHtml(content) : null);
