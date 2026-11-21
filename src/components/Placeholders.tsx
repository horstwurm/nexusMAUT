"use client";

import { Fragment, useState, type RefObject } from "react";
import { CATEGORIES, findPlaceholders, unknownPlaceholders, type PlaceholderGroup } from "@/lib/placeholders";
import { ATTRIBUTE_TYPES } from "@/lib/typeAttributes";

/** Inserts `text` at the cursor of a textarea and returns the new value (cursor placed after it). */
export function insertAtCursor(el: HTMLTextAreaElement | null, value: string, text: string) {
  if (!el) return value + text;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + text + value.slice(end);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
  return next;
}

/**
 * «Platzhalter einfügen»: groups (Kunde, Produkte, Position – Typ,
 * Transaktion – Typ) and their placeholders; a click inserts at the cursor.
 * Below: the placeholders used and warnings for unknown ones.
 */
export function PlaceholderPicker({
  catalog,
  value,
  onChange,
  textarea,
}: {
  catalog: PlaceholderGroup[] | null;
  value: string;
  onChange: (v: string) => void;
  textarea: RefObject<HTMLTextAreaElement | null>;
}) {
  const [groupId, setGroupId] = useState("kunde");
  if (!catalog) return <p className="small muted">Platzhalter laden …</p>;
  const group = catalog.find((g) => g.id === groupId) ?? catalog[0];
  const used = findPlaceholders(value);
  const unknown = unknownPlaceholders(value, catalog);

  return (
    <div className="placeholder-picker">
      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <span className="small" style={{ fontWeight: 600 }}>
          Platzhalter einfügen
        </span>
        <select value={group.id} onChange={(e) => setGroupId(e.target.value)} style={{ width: "auto" }} aria-label="Bereich">
          {CATEGORIES.map((cat) => {
            const groups = catalog.filter((g) => g.category === cat);
            if (!groups.length) return null;
            return (
              <optgroup key={cat} label={cat}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label} ({g.items.length})
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>
      <div className="tags">
        {group.items.map((p) => (
          <button
            key={p.token}
            type="button"
            className="badge ph-chip"
            title={p.kind === "block" ? `${p.token} … – wiederholt den Inhalt für jede Zeile; darin: ${p.columns?.map((c) => `{{${c}}}`).join(" ")}` : `${p.token} · ${ATTRIBUTE_TYPES[p.type]}`}
            onClick={() => onChange(insertAtCursor(textarea.current, value, p.insert ?? p.token))}
          >
            {p.kind === "block" ? "⟳ " : "+ "}
            {p.label}
          </button>
        ))}
      </div>
      {catalog.length <= 2 && (
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          Positions- und Transaktionsattribute erscheinen hier, sobald sie in der Administration bei einem Produkt-/Dienstleistungstyp
          definiert sind, Services mit ihren GET-Attributen.
        </p>
      )}
      {used.length > 0 && (
        <div className="small" style={{ marginTop: 8 }}>
          <span className="muted">Verwendet: </span>
          {used.map((t) => (
            <code key={t} className={unknown.includes(t) ? "ph-unknown" : ""} style={{ marginRight: 4 }}>
              {t}
            </code>
          ))}
        </div>
      )}
      {unknown.length > 0 && (
        <p className="small" style={{ color: "var(--warn)", margin: "6px 0 0" }}>
          Unbekannt (Tippfehler, umbenanntes oder gelöschtes Attribut?): {unknown.join(", ")}
        </p>
      )}
    </div>
  );
}

/** Text with its placeholders highlighted (unknown ones marked), line breaks kept. */
export function WithPlaceholders({ text, catalog }: { text: string; catalog: PlaceholderGroup[] | null }) {
  const unknown = new Set(catalog ? unknownPlaceholders(text, catalog) : []);
  const parts = text.split(/(\{\{[^{}]+\}\})/g);
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {parts.map((p, i) =>
        /^\{\{[^{}]+\}\}$/.test(p) ? (
          <mark key={i} className={`ph${unknown.has(`{{${p.slice(2, -2).trim()}}}`) ? " ph-unknown" : ""}`}>
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}
