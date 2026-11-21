"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import { formatDay } from "@/lib/customers";
import { labelOf } from "@/lib/domains";
import type { AttributeDef } from "@/lib/positions";
import {
  COUNT_OPERATORS,
  DAYS_OPERATORS,
  CUSTOMER_FIELDS,
  NO_VALUE,
  OPERATORS,
  OPERATORS_BY_TYPE,
  type AttrFilter,
  type Condition,
  type CustomerField,
  type Operator,
  type RuleValue,
  TODAY,
} from "@/lib/rules";
import type { AttributeType } from "@/lib/typeAttributes";
import type { DomainValue, RuleView } from "@/lib/types";

type Attrs = Record<string, AttributeDef[]>;
type Lookup = { types: DomainValue[]; positionAttributes: Attrs; trxAttributes: Attrs; customerAttributes: AttributeDef[] };
type Match = { id: string; name: string; lastname: string; dateOfBirth: string };

const LEVELS = { customer: "Kunde", position: "Position", trx: "Transaktion" } as const;

// --- texts -------------------------------------------------------------------------------

const findAttr = (attrs: Attrs, id: string | null | undefined) => (id ? Object.values(attrs).flat().find((a) => a.id === id) : undefined);

function valueText(type: AttributeType, op: Operator, value: RuleValue) {
  if (NO_VALUE.includes(op)) return "";
  if (DAYS_OPERATORS.includes(op)) return ` ${value} Tage${op.startsWith("anniversary") ? "n" : ""}`;
  if (op === "between" && Array.isArray(value)) {
    const [from, to] = value;
    if (from && to) return ` ${dayText(from)} – ${dayText(to)}`;
    return from ? ` ab ${dayText(from)}` : ` bis ${dayText(to ?? "")}`;
  }
  if (Array.isArray(value)) return ` ${value.join(", ")}`;
  if (type === "date" && typeof value === "string") return ` ${dayText(value)}`;
  if (typeof value === "number") return ` ${value.toLocaleString("de-CH")}`;
  return ` «${value ?? ""}»`;
}

function opText(op: Operator) {
  if (op === "lastDays") return "in den letzten";
  if (op === "nextDays") return "in den nächsten";
  if (op === "anniversaryNext") return "Jahrestag in den nächsten";
  if (op === "anniversaryLast") return "Jahrestag in den letzten";
  return OPERATORS[op];
}

function filterText(filter: AttrFilter | null, attrs: Attrs) {
  if (!filter) return "";
  const a = findAttr(attrs, filter.attrId);
  if (!a) return " mit (gelöschtes Attribut)";
  return ` mit ${a.attribute} ${opText(filter.op)}${valueText(a.attributeType, filter.op, filter.value)}`;
}

/** A date value or «heute» as text. */
const dayText = (v: string) => (v === TODAY ? "heute" : formatDay(v));

/** One condition as a sentence, e.g. «Positionen Konto mit Saldo > 50'000: Anzahl ≥ 1». */
export function describe(c: Condition, l: Lookup) {
  if (c.level === "customer") {
    if (c.field === "attribute") {
      const a = l.customerAttributes.find((x) => x.id === c.attrId);
      if (!a) return "(gelöschtes Kundenattribut)";
      return `${a.attribute} ${opText(c.op)}${valueText(a.attributeType, c.op, c.value)}`;
    }
    const f = CUSTOMER_FIELDS[c.field];
    return `${f.label} ${opText(c.op)}${valueText(f.type, c.op, c.value)}`;
  }
  const type = labelOf(l.types, c.type);
  if (c.level === "position") {
    return `Positionen «${type}»${filterText(c.filter, l.positionAttributes)}: Anzahl ${OPERATORS[c.op]} ${c.value}`;
  }
  const period = c.period ? `, letzte ${c.period.days} Tage (${findAttr(l.trxAttributes, c.period.dateAttrId)?.attribute ?? "?"})` : "";
  const measure = c.measure === "count" ? "Anzahl" : `Summe ${findAttr(l.trxAttributes, c.sumAttrId)?.attribute ?? "?"}`;
  return `Transaktionen «${type}»${filterText(c.filter, l.trxAttributes)}${period}: ${measure} ${OPERATORS[c.op]} ${c.value.toLocaleString("de-CH")}`;
}

