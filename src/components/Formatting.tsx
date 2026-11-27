"use client";

import type { RefObject } from "react";
import { applyFormat, markdownToHtml, type FormatKind } from "@/lib/markdown";
import { isConditionTag } from "@/lib/placeholders";

const BUTTONS: { kind: FormatKind; label: string; title: string; style?: React.CSSProperties }[] = [
  { kind: "bold", label: "B", title: "Fett (**Text**)", style: { fontWeight: 700 } },
  { kind: "italic", label: "I", title: "Kursiv (*Text*)", style: { fontStyle: "italic" } },
  { kind: "heading", label: "Titel", title: "Zwischentitel (## Titel)" },
  { kind: "bullet", label: "• Liste", title: "Aufzählung (- Punkt)" },
  { kind: "numbered", label: "1. Liste", title: "Nummerierte Liste (1. Punkt)" },
  { kind: "link", label: "Link", title: "Link ([Text](https://…))" },
  { kind: "rule", label: "—", title: "Trennlinie (---)" },
];

/** Formatting buttons above a step content textarea: wrap the selection or prefix the selected lines (Markdown). */
export function FormatToolbar({ value, onChange, textarea }: { value: string; onChange: (v: string) => void; textarea: RefObject<HTMLTextAreaElement | null> }) {
  const apply = (kind: FormatKind) => {
    const el = textarea.current;
    const r = applyFormat(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length, kind);
    onChange(r.value);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.start, r.end);
    });
  };
  return (
    <div className="format-toolbar" role="toolbar" aria-label="Formatierung">
      {BUTTONS.map((b) => (
        <button key={b.kind} type="button" className="btn btn-sm" title={b.title} style={b.style} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(b.kind)}>
          {b.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A formatted content (Markdown → HTML, all HTML escaped by markdownToHtml);
 * `{{placeholders}}` still in it are highlighted.
 */
export function FormattedContent({ markdown, className = "" }: { markdown: string; className?: string }) {
  const html = markdownToHtml(markdown).replace(/\{\{[^{}]+\}\}/g, (m) => `<mark class="ph${isConditionTag(m) ? " ph-cond" : ""}">${m}</mark>`);
  if (!html) return <span className="muted">(kein Inhalt)</span>;
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** «n / max Zeichen» – red when over the action's limit. */
export function CharCount({ length, max, hint }: { length: number; max: number | null; hint?: string }) {
  const over = max !== null && length > max;
  return (
    <span className="hint" style={over ? { color: "var(--danger)" } : undefined}>
      {length.toLocaleString("de-CH")}
      {max !== null ? ` / ${max.toLocaleString("de-CH")}` : ""} Zeichen
      {over && " – länger als die Zeichengrenze der Aktion"}
      {hint && <> · {hint}</>}
    </span>
  );
}
