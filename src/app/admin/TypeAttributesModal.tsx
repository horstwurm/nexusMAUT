"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText } from "@/lib/client";
import {
  ATTRIBUTE_KINDS,
  ATTRIBUTE_TYPE_NAMES,
  ATTRIBUTE_TYPES,
  normalizeOptions,
  type AttributeKind,
  type AttributeType,
} from "@/lib/typeAttributes";
import { listSpecProblem, normalizeListSpec, type ListSpec } from "@/lib/serviceCall";
import type { DomainValue, TypeAttribute } from "@/lib/types";

type ColumnDraft = { attribute: string; attributeType: AttributeType; options: string };
type Draft = {
  id: string | null;
  attribute: string;
  attributeType: AttributeType;
  options: string;
  /** list (table) attribute – only where `allowList` */
  isList: boolean;
  path: string;
  columns: ColumnDraft[];
};
const NEW_COLUMN: ColumnDraft = { attribute: "", attributeType: "alpha", options: "" };
const EMPTY: Draft = { id: null, attribute: "", attributeType: "alpha", options: "", isList: false, path: "", columns: [NEW_COLUMN] };
const LIST_VALUE = "__list";

const toSpec = (d: Draft): ListSpec =>
  normalizeListSpec({ path: d.path, columns: d.columns.map((c) => ({ attribute: c.attribute, attributeType: c.attributeType, options: c.options.split("\n") })) });

const typeText = (t: AttributeType) => ATTRIBUTE_TYPES[t];

/**
 * Attribute editor: position or transaction attributes of a product/service
 * type, or the customer attributes – same shape, different API base.
 */
