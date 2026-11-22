"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText } from "@/lib/client";
import type { AttributeDef } from "@/lib/positions";
import type { PositionTransaction, ServiceFetchedView } from "@/lib/types";
import { AttrCell, AttrHeader, AttributeFields, formValues, type FormValue } from "./AttributeFields";

/**
 * Transactions of one position (accordion content): a table with a column
 * per transaction attribute of the position's type. Loaded when opened.
 */
export function Transactions({
  url,
  defs,
  isAdmin,
  onCount,
}: {
  /** /api/customers/ID/positions/POS/transactions */
  url: string;
  defs: AttributeDef[];
  isAdmin: boolean;
  /** the number of transactions changed */
  onCount: (n: number) => void;
}) {
  const [list, setList] = useState<PositionTransaction[] | null>(null);
  const [editing, setEditing] = useState<PositionTransaction | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<PositionTransaction[]>(url)
      .then(setList)
      .catch((err) => setError(errorText(err)));
  }, [url]);

  async function reload() {
    const next = await api<PositionTransaction[]>(url);
    setList(next);
    onCount(next.length);
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number, by: number) => {
    const a = list![i];
    const b = list![i + by];
    const sa = a.sort === b.sort ? Math.max(0, b.sort + by) : b.sort;
    return act(async () => {
      await api(`${url}/${a.id}`, { method: "PATCH", body: { sort: sa } });
      await api(`${url}/${b.id}`, { method: "PATCH", body: { sort: a.sort } });
    });
  };

  if (!defs.length) {
    return (
      <p className="small muted" style={{ margin: 0 }}>
        <strong>Transaktionen</strong> – 
        Für diesen Typ sind keine Transaktionsattribute definiert.{" "}
        {isAdmin && <Link href="/admin">In der Administration festlegen</Link>}
      </p>
    );
  }

  return (
    <div>
      <div className="card-head" style={{ marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>
          Transaktionen <span className="count-badge">{list?.length ?? "…"}</span>
        </h4>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing("new")} disabled={busy || list === null}>
          + Transaktion
        </button>
      </div>
      <Notice kind="error">{error}</Notice>
      {list === null ? (
        <p className="small muted">Lädt …</p>
      ) : list.length === 0 ? (
        <p className="small muted" style={{ marginTop: 0 }}>
          Noch keine Transaktionen.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                {defs.map((d) => (
                  <AttrHeader key={d.id} def={d} />
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((t, i) => (
                <tr key={t.id}>
                  <td className="num muted">{i + 1}</td>
                  {defs.map((d) => (
                    <AttrCell key={d.id} def={d} value={t.values[d.id]} fetched={t.serviceFetched} />
                  ))}
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                      <button className="btn btn-sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Nach oben">
                        ↑
                      </button>
                      <button className="btn btn-sm" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} aria-label="Nach unten">
                        ↓
                      </button>
                      <button className="btn btn-sm" disabled={busy} onClick={() => setEditing(t)}>
                        Bearbeiten
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Transaktion ${i + 1} löschen?`)) act(() => api(`${url}/${t.id}`, { method: "DELETE" }));
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

      {editing && (
        <TransactionModal
          title={editing === "new" ? "Neue Transaktion" : "Transaktion bearbeiten"}
          defs={defs}
          initial={formValues(defs, editing === "new" ? {} : editing.values)}
          fetched={editing === "new" ? undefined : editing.serviceFetched}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            await api(editing === "new" ? url : `${url}/${editing.id}`, { method: editing === "new" ? "POST" : "PUT", body: { values } });
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

/** Form for one transaction: the fields of the transaction attributes. */
function TransactionModal({
  title,
  defs,
  initial,
  fetched,
  onClose,
  onSave,
}: {
  title: string;
  defs: AttributeDef[];
  initial: Record<string, FormValue>;
  fetched?: ServiceFetchedView;
  onClose: () => void;
  onSave: (values: Record<string, FormValue>) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
            await onSave(values);
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        <h2>{title}</h2>
        <Notice kind="error">{error}</Notice>
        <AttributeFields defs={defs} values={values} onChange={setValues} fetched={fetched} />
        <p className="small muted">Leere Felder bleiben leer; mindestens ein Wert ist nötig.</p>
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
