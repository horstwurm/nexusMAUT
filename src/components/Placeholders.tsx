"use client";

import { Fragment, useState, type RefObject } from "react";
import { CONDITION_OP_LABELS, CONDITION_OPS, conditionText, UNARY_OPS, type ConditionOp } from "@/lib/conditions";
import { CATEGORIES, findPlaceholders, isConditionTag, unknownPlaceholders, type PlaceholderGroup } from "@/lib/placeholders";
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
  const [conditionOpen, setConditionOpen] = useState(false);
  if (!catalog) return <p className="small muted">Platzhalter laden …</p>;
  const group = catalog.find((g) => g.id === groupId) ?? catalog[0];
  const used = findPlaceholders(value).filter((t) => !isConditionTag(t));
  const unknown = unknownPlaceholders(value, catalog);

  return (
    <div className="placeholder-picker">
      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <span className="small" style={{ fontWeight: 600 }}>
          Platzhalter einfügen
        </span>
        <button type="button" className="btn btn-sm" style={{ marginLeft: "auto", order: 1 }} onClick={() => setConditionOpen(!conditionOpen)} aria-expanded={conditionOpen}>
          {conditionOpen ? "Bedingung schliessen" : "+ Bedingung einfügen"}
        </button>
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
      {conditionOpen && (
        <ConditionForm
          catalog={catalog}
          onInsert={(cond, withElse) => {
            const el = textarea.current;
            const start = el?.selectionStart ?? value.length;
            const end = el?.selectionEnd ?? value.length;
            const selected = value.slice(start, end);
            const atLineStart = start === 0 || value[start - 1] === "\n";
            const text =
              `${atLineStart ? "" : "\n"}{{#Wenn ${cond}}}\n${selected || "Text, wenn die Bedingung zutrifft"}\n` +
              (withElse ? "{{#Sonst}}\nText sonst\n" : "") +
              "{{/Wenn}}\n";
            onChange(insertAtCursor(el, value, text));
            setConditionOpen(false);
          }}
        />
      )}
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

/**
 * «Bedingung einfügen»: field (any value placeholder), comparison and value (list
 * options / Ja-Nein offered) → {{#Wenn …}} … [{{#Sonst}} …] {{/Wenn}} at the cursor
 * (the selected text becomes the conditional part).
 */
function ConditionForm({ catalog, onInsert }: { catalog: PlaceholderGroup[]; onInsert: (condition: string, withElse: boolean) => void }) {
  const fields = catalog.flatMap((g) => g.items.filter((p) => p.kind !== "block" && p.kind !== "textblock").map((p) => ({ group: g, p, path: p.token.slice(2, -2) })));
  const [path, setPath] = useState(fields[0]?.path ?? "");
  const [op, setOp] = useState<ConditionOp>("=");
  const [val, setVal] = useState("");
  const [withElse, setWithElse] = useState(true);
  const field = fields.find((f) => f.path === path);
  const unary = UNARY_OPS.includes(op);
  const choices = field?.p.type === "bool" ? ["Ja", "Nein"] : (field?.p.options ?? null);
  const ops = CONDITION_OPS.filter((o) => (field?.p.type === "num" || field?.p.type === "date" ? o !== "enthält" : field?.p.type === "list" || field?.p.type === "bool" ? ["=", "≠", "leer", "nicht leer"].includes(o) : true));
  return (
    <div className="condition-form">
      <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
        <label className="field" style={{ margin: 0, flex: "2 1 220px" }}>
          <span>Feld</span>
          <select
            value={path}
            onChange={(e) => {
              setPath(e.target.value);
              setVal("");
            }}
          >
            {CATEGORIES.map((cat) => {
              const list = fields.filter((f) => f.group.category === cat);
              if (!list.length) return null;
              return (
                <optgroup key={cat} label={cat}>
                  {list.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.group.category === "Kunde" ? f.p.label : `${f.group.label.replace(/^\w+ – /, "")} · ${f.p.label}`}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
        <label className="field" style={{ margin: 0, flex: "1 1 140px" }}>
          <span>Vergleich</span>
          <select value={ops.includes(op) ? op : "="} onChange={(e) => setOp(e.target.value as ConditionOp)}>
            {ops.map((o) => (
              <option key={o} value={o}>
                {CONDITION_OP_LABELS[o]}
              </option>
            ))}
          </select>
        </label>
        {!unary && (
          <label className="field" style={{ margin: 0, flex: "1 1 160px" }}>
            <span>Wert</span>
            {choices ? (
              <select value={val} onChange={(e) => setVal(e.target.value)}>
                <option value="">– wählen –</option>
                {choices.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder={field?.p.type === "date" ? "TT.MM.JJJJ oder heute" : field?.p.type === "num" ? "z.B. 500000" : "Text"}
              />
            )}
          </label>
        )}
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={withElse} onChange={(e) => setWithElse(e.target.checked)} /> mit «Sonst»-Teil
        </label>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!field || (!unary && !val.trim())}
          onClick={() => onInsert(conditionText({ path, op: ops.includes(op) ? op : "=", value: val.trim() }), withElse)}
        >
          Einfügen
        </button>
      </div>
      <p className="small muted" style={{ margin: "6px 0 0" }}>
        Ohne Wert trifft nur «ist leer» zu – sonst gilt der «Sonst»-Teil. Markierter Text wird zum bedingten Teil.
      </p>
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
          <mark key={i} className={`ph${isConditionTag(p) ? " ph-cond" : ""}${unknown.has(`{{${p.slice(2, -2).trim()}}}`) ? " ph-unknown" : ""}`}>
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}
