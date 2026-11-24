"use client";

import { SourceCells, SourceHeaders } from "./SourceColumns";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText } from "@/lib/client";
import { labelOf } from "@/lib/domains";
import type { AttributeDef, PositionValue } from "@/lib/positions";
import type { CustomerPosition, DomainValue, ServiceFetchedView } from "@/lib/types";
import { AttrCell, AttrHeader, AttributeFields, formValues, type FormValue } from "./AttributeFields";
import { Transactions } from "./Transactions";

export type AttributesByType = Record<string, AttributeDef[]>;

type Props = {
  /** /api/customers/ID/positions */
  url: string;
  types: DomainValue[];
  /** type code → its position attributes */
  attributesByType: AttributesByType;
  /** type code → its transaction attributes */
  trxAttributesByType: AttributesByType;
  positions: CustomerPosition[];
  isAdmin: boolean;
  onChange: (list: CustomerPosition[]) => void;
  /** inside another list (Kunden accordion): no card, smaller heading */
  embedded?: boolean;
};

/**
 * The customer's positions, one table per product/service type with a
 * column per position attribute. Each position opens (accordion) to its
 * transactions.
 */
export function Positions({ url, types, attributesByType, trxAttributesByType, positions, isAdmin, onChange, embedded }: Props) {
  const [editing, setEditing] = useState<CustomerPosition | "new" | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  // types a new position can have: active, with position attributes
  const choosable = types.filter((t) => t.active && attributesByType[t.code]?.length);

  // groups in the order of the type list; unknown (deleted) types last
  const codes = [...new Set(positions.map((p) => p.productServiceType))].sort((a, b) => {
    const ia = types.findIndex((t) => t.code === a);
    const ib = types.findIndex((t) => t.code === b);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange(await api<CustomerPosition[]>(url));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const move = (group: CustomerPosition[], i: number, by: number) => {
    const a = group[i];
    const b = group[i + by];
    const sa = a.sort === b.sort ? Math.max(0, b.sort + by) : b.sort;
    return act(async () => {
      await api(`${url}/${a.id}`, { method: "PATCH", body: { sort: sa } });
      await api(`${url}/${b.id}`, { method: "PATCH", body: { sort: a.sort } });
    });
  };

  const setCount = (id: string, n: number) => onChange(positions.map((p) => (p.id === id ? { ...p, transactionCount: n } : p)));

  const Heading = embedded ? "h3" : "h2";
  const body = (
    <>
      <div className="card-head" style={embedded ? { marginBottom: 8 } : undefined}>
        <Heading style={{ margin: 0 }}>
          Positionen <span className="count-badge">{positions.length}</span>
        </Heading>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing("new")} disabled={busy || !choosable.length}>
          + Position
        </button>
      </div>
      {!choosable.length && (
        <Notice kind="warn">
          Es gibt noch keinen aktiven Produkt-/Dienstleistungstyp mit Positionsattributen.{" "}
          {isAdmin ? <Link href="/admin">In der Administration festlegen</Link> : "Bitte eine Administratorin oder einen Administrator fragen."}
        </Notice>
      )}
      <Notice kind="error">{error}</Notice>

      {positions.length === 0 ? (
        <p className={embedded ? "small muted" : "empty"}>Keine Positionen.</p>
      ) : (
        codes.map((code) => {
          const defs = attributesByType[code] ?? [];
          const trxDefs = trxAttributesByType[code] ?? [];
          const group = positions.filter((p) => p.productServiceType === code);
          const cols = defs.length + (defs.length ? 0 : 1) + 5;
          return (
            <div key={code} style={{ marginBottom: 18 }}>
              <h4 style={{ margin: "0 0 6px" }}>
                <span className="badge badge-accent">{labelOf(types, code)}</span>{" "}
                <span className="small muted" style={{ fontWeight: 400 }}>
                  {group.length} Position{group.length === 1 ? "" : "en"}
                </span>
              </h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 1 }} aria-label="Transaktionen aufklappen" />
                      <th className="num">#</th>
                      {defs.map((d) => (
                        <AttrHeader key={d.id} def={d} />
                      ))}
                      {!defs.length && <th>Werte</th>}
                      <SourceHeaders />
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((p, i) => (
                      <Fragment key={p.id}>
                        <tr>
                          <td>
                            <button
                              className="btn btn-sm"
                              onClick={() => toggle(p.id)}
                              aria-expanded={open.has(p.id)}
                              title={open.has(p.id) ? "Transaktionen schliessen" : "Transaktionen öffnen"}
                            >
                              {open.has(p.id) ? "▾" : "▸"} {p.transactionCount ?? 0}
                            </button>
                          </td>
                          <td className="num muted">{i + 1}</td>
                          {defs.map((d) => (
                            <AttrCell key={d.id} def={d} value={p.values[d.id]} fetched={p.serviceFetched} />
                          ))}
                          {!defs.length && <td className="small muted">Typ ohne Positionsattribute</td>}
                          <SourceCells source={p.uploadSource} name={p.uploadName} date={p.uploadDate} />
                          <td>
                            <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                              <button className="btn btn-sm" disabled={busy || i === 0} onClick={() => move(group, i, -1)} aria-label="Nach oben">
                                ↑
                              </button>
                              <button
                                className="btn btn-sm"
                                disabled={busy || i === group.length - 1}
                                onClick={() => move(group, i, 1)}
                                aria-label="Nach unten"
                              >
                                ↓
                              </button>
                              <button className="btn btn-sm" disabled={busy} onClick={() => setEditing(p)}>
                                Bearbeiten
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                disabled={busy}
                                onClick={() => {
                                  const n = p.transactionCount ?? 0;
                                  const trx = n ? ` mit ${n} Transaktion${n === 1 ? "" : "en"}` : "";
                                  if (window.confirm(`Position ${i + 1} von «${labelOf(types, code)}»${trx} löschen?`))
                                    act(() => api(`${url}/${p.id}`, { method: "DELETE" }));
                                }}
                              >
                                Löschen
                              </button>
                            </div>
                          </td>
                        </tr>
                        {open.has(p.id) && (
                          <tr>
                            <td colSpan={cols} className="accordion-body">
                              <Transactions
                                url={`${url}/${p.id}/transactions`}
                                defs={trxDefs}
                                isAdmin={isAdmin}
                                onCount={(n) => setCount(p.id, n)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      {editing && (
        <PositionModal
          title={editing === "new" ? "Neue Position" : "Position bearbeiten"}
          types={types}
          attributesByType={attributesByType}
          initialType={editing === "new" ? (choosable.length === 1 ? choosable[0].code : "") : editing.productServiceType}
          initialValues={editing === "new" ? {} : editing.values}
          originalType={editing === "new" ? undefined : editing.productServiceType}
          typeLocked={editing !== "new" && (editing.transactionCount ?? 0) > 0}
          fetched={editing === "new" ? undefined : editing.serviceFetched}
          onClose={() => setEditing(null)}
          onSave={async (productServiceType, values) => {
            await api(editing === "new" ? url : `${url}/${editing.id}`, {
              method: editing === "new" ? "POST" : "PUT",
              body: { productServiceType, values },
            });
            setEditing(null);
            onChange(await api<CustomerPosition[]>(url));
          }}
        />
      )}
    </>
  );

  return embedded ? (
    <div>{body}</div>
  ) : (
    <section className="card" id="positionen">
      {body}
    </section>
  );
}

/** Positions of one customer, loaded when shown (Kunden accordion). */
export function CustomerPositionsPanel({
  customerId,
  types,
  attributesByType,
  trxAttributesByType,
  isAdmin,
  onCounts,
}: {
  customerId: string;
  types: DomainValue[];
  attributesByType: AttributesByType;
  trxAttributesByType: AttributesByType;
  isAdmin: boolean;
  /** positions / transactions of this customer changed */
  onCounts: (positions: number, transactions: number) => void;
}) {
  const url = `/api/customers/${customerId}/positions`;
  const [positions, setPositions] = useState<CustomerPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CustomerPosition[]>(url)
      .then(setPositions)
      .catch((err) => setError(errorText(err)));
  }, [url]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!positions) return <p className="small muted">Lädt …</p>;
  return (
    <Positions
      embedded
      url={url}
      types={types}
      attributesByType={attributesByType}
      trxAttributesByType={trxAttributesByType}
      positions={positions}
      isAdmin={isAdmin}
      onChange={(list) => {
        setPositions(list);
        onCounts(list.length, list.reduce((sum, p) => sum + (p.transactionCount ?? 0), 0));
      }}
    />
  );
}

/** Form for one position: type, then the fields of its position attributes. */
export function PositionModal({
  title,
  types,
  attributesByType,
  initialType,
  initialValues,
  originalType,
  typeLocked,
  fetched,
  onClose,
  onSave,
}: {
  title: string;
  types: DomainValue[];
  attributesByType: AttributesByType;
  initialType: string;
  initialValues: Record<string, PositionValue>;
  /** the position's saved type – stays choosable even if inactive now */
  originalType?: string;
  /** the position has transactions: its type can't change */
  typeLocked?: boolean;
  /** when its «Service» attribute values were fetched */
  fetched?: ServiceFetchedView;
  onClose: () => void;
  onSave: (productServiceType: string, values: Record<string, FormValue>) => Promise<void>;
}) {
  const [type, setType] = useState(initialType);
  // form values by attribute id – kept across type switches, only the chosen type's are sent
  const [values, setValues] = useState<Record<string, FormValue>>(() => formValues(Object.values(attributesByType).flat(), initialValues));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const defs = attributesByType[type] ?? [];
  const options = types.filter((t) => (t.active && attributesByType[t.code]?.length) || t.code === originalType);

  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSave(type, Object.fromEntries(defs.map((d) => [d.id, values[d.id] ?? null])));
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        <h2>{title}</h2>
        <Notice kind="error">{error}</Notice>
        <label className="field">
          <span>Produkt-/Dienstleistungstyp</span>
          <select required value={type} onChange={(e) => setType(e.target.value)} autoFocus disabled={typeLocked}>
            <option value="" disabled>
              Bitte wählen …
            </option>
            {originalType && !types.some((t) => t.code === originalType) && <option value={originalType}>{originalType} (gelöscht)</option>}
            {options.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
                {t.active ? "" : " (inaktiv)"}
              </option>
            ))}
          </select>
          {typeLocked && <span className="hint">Der Typ ist fest, solange die Position Transaktionen hat.</span>}
        </label>

        {type && !defs.length && <Notice kind="warn">Dieser Typ hat keine Positionsattribute.</Notice>}
        <AttributeFields defs={defs} values={values} onChange={setValues} fetched={fetched} />
        {defs.length > 0 && <p className="small muted">Leere Felder bleiben leer; mindestens ein Wert ist nötig.</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={busy || !type || !defs.length}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}