// --- list -------------------------------------------------------------------------------

export function RulesClient({
  initial,
  customerTotal,
  types,
  positionAttributes,
  trxAttributes,
  customerAttributes,
}: {
  initial: RuleView[];
  customerTotal: number;
  types: DomainValue[];
  positionAttributes: Attrs;
  trxAttributes: Attrs;
  customerAttributes: AttributeDef[];
}) {
  const lookup: Lookup = { types, positionAttributes, trxAttributes, customerAttributes };
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<RuleView | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = async () => setList(await api<RuleView[]>("/api/rules"));

  async function remove(r: RuleView) {
    if (!window.confirm(`Selektion «${r.name}» löschen?`)) return;
    setError(null);
    try {
      await api(`/api/rules/${r.id}`, { method: "DELETE" });
      setInfo("Selektion gelöscht.");
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kunden Selektionen</h1>
          <p className="muted" style={{ margin: 0 }}>
            Kundensegmente nach Bedingungen auf Kunde, Positionen und Transaktionen – mit den aktuellen Treffern.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Neue Selektion
        </button>
      </div>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{info}</Notice>

      <section className="card">
        {list.length === 0 ? (
          <p className="empty">Noch keine Selektionen.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 1 }} aria-label="Treffer aufklappen" />
                  <th>Selektion</th>
                  <th>Bedingungen</th>
                  <th className="num">Treffer</th>
                  <th>Geändert</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td>
                        <button
                          className="btn btn-sm accordion-toggle"
                          onClick={() => setOpen(open === r.id ? null : r.id)}
                          aria-expanded={open === r.id}
                          title={open === r.id ? "Treffer schliessen" : "Treffer anzeigen"}
                        >
                          {open === r.id ? "▾" : "▸"} {r.matchCount ?? 0}
                        </button>
                      </td>
                      <td>
                        <strong>{r.name}</strong>
                        {r.description && <div className="small muted">{r.description}</div>}
                      </td>
                      <td className="small">
                        <div className="muted" style={{ marginBottom: 2 }}>
                          {r.match === "all" ? "Alle Bedingungen:" : "Mindestens eine Bedingung:"}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {r.conditions.map((c, i) => (
                            <li key={i}>
                              <span className="badge" style={{ marginRight: 6 }}>
                                {LEVELS[c.level]}
                              </span>
                              {describe(c, lookup)}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="num">
                        <strong>{r.matchCount ?? 0}</strong>
                        <div className="small muted">{customerTotal ? `${Math.round(((r.matchCount ?? 0) / customerTotal) * 100)} %` : ""}</div>
                      </td>
                      <td>{formatDate(r.updatedAt)}</td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <button className="btn btn-sm" onClick={() => setEditing(r)}>
                            Bearbeiten
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr>
                        <td colSpan={6} className="accordion-body">
                          <Matches url={`/api/rules/${r.id}/matches`} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <RuleEditor
          initial={editing === "new" ? null : editing}
          lookup={lookup}
          customerTotal={customerTotal}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            setInfo(msg);
            await reload();
          }}
        />
      )}
    </>
  );
}

/** The customers matching a saved rule (loaded when opened). */
function Matches({ url }: { url: string }) {
  const [list, setList] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Match[]>(url)
      .then(setList)
      .catch((err) => setError(errorText(err)));
  }, [url]);
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!list) return <p className="small muted">Lädt …</p>;
  return <MatchList customers={list} total={list.length} />;
}

