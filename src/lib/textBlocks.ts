// Text building blocks (Textbausteine, Admin): reusable step content parts, referenced
// as {{Baustein.<code>}} and inserted live when a content is rendered – before the
// placeholders and conditions are evaluated, so a block may contain both. One level:
// a block can't contain another block. For «Nur Text» actions the block's formatting
// is stripped (markdownToText). Pure – server and pages.
import type { ContentFormat } from "./contentFormats";
import { markdownToText } from "./markdown";

/** Codes: lower-case letters, digits, - and _ (fixed after creation, used in the reference). */
export const TEXT_BLOCK_CODE_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Suggested categories (free text is allowed). */
export const TEXT_BLOCK_CATEGORIES = ["Anrede", "Signatur", "Fusszeile", "Rechtliches", "Sonstiges"];

const BLOCK_TOKEN = /\{\{\s*Baustein\.([^{}]+?)\s*\}\}/gi;

export const blockToken = (code: string) => `{{Baustein.${code}}}`;

/** The block codes a text refers to (lower case, distinct). */
export function blockCodesIn(text: string): string[] {
  return [...new Set([...text.matchAll(BLOCK_TOKEN)].map((m) => m[1].trim().toLowerCase()))];
}

/** Does a text refer to the block? (case-insensitive, spaces inside the braces allowed) */
export const usesBlock = (text: string | null | undefined, code: string) => !!text && blockCodesIn(text).includes(code.toLowerCase());

/**
 * Replaces each {{Baustein.code}} with the block's content (trailing line breaks
 * removed; for «Nur Text» without formatting). Unknown blocks stay as they are
 * (flagged later as unknown placeholders); references inside a block aren't expanded.
 */
export function expandBlocks(text: string, blocks: { code: string; content: string }[], format: ContentFormat = "markdown"): string {
  if (!blocks.length || !/\{\{\s*Baustein\./i.test(text)) return text;
  const byCode = new Map(blocks.map((b) => [b.code.toLowerCase(), b.content.replace(/\s+$/, "")]));
  return text.replace(BLOCK_TOKEN, (all, code: string) => {
    const content = byCode.get(code.trim().toLowerCase());
    if (content === undefined) return all;
    return format === "text" ? markdownToText(content) : content;
  });
}
