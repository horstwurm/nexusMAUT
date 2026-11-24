"use client";

import { SourceCells, SourceHeaders } from "./[id]/SourceColumns";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import { formatDay } from "@/lib/customers";
import type { AttributeDef } from "@/lib/positions";
import type { Customer, DomainValue, ServiceFetchedView } from "@/lib/types";
import { AttrCell, AttrHeader, AttributeFields, formValues, type FormValue } from "./[id]/AttributeFields";
import { CustomerPositionsPanel } from "./[id]/Positions";

type Draft = { id: string | null; name: string; lastname: string; dateOfBirth: string; attributes: Record<string, FormValue>; fetched?: ServiceFetchedView };

export function CustomersClient({
  types,
  attributesByType,
  trxAttributesByType,
  customerAttributes,
  isAdmin,
}: {
  types: DomainValue[];
  /** type code → its position attributes */
  attributesByType: Record<string, AttributeDef[]>;
  /** type code → its transaction attributes */
  trxAttributesByType: Record<string, AttributeDef[]>;
  /** attributes every customer can have (Admin → Kundenattribute) */
  customerAttributes: AttributeDef[];
  isAdmin: boolean;
}) {
  const EMPTY: Draft = { id: null, name: "", lastname: "", dateOfBirth: "", attributes: formValues(customerAttributes, {}) };
  const [list, setList] = useState<Customer[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // bumped after «Daten aktualisieren» so opened position panels reload
  const [version, setVersion] = useState(0);
  // any «Service» attribute on customer, positions or transactions?
  const hasServiceAttrs = [...customerAttributes, ...Object.values(attributesByType).flat(), ...Object.values(trxAttributesByType).flat()].some((d) => d.service);

  async function refreshServices() {
    setRefreshing(true);
    setError(null);
    setInfo(null);
    try {
      // with a search: only the customers shown, else all
      const body = q.trim() && list ? { customerIds: list.map((c) => c.id) } : {};
      const r = await api<{ customers: number; records: number; values: number; errors: number; messages: string[] }>("/api/customers/refresh-services", { body });
      const text = `Daten aktualisiert: ${r.values} Service-Werte für ${r.customers} Kunden geholt.`;
      if (r.errors) setError(`${text} ${r.errors} Fehler: ${r.messages.join(" · ")}`);
      else setInfo(text);
      await load();
      setVersion((v) => v + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRefreshing(false);
    }
  }
  // accordion: open customers
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };
  const setCounts = (id: string, positionCount: number) =>
    setList((l) => l?.map((c) => (c.id === id ? { ...c, positionCount } : c)) ?? l);

  const load = useCallback(async () => {
    try {
      setList(await api<Customer[]>(`/api/customers?${new URLSearchParams(q ? { q } : {})}`));
    } catch (err) {
      setError(errorText(err));
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function save(d: Draft) {
    const body = { name: d.name, lastname: d.lastname, dateOfBirth: d.dateOfBirth, attributes: d.attributes };
    await api(d.id ? `/api/customers/${d.id}` : "/api/customers", { method: d.id ? "PATCH" : "POST", body });
    setDraft(null);
    setInfo(d.id ? "Kunde gespeichert." : "Kunde angelegt.");
    await load();
  }

  async function remove(c: Customer) {
    if (!window.confirm(`${c.name} ${c.lastname} endgültig löschen (inkl. Produkte, Positionen und Kommunikationspräferenzen)?`)) return;
    setError(null);
    try {
      await api(`/api/customers/${c.id}`, { method: "DELETE" });
      setInfo("Kunde gelöscht.");
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kunden</h1>
          <p className="muted" style={{ margin: 0 }}>
            Kundinnen und Kunden mit ihren Positionen und Transaktionen (▸ aufklappen). Produkte, Dienstleistungen und
            Kommunikationspräferenzen in der Detailansicht.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {hasServiceAttrs && (
            <button
              className="btn"
              onClick={refreshServices}
              disabled={refreshing}
              title={
                q.trim()
                  ? "Service-Attribute der angezeigten Kunden (mit Positionen und Transaktionen) neu von den Services holen"
                  : "Service-Attribute aller Kunden (mit Positionen und Transaktionen) neu von den Services holen"
              }
            >
              {refreshing ? "Aktualisiere …" : "Daten aktualisieren"}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setDraft(EMPTY)}>
            Neuer Kunde
          </button>
        </div>
      </div>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{info}</Notice>

      <section className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input type="search" className="grow" placeholder="Suchen (Vor- oder Nachname)" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
          <span className="small muted">{list ? `${list.length}${list.length >= 200 ? "+" : ""} Kunden` : "Lädt …"}</span>
          {customerAttributes.some((a) => a.service) && (
            <span className="small muted" style={{ marginLeft: "auto" }}>
              <span className="svc-mark">⚡</span> Wert von einem Service: <span className="svc-tag svc-tag-real">echt</span> vom Service,{" "}
              <span className="svc-tag svc-tag-mock">Mock</span> Zufallswert (Details beim Darüberfahren)
            </span>
          )}
        </div>
        {list && list.length === 0 ? (
          <p className="empty">{q ? "Keine Kunden gefunden." : "Noch keine Kunden."}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 1 }} aria-label="Positionen aufklappen" />
                  <th>Nachname</th>
                  <th>Vorname</th>
                  <th>Geburtsdatum</th>
                  {customerAttributes.map((a) => (
                    <AttrHeader key={a.id} def={a} />
                  ))}
                  <SourceHeaders />
                  <th>Geändert</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list?.map((c) => (
                  <Fragment key={c.id}>
                    <tr>
                      <td>
                        <button
                          className="btn btn-sm accordion-toggle"
                          onClick={() => toggle(c.id)}
                          aria-expanded={open.has(c.id)}
                          title={`${c.positionCount ?? 0} Position${c.positionCount === 1 ? "" : "en"} ${open.has(c.id) ? "schliessen" : "öffnen"}`}
                        >
                          {open.has(c.id) ? "▾" : "▸"} {c.positionCount ?? 0}
                        </button>
                      </td>
                      <td>
                        <Link href={`/customers/${c.id}`}>
                          <strong>{c.lastname}</strong>
                        </Link>
                      </td>
                      <td>{c.name}</td>
                      <td>{formatDay(c.dateOfBirth)}</td>
                      {customerAttributes.map((a) => (
                        <AttrCell key={a.id} def={a} value={c.attributes[a.id]} fetched={c.serviceFetched} />
                      ))}
                      <SourceCells source={c.uploadSource} name={c.uploadName} date={c.uploadDate} />
                      <td>{formatDate(c.updatedAt)}</td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <Link className="btn btn-sm" href={`/customers/${c.id}`}>
                            Details
                          </Link>
                          <button className="btn btn-sm" onClick={() =>
                              setDraft({
                                id: c.id,
                                name: c.name,
                                lastname: c.lastname,
                                dateOfBirth: c.dateOfBirth,
                                attributes: formValues(customerAttributes, c.attributes),
                                fetched: c.serviceFetched,
                              })
                            }>
                            Bearbeiten
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => remove(c)}>
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open.has(c.id) && (
                      <tr>
                        <td colSpan={8 + customerAttributes.length} className="accordion-body">
                          <CustomerPositionsPanel
                            key={version}
                            customerId={c.id}
                            types={types}
                            attributesByType={attributesByType}
                            trxAttributesByType={trxAttributesByType}
                            isAdmin={isAdmin}
                            onCounts={(p) => setCounts(c.id, p)}
                          />
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

      {draft && <CustomerModal draft={draft} attributes={customerAttributes} onClose={() => setDraft(null)} onSave={save} />}
    </>
  );
}

function CustomerModal({
  draft,
  attributes,
  onClose,
  onSave,
}: {
  draft: Draft;
  attributes: AttributeDef[];
  onClose: () => void;
  onSave: (d: Draft) => Promise<void>;
}) {
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: "name" | "lastname" | "dateOfBirth") => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal"
        style={{ maxHeight: "90vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSave(d);
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        <h2>{d.id ? "Kunde bearbeiten" : "Neuer Kunde"}</h2>
        <Notice kind="error">{error}</Notice>
        <div className="grid2">
          <label className="field">
            <span>Vorname</span>
            <input type="text" required value={d.name} onChange={set("name")} autoFocus />
          </label>
          <label className="field">
            <span>Nachname</span>
            <input type="text" required value={d.lastname} onChange={set("lastname")} />
          </label>
        </div>
        <label className="field" style={{ maxWidth: 220 }}>
          <span>Geburtsdatum</span>
          <input type="date" required min="1900-01-01" max={today} value={d.dateOfBirth} onChange={set("dateOfBirth")} />
        </label>
        {attributes.length > 0 && (
          <>
            <h3 style={{ marginTop: 6 }}>Kundenattribute</h3>
            <AttributeFields defs={attributes} values={d.attributes} onChange={(attributes) => setD({ ...d, attributes })} fetched={d.fetched} />
          </>
        )}
        {d.id && (
          <p className="small muted">
            ID <code>{d.id}</code>
          </p>
        )}
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