export function AttributesModal({
  base,
  title,
  hint,
  newLabel,
  fallbackCount,
  onClose,
  allowList,
}: {
  /** e.g. /api/domains/TYPE_ID/position-attributes or /api/customer-attributes */
  base: string;
  title: string;
  hint: string;
  /** heading of the add form, e.g. «Neues Positionsattribut» */
  newLabel: string;
  fallbackCount: number;
  onClose: (count: number) => void;
  /** offer «Liste (Tabelle)» with own columns (service GET attributes) */
  allowList?: boolean;
}) {
  const [list, setList] = useState<TypeAttribute[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<TypeAttribute[]>(base)
      .then(setList)
      .catch((err) => setError(errorText(err)));
  }, [base]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setList(await api<TypeAttribute[]>(base));
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const close = () => onClose(list?.length ?? fallbackCount);

  const move = (i: number, by: number) => {
    const a = list![i];
    const b = list![i + by];
    const sa = a.sort === b.sort ? Math.max(0, b.sort + by) : b.sort;
    return act(async () => {
      await api(`${base}/${a.id}`, { method: "PATCH", body: { sort: sa } });
      await api(`${base}/${b.id}`, { method: "PATCH", body: { sort: a.sort } });
    });
  };

  const optionList = normalizeOptions(draft.options.split("\n"));
  const listProblem = draft.isList ? listSpecProblem(toSpec(draft)) : null;
  const setColumn = (i: number, patch: Partial<ColumnDraft>) =>
    setDraft({ ...draft, columns: draft.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="small muted">{hint}</p>
        <Notice kind="error">{error}</Notice>

        {list === null ? (
          <p className="empty">Lädt …</p>
        ) : list.length === 0 ? (
          <p className="empty">Noch keine Attribute.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Attribut</th>
                  <th>Attributtyp</th>
                  <th>Optionen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((a, i) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.attribute}</strong>
                    </td>
                    <td>
                      {a.list ? (
                        <>
                          <span className="badge badge-accent">Liste</span>{" "}
                          <span className="small muted">
                            {a.list.columns.length} Spalte{a.list.columns.length === 1 ? "" : "n"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="badge">{ATTRIBUTE_TYPES[a.attributeType]}</span> <span className="mono small muted">{a.attributeType}</span>
                        </>
                      )}
                    </td>
                    <td className="small">
                      {a.list ? (
                        <>
                          {a.list.columns.map((c) => `${c.attribute} (${typeText(c.attributeType)})`).join(", ")}
                          {a.list.path && (
                            <div className="muted">
                              Pfad <code>{a.list.path}</code>
                            </div>
                          )}
                        </>
                      ) : (
                        a.options.join(", ") || <span className="muted">–</span>
                      )}
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                        <button className="btn btn-sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Nach oben">
                          ↑
                        </button>
                        <button className="btn btn-sm" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} aria-label="Nach unten">
                          ↓
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() =>
                            setDraft({
                              id: a.id,
                              attribute: a.attribute,
                              attributeType: a.attributeType,
                              options: a.options.join("\n"),
                              isList: Boolean(a.list),
                              path: a.list?.path ?? "",
                              columns: a.list?.columns.map((c) => ({ ...c, options: c.options.join("\n") })) ?? [NEW_COLUMN],
                            })
                          }
                        >
                          Bearbeiten
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Attribut «${a.attribute}» löschen?`)) act(() => api(`${base}/${a.id}`, { method: "DELETE" }));
                          }}
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form
          className="step"
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const body = draft.isList
              ? { attribute: draft.attribute, attributeType: "alpha", options: [], list: toSpec(draft) }
              : {
                  attribute: draft.attribute,
                  attributeType: draft.attributeType,
                  options: draft.attributeType === "list" ? optionList : [],
                  ...(allowList && { list: null }),
                };
            const ok = await act(() => api(draft.id ? `${base}/${draft.id}` : base, { method: draft.id ? "PUT" : "POST", body }));
            if (ok) setDraft(EMPTY);
          }}
        >
          <h3>{draft.id ? "Attribut bearbeiten" : newLabel}</h3>
          <div className="grid2">
            <label className="field">
              <span>Attribut</span>
              <input
                type="text"
                required
                maxLength={100}
                value={draft.attribute}
                onChange={(e) => setDraft({ ...draft, attribute: e.target.value })}
                placeholder="z.B. Laufzeit in Monaten"
              />
            </label>
            <label className="field">
              <span>Attributtyp</span>
              <select
                value={draft.isList ? LIST_VALUE : draft.attributeType}
                onChange={(e) =>
                  e.target.value === LIST_VALUE
                    ? setDraft({ ...draft, isList: true })
                    : setDraft({ ...draft, isList: false, attributeType: e.target.value as AttributeType })
                }
              >
                {ATTRIBUTE_TYPE_NAMES.map((t) => (
                  <option key={t} value={t}>
                    {ATTRIBUTE_TYPES[t]} ({t})
                  </option>
                ))}
                {allowList && <option value={LIST_VALUE}>Liste (Tabelle mit Spalten)</option>}
              </select>
            </label>
          </div>
          {draft.isList && (
            <>
              <label className="field" style={{ maxWidth: 420 }}>
                <span>Pfad in der Antwort</span>
                <input type="text" className="mono" maxLength={200} value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} placeholder="optional, z.B. portfolio.items" />
                <span className="hint">Leer = die Liste steht unter dem Attributnamen, z.B. {"{ \"Wertschriften\": [ … ] }"}</span>
              </label>
              <div className="field">
                <span>Spalten</span>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Spalte</th>
                        <th>Typ</th>
                        <th>Optionen (Auswahlliste)</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.columns.map((c, i) => (
                        <tr key={i}>
                          <td>
                            <input type="text" maxLength={100} value={c.attribute} onChange={(e) => setColumn(i, { attribute: e.target.value })} placeholder="z.B. ISIN" aria-label="Spaltenname" />
                          </td>
                          <td>
                            <select value={c.attributeType} onChange={(e) => setColumn(i, { attributeType: e.target.value as AttributeType })} aria-label="Spaltentyp">
                              {ATTRIBUTE_TYPE_NAMES.map((t) => (
                                <option key={t} value={t}>
                                  {ATTRIBUTE_TYPES[t]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {c.attributeType === "list" ? (
                              <textarea rows={2} value={c.options} onChange={(e) => setColumn(i, { options: e.target.value })} placeholder={"eine pro Zeile"} aria-label="Optionen" />
                            ) : (
                              <span className="muted small">–</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              disabled={draft.columns.length === 1}
                              onClick={() => setDraft({ ...draft, columns: draft.columns.filter((_, j) => j !== i) })}
                            >
                              Entfernen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setDraft({ ...draft, columns: [...draft.columns, NEW_COLUMN] })}>
                  + Spalte
                </button>
                {listProblem && (
                  <span className="hint" style={{ color: "var(--warn)" }}>
                    {listProblem}
                  </span>
                )}
              </div>
            </>
          )}
          {!draft.isList && draft.attributeType === "list" && (
            <label className="field">
              <span>Optionen</span>
              <textarea
                rows={4}
                required
                value={draft.options}
                onChange={(e) => setDraft({ ...draft, options: e.target.value })}
                placeholder={"Eine Option pro Zeile, z.B.\nBasic\nPremium"}
              />
              <span className="hint">{optionList.length} Option{optionList.length === 1 ? "" : "en"}</span>
            </label>
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            {draft.id && (
              <button type="button" className="btn" onClick={() => setDraft(EMPTY)}>
                Abbrechen
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={busy || !draft.attribute.trim() || (draft.isList ? Boolean(listProblem) : draft.attributeType === "list" && !optionList.length)}
            >
              {draft.id ? "Speichern" : "Hinzufügen"}
            </button>
          </div>
        </form>

        <div className="actions">
          <button className="btn" onClick={close}>
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}

/** Position or transaction attributes of one product/service type. */
export function TypeAttributesModal({ type, kind, onClose }: { type: DomainValue; kind: AttributeKind; onClose: (count: number) => void }) {
  const meta = ATTRIBUTE_KINDS[kind];
  return (
    <AttributesModal
      base={`/api/domains/${type.id}/${meta.path}`}
      title={`${meta.title} von «${type.label}»`}
      hint={meta.hint}
      newLabel={`Neues ${kind === "position" ? "Positions" : "Transaktions"}attribut`}
      fallbackCount={type.attributeCounts?.[kind] ?? 0}
      onClose={onClose}
    />
  );
}
