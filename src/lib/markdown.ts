// A small, safe Markdown subset for journey step contents (pure – server and pages).
// Supported: # / ## / ### headings, **bold** / __bold__, *italic* / _italic_,
// [text](https://…) and mailto: links, - / * / + bullet lists, 1. numbered lists,
// --- separator lines, paragraphs (blank line) and line breaks (a single newline
// stays a line break, so plain texts look as before). Backslash escapes \* \_ \[ …
// All HTML in the source is escaped; links only for http(s) and mailto.

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Characters a placeholder value must not turn into formatting. */
const SPECIAL = /([\\*_[\]`])/g;

/** A value (e.g. a customer's name) as literal Markdown text – `*`, `_`, `[` … escaped. */
export const escapeMarkdown = (value: string) => value.replace(SPECIAL, "\\$1");

const ESCAPABLE = /\\([\\*_[\]`#+\-.!()])/g;

/** Inline formatting of one line (already split into blocks). */
function inline(text: string): string {
  // 1. backslash escapes → private tokens, restored as literal characters at the end
  const literal: string[] = [];
  let s = text.replace(ESCAPABLE, (_, ch: string) => `\u0000${literal.push(ch) - 1}\u0000`);
  s = escapeHtml(s);
  // 2. links → tokens (their URL must not be touched by bold / italic)
  const links: string[] = [];
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label: string, url: string) => {
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return all;
    return `\u0001${links.push(`<a href="${url}">${emphasis(label)}</a>`) - 1}\u0001`;
  });
  s = emphasis(s);
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => links[Number(i)]);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => escapeHtml(literal[Number(i)]));
}

function emphasis(s: string) {
  return s
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, "<strong>$1</strong>")
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "<em>$1</em>")
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/gu, "$1<em>$2</em>");
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Markdown (the supported subset) → HTML. Empty text → "". */
export function markdownToHtml(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  for (const line of lines) {
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    if (RULE.test(line)) {
      flushPara();
      flushList();
      out.push("<hr>");
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flushPara();
      flushList();
      out.push(`<h${h[1].length}>${inline(h[2].trim())}</h${h[1].length}>`);
      continue;
    }
    const b = BULLET.exec(line);
    const n = b ? null : NUMBERED.exec(line);
    if (b || n) {
      flushPara();
      const tag = b ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((b ?? n)![1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join("\n");
}

/**
 * Markdown (the supported subset) → plain text: titles without «#», **bold** /
 * *italic* without markers, [Text](url) → «Text (url)», separator lines dropped,
 * backslash escapes resolved. Lists, line breaks and {{placeholders}} stay.
 * For text building blocks in «Nur Text» actions (SMS).
 */
export function markdownToText(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => !RULE.test(l))
    .map((l) => {
      const literal: string[] = [];
      let s = l.replace(ESCAPABLE, (_, ch: string) => `\u0000${literal.push(ch) - 1}\u0000`);
      s = s.replace(/^(#{1,3})\s+/, "");
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)");
      s = s
        .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "$1")
        .replace(/__(?=\S)(.+?)(?<=\S)__/g, "$1")
        .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "$1")
        .replace(/(^|[^\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/gu, "$1$2");
      return s.replace(/\u0000(\d+)\u0000/g, (_, i) => literal[Number(i)]);
    })
    .join("\n");
}

// ---- toolbar (step content editor) ----------------------------------------------------

export type FormatKind = "bold" | "italic" | "heading" | "bullet" | "numbered" | "link" | "rule";

/**
 * Applies a toolbar button to the text: wraps the selection (bold, italic, link)
 * or prefixes the selected lines (heading, lists); without a selection a sample
 * word is inserted and selected. Returns the new text and selection.
 */
export function applyFormat(value: string, start: number, end: number, kind: FormatKind): { value: string; start: number; end: number } {
  const sel = value.slice(start, end);
  const wrap = (left: string, right: string, sample: string) => {
    const inner = sel || sample;
    const next = value.slice(0, start) + left + inner + right + value.slice(end);
    return { value: next, start: start + left.length, end: start + left.length + inner.length };
  };
  if (kind === "bold") return wrap("**", "**", "fett");
  if (kind === "italic") return wrap("*", "*", "kursiv");
  if (kind === "link") {
    const label = sel || "Linktext";
    const url = "https://";
    const next = `${value.slice(0, start)}[${label}](${url})${value.slice(end)}`;
    const urlStart = start + label.length + 3;
    return { value: next, start: urlStart, end: urlStart + url.length };
  }
  if (kind === "rule") {
    const before = value.slice(0, start);
    const pre = before && !before.endsWith("\n") ? "\n" : "";
    const insert = `${pre}\n---\n\n`;
    const next = before + insert + value.slice(end);
    return { value: next, start: start + insert.length, end: start + insert.length };
  }
  // line prefixes: from the start of the first selected line to the end of the last
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nl = value.indexOf("\n", Math.max(end - (end > start && value[end - 1] === "\n" ? 1 : 0), start));
  const lineEnd = nl === -1 ? value.length : nl;
  const block = value.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((l, i) => {
      const text = l.replace(/^(#{1,3}\s+|\s*[-*+]\s+|\s*\d+[.)]\s+)/, "");
      return kind === "heading" ? `## ${text}` : kind === "bullet" ? `- ${text}` : `${i + 1}. ${text}`;
    })
    .join("\n");
  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  return { value: next, start: lineStart, end: lineStart + prefixed.length };
}