function MatchList({ customers, total }: { customers: Match[]; total: number }) {
  if (!total) return <p className="small muted" style={{ margin: 0 }}>Keine Kunden erfüllen diese Selektion.</p>;
  return (
    <div>
      <h4 style={{ margin: "0 0 8px" }}>
        Treffer <span className="count-badge">{total}</span>
        {customers.length < total && <span className="small muted"> – die ersten {customers.length}</span>}
      </h4>
      <div className="tags">
        {customers.map((c) => (
          <Link key={c.id} href={`/customers/${c.id}`} className="badge" title={`geboren ${formatDay(c.dateOfBirth)}`}>
            {c.lastname} {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

// --- editor -------------------------------------------------------------------------------

type Draft = { name: string; description: string; match: "all" | "any"; conditions: Condition[] };

function defaultCondition(level: Condition["level"], l: Lookup): Condition {
  const withPos = l.types.find((t) => t.active && l.positionAttributes[t.code]?.length) ?? l.types[0];
  const withTrx = l.types.find((t) => t.active && l.trxAttributes[t.code]?.length) ?? withPos;
  if (level === "customer") return { level, field: "age", op: "gte", value: 18 };
  if (level === "position") return { level, type: withPos?.code ?? "", filter: null, op: "gte", value: 1 };
  return { level, type: withTrx?.code ?? "", filter: null, period: null, measure: "count", sumAttrId: null, op: "gte", value: 1 };
}

const defaultValue = (type: AttributeType, op: Operator, options: string[]): RuleValue => {
  if (NO_VALUE.includes(op)) return null;
  if (DAYS_OPERATORS.includes(op)) return 30;
  if (op === "in") return [];
  if (op === "between") {
    // this calendar year as a starting point
    const year = new Date().getFullYear();
    return [`${year}-01-01`, `${year}-12-31`];
  }
  if (type === "num") return 0;
  if (type === "date") return new Date().toISOString().slice(0, 10);
  if (type === "list") return options[0] ?? "";
  return "";
};

function RuleEditor({
  initial,
  lookup,
  customerTotal,
  onClose,
  onSaved,
}: {
  initial: RuleView | null;
  lookup: Lookup;
  customerTotal: number;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void>;
}) {
  const [d, setD] = useState<Draft>(() =>
    initial
      ? { name: initial.name, description: initial.description, match: initial.match, conditions: initial.conditions }
      : { name: "", description: "", match: "all", conditions: [defaultCondition("customer", lookup)] },
  );
  const [preview, setPreview] = useState<{ count: number; customers: Match[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setCondition = (i: number, c: Condition) => {
    setD({ ...d, conditions: d.conditions.map((x, j) => (j === i ? c : x)) });
    setPreview(null);
  };

  async function check() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await api("/api/rules/preview", { body: { match: d.match, conditions: d.conditions } }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal modal-wide"
        style={{ maxWidth: 980 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(initial ? `/api/rules/${initial.id}` : "/api/rules", { method: initial ? "PUT" : "POST", body: d });
            await onSaved(initial ? "Selektion gespeichert." : "Selektion angelegt.");
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        <h2>{initial ? "Selektion bearbeiten" : "Neue Selektion"}</h2>
        <Notice kind="error">{error}</Notice>
        <div className="grid2">
          <label className="field">
            <span>Name</span>
            <input type="text" required maxLength={120} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus placeholder="z.B. Vermögende Reisende" />
          </label>
          <label className="field">
            <span>Beschreibung</span>
            <input type="text" maxLength={1000} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
          </label>
        </div>

        <div className="row" style={{ marginBottom: 10 }}>
          <span className="small" style={{ fontWeight: 600 }}>
            Treffer, wenn
          </span>
          <select
            value={d.match}
            onChange={(e) => {
              setD({ ...d, match: e.target.value as Draft["match"] });
              setPreview(null);
            }}
            style={{ width: "auto" }}
          >
            <option value="all">alle Bedingungen</option>
            <option value="any">mindestens eine Bedingung</option>
          </select>
          <span className="small" style={{ fontWeight: 600 }}>
            erfüllt sind:
          </span>
        </div>

        {d.conditions.map((c, i) => (
          <div key={i} className="step">
            <div className="step-head">
              <select
                value={c.level}
                onChange={(e) => setCondition(i, defaultCondition(e.target.value as Condition["level"], lookup))}
                style={{ width: "auto" }}
                aria-label="Ebene"
              >
                {Object.entries(LEVELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <span className="grow small muted">{describe(c, lookup)}</span>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => {
                  setD({ ...d, conditions: d.conditions.filter((_, j) => j !== i) });
                  setPreview(null);
                }}
              >
                Entfernen
              </button>
            </div>
            <ConditionFields c={c} lookup={lookup} onChange={(next) => setCondition(i, next)} />
          </div>
        ))}
        <div className="row">
          {(Object.keys(LEVELS) as Condition["level"][]).map((level) => (
            <button
              key={level}
              type="button"
              className="btn btn-sm"
              disabled={d.conditions.length >= 30}
              onClick={() => {
                setD({ ...d, conditions: [...d.conditions, defaultCondition(level, lookup)] });
                setPreview(null);
              }}
            >
              + {LEVELS[level]}
            </button>
          ))}
        </div>

        <hr />
        <div className="row" style={{ marginBottom: 10 }}>
          <button type="button" className="btn" onClick={check} disabled={busy || !d.conditions.length}>
            Treffer prüfen
          </button>
          {preview && (
            <span className="small muted">
              {preview.count} von {customerTotal} Kunden
            </span>
          )}
        </div>
        {preview && <MatchList customers={preview.customers} total={preview.count} />}

        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}

// --- condition fields ----------------------------------------------------------------------

function ConditionFields({ c, lookup, onChange }: { c: Condition; lookup: Lookup; onChange: (c: Condition) => void }) {
  if (c.level === "customer") {
    // built-in field, or «attr:ID» for a customer attribute
    const attr = c.field === "attribute" ? lookup.customerAttributes.find((a) => a.id === c.attrId) : undefined;
    const type: AttributeType = c.field === "attribute" ? (attr?.attributeType ?? "alpha") : CUSTOMER_FIELDS[c.field].type;
    return (
      <div className="row" style={{ alignItems: "flex-start" }}>
        <select
          value={c.field === "attribute" ? `attr:${c.attrId ?? ""}` : c.field}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("attr:")) {
              const a = lookup.customerAttributes.find((x) => x.id === v.slice(5));
              if (!a) return;
              const op = OPERATORS_BY_TYPE[a.attributeType][0];
              onChange({ ...c, field: "attribute", attrId: a.id, op, value: defaultValue(a.attributeType, op, a.options) });
              return;
            }
            const field = v as CustomerField;
            const t = CUSTOMER_FIELDS[field].type;
            const op = OPERATORS_BY_TYPE[t][0];
            onChange({ ...c, field, attrId: null, op, value: defaultValue(t, op, []) });
          }}
          style={{ width: "auto" }}
          aria-label="Feld"
        >
          {Object.entries(CUSTOMER_FIELDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
          {c.field === "attribute" && !attr && <option value={`attr:${c.attrId ?? ""}`}>(gelöschtes Kundenattribut)</option>}
          {lookup.customerAttributes.length > 0 && (
            <optgroup label="Kundenattribute">
              {lookup.customerAttributes.map((a) => (
                <option key={a.id} value={`attr:${a.id}`}>
                  {a.attribute}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <Comparison
          type={type}
          options={attr?.options ?? []}
          op={c.op}
          value={c.value}
          onChange={(op, value) => onChange({ ...c, op, value })}
        />
      </div>
    );
  }

  const attrs = c.level === "position" ? lookup.positionAttributes : lookup.trxAttributes;
  const defs = attrs[c.type] ?? [];
  const typeOptions = lookup.types.filter((t) => attrs[t.code]?.length || t.code === c.type);
  const setType = (type: string) =>
    onChange(c.level === "position" ? { ...c, type, filter: null } : { ...c, type, filter: null, period: null, sumAttrId: null, measure: "count" });

  return (
    <div className="stack" style={{ marginTop: 0 }}>
      <div className="row">
        <span className="small" style={{ width: 90 }}>
          Typ
        </span>
        <select value={c.type} onChange={(e) => setType(e.target.value)} style={{ width: "auto" }} aria-label="Produkt-/Dienstleistungstyp">
          {!typeOptions.some((t) => t.code === c.type) && <option value={c.type}>{c.type || "–"}</option>}
          {typeOptions.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
              {t.active ? "" : " (inaktiv)"}
            </option>
          ))}
        </select>
      </div>

      <FilterFields
        label={c.level === "position" ? "nur Positionen mit" : "nur Transaktionen mit"}
        defs={defs}
        filter={c.filter}
        onChange={(filter) => onChange({ ...c, filter })}
      />

      {c.level === "trx" && (
        <div className="row">
          <span className="small" style={{ width: 90 }}>
            Zeitraum
          </span>
          <select
            value={c.period?.dateAttrId ?? ""}
            onChange={(e) => onChange({ ...c, period: e.target.value ? { dateAttrId: e.target.value, days: c.period?.days ?? 90 } : null })}
            style={{ width: "auto" }}
            aria-label="Datumsattribut"
          >
            <option value="">alle Transaktionen</option>
            {defs
              .filter((a) => a.attributeType === "date")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.attribute} in den letzten …
                </option>
              ))}
          </select>
          {c.period && (
            <>
              <input
                type="number"
                min={1}
                max={3650}
                value={c.period.days}
                onChange={(e) => onChange({ ...c, period: { ...c.period!, days: Math.max(1, Math.min(3650, Number(e.target.value) || 1)) } })}
                style={{ width: 90 }}
                aria-label="Tage"
              />
              <span className="small">Tagen</span>
            </>
          )}
        </div>
      )}

      <div className="row">
        <span className="small" style={{ width: 90 }}>
          Bedingung
        </span>
        {c.level === "trx" ? (
          <select
            value={c.measure === "count" ? "count" : `sum:${c.sumAttrId ?? ""}`}
            onChange={(e) =>
              onChange(e.target.value === "count" ? { ...c, measure: "count", sumAttrId: null } : { ...c, measure: "sum", sumAttrId: e.target.value.slice(4) })
            }
            style={{ width: "auto" }}
            aria-label="Messgrösse"
          >
            <option value="count">Anzahl</option>
            {defs
              .filter((a) => a.attributeType === "num")
              .map((a) => (
                <option key={a.id} value={`sum:${a.id}`}>
                  Summe {a.attribute}
                </option>
              ))}
          </select>
        ) : (
          <span className="small">Anzahl</span>
        )}
        <select value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as Operator })} style={{ width: "auto" }} aria-label="Vergleich">
          {COUNT_OPERATORS.map((op) => (
            <option key={op} value={op}>
              {OPERATORS[op]}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="any"
          min={0}
          value={c.value}
          onChange={(e) => onChange({ ...c, value: Number(e.target.value) || 0 })}
          style={{ width: 140 }}
          aria-label="Wert"
        />
        {c.level === "position" && (
          <span className="small muted">
            {c.op === "gte" && c.value === 1 ? "= hat mindestens eine" : c.op === "eq" && c.value === 0 ? "= hat keine" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function FilterFields({
  label,
  defs,
  filter,
  onChange,
}: {
  label: string;
  defs: AttributeDef[];
  filter: AttrFilter | null;
  onChange: (f: AttrFilter | null) => void;
}) {
  const attr = defs.find((a) => a.id === filter?.attrId);
  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <span className="small" style={{ width: 90, paddingTop: 8 }}>
        Filter
      </span>
      <select
        value={filter?.attrId ?? ""}
        onChange={(e) => {
          const a = defs.find((x) => x.id === e.target.value);
          if (!a) return onChange(null);
          const op = OPERATORS_BY_TYPE[a.attributeType][0];
          onChange({ attrId: a.id, op, value: defaultValue(a.attributeType, op, a.options) });
        }}
        style={{ width: "auto" }}
        aria-label={label}
      >
        <option value="">ohne Filter</option>
        {filter && !attr && <option value={filter.attrId}>(gelöschtes Attribut)</option>}
        {defs.map((a) => (
          <option key={a.id} value={a.id}>
            {label} {a.attribute}
          </option>
        ))}
      </select>
      {filter && attr && (
        <Comparison
          type={attr.attributeType}
          options={attr.options}
          op={filter.op}
          value={filter.value}
          onChange={(op, value) => onChange({ ...filter, op, value })}
        />
      )}
    </div>
  );
}

/** Operator + value input for one value type. */
function Comparison({
  type,
  options,
  op,
  value,
  onChange,
}: {
  type: AttributeType;
  options: string[];
  op: Operator;
  value: RuleValue;
  onChange: (op: Operator, value: RuleValue) => void;
}) {
  const ops = OPERATORS_BY_TYPE[type];
  return (
    <>
      <select
        value={op}
        onChange={(e) => {
          const next = e.target.value as Operator;
          // keep the value when it still fits the new operator
          const kind = (o: Operator) =>
            NO_VALUE.includes(o) ? "none" : DAYS_OPERATORS.includes(o) ? "days" : o === "in" ? "set" : o === "between" ? "range" : "value";
          onChange(next, kind(next) === kind(op) ? value : defaultValue(type, next, options));
        }}
        style={{ width: "auto" }}
        aria-label="Operator"
      >
        {!ops.includes(op) && <option value={op}>{OPERATORS[op]}</option>}
        {ops.map((o) => (
          <option key={o} value={o}>
            {OPERATORS[o]}
          </option>
        ))}
      </select>
      <ValueInput type={type} options={options} op={op} value={value} onChange={(v) => onChange(op, v)} />
    </>
  );
}

function ValueInput({
  type,
  options,
  op,
  value,
  onChange,
}: {
  type: AttributeType;
  options: string[];
  op: Operator;
  value: RuleValue;
  onChange: (v: RuleValue) => void;
}) {
  if (NO_VALUE.includes(op)) return null;
  if (DAYS_OPERATORS.includes(op)) {
    return (
      <>
        <input
          type="number"
          min={0}
          max={op.startsWith("anniversary") ? 366 : 3650}
          value={typeof value === "number" ? value : 30}
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          style={{ width: 90 }}
          aria-label="Tage"
        />
        <span className="small">Tagen</span>
        {op.startsWith("anniversary") && <span className="small muted">(Tag und Monat, z.B. Geburtstag; 0 = heute)</span>}
      </>
    );
  }
  if (op === "between") {
    const [from, to] = Array.isArray(value) ? value : ["", ""];
    const set = (i: 0 | 1, v: string) => onChange(i === 0 ? [v, to ?? ""] : [from ?? "", v]);
    const fixed = (v: string | undefined) => (v && v !== TODAY ? v : undefined);
    return (
      <>
        <span className="small">von</span>
        <DateValue value={from ?? ""} onChange={(v) => set(0, v)} max={fixed(to)} label="von" allowEmpty />
        <span className="small">bis</span>
        <DateValue value={to ?? ""} onChange={(v) => set(1, v)} min={fixed(from)} label="bis" allowEmpty />
        <span className="small muted">(ein Ende leer = offen)</span>
      </>
    );
  }
  if (op === "in") {
    const set = Array.isArray(value) ? value : [];
    return (
      <div className="tags" style={{ maxWidth: 420 }}>
        {options.map((o) => (
          <label key={o} className="check" style={{ marginBottom: 0, marginRight: 10 }}>
            <input type="checkbox" checked={set.includes(o)} onChange={(e) => onChange(e.target.checked ? [...set, o] : set.filter((x) => x !== o))} />
            <span className="small">{o}</span>
          </label>
        ))}
      </div>
    );
  }
  if (type === "list") {
    return (
      <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} style={{ width: "auto" }} aria-label="Wert">
        {typeof value === "string" && value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (type === "num") {
    return (
      <input type="number" step="any" value={typeof value === "number" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} style={{ width: 140 }} aria-label="Wert" />
    );
  }
  if (type === "date") {
    return <DateValue value={typeof value === "string" ? value : ""} onChange={onChange} label="Datum" />;
  }
  return <input type="text" maxLength={200} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} style={{ width: 220 }} aria-label="Wert" />;
}

/** A date or «heute» (the day the rule is evaluated) – `allowEmpty` for open range ends. */
function DateValue({
  value,
  onChange,
  label,
  min,
  max,
  allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  min?: string;
  max?: string;
  allowEmpty?: boolean;
}) {
  const isToday = value === TODAY;
  return (
    <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
      <select
        value={isToday ? "today" : "date"}
        onChange={(e) => onChange(e.target.value === "today" ? TODAY : allowEmpty ? "" : new Date().toISOString().slice(0, 10))}
        style={{ width: "auto" }}
        aria-label={`${label}: Datum oder heute`}
      >
        <option value="date">Datum</option>
        <option value="today">heute</option>
      </select>
      {!isToday && (
        <input type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} style={{ width: 160 }} aria-label={label} />
      )}
    </span>
  );
}
