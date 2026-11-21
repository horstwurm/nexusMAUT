"use client";

import { useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText } from "@/lib/client";
import { CODE_RE, codeFromLabel, DOMAINS, type DomainName } from "@/lib/domains";
import { ATTRIBUTE_KIND_NAMES, ATTRIBUTE_KINDS, type AttributeKind } from "@/lib/typeAttributes";
import type { DomainValue } from "@/lib/types";
import { TypeAttributesModal } from "./TypeAttributesModal";

/** One admin-managed value list: add, rename, reorder, (de)activate, delete unused. */
export function DomainAdmin({ domain, initial }: { domain: DomainName; initial: DomainValue[] }) {
  const meta = DOMAINS[domain];
  const [list, setList] = useState(initial);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attributesOf, setAttributesOf] = useState<{ type: DomainValue; kind: AttributeKind } | null>(null);

  const reload = async () => setList(await api<DomainValue[]>(`/api/domains?domain=${domain}&usage=1`));

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

  const effectiveCode = codeTouched ? code : codeFromLabel(label);

  const move = (i: number, by: number) => {
    const a = list[i];
    const b = list[i + by];
    // swap sort values (equal ones get distinct ones)
    const sa = a.sort === b.sort ? b.sort + by : b.sort;
    return act(async () => {
      await api(`/api/domains/${a.id}`, { method: "PATCH", body: { sort: Math.max(0, sa) } });
      await api(`/api/domains/${b.id}`, { method: "PATCH", body: { sort: a.sort } });
    });
  };

  return (
    <section className="card">
      <h2>{meta.title}</h2>
      <p className="small muted">{meta.hint}</p>
      <Notice kind="error">{error}</Notice>

      {list.length === 0 ? (
        <p className="empty">Noch keine Werte.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th>Code</th>
                <th className="num">Verwendet</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((v, i) => (
                <tr key={v.id}>
                  <td>
                    {editing === v.id ? (
                      <form
                        className="row"
                        style={{ flexWrap: "nowrap" }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          act(async () => {
                            await api(`/api/domains/${v.id}`, { method: "PATCH", body: { label: editLabel } });
                            setEditing(null);
                          });
                        }}
                      >
                        <input type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} autoFocus required maxLength={100} />
                        <button className="btn btn-sm btn-primary" disabled={busy}>
                          OK
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
                          ✕
                        </button>
                      </form>
                    ) : (
                      <span className={v.active ? "" : "muted"}>{v.label}</span>
                    )}
                  </td>
                  <td className="mono">{v.code}</td>
                  <td className="num">{v.usage ?? 0}</td>
                  <td>
                    <span className={`badge ${v.active ? "badge-ok" : ""}`}>{v.active ? "Aktiv" : "Inaktiv"}</span>
                  </td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                      <button className="btn btn-sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Nach oben">
                        ↑
                      </button>
                      <button className="btn btn-sm" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} aria-label="Nach unten">
                        ↓
                      </button>
                      {domain === "productServiceType" &&
                        ATTRIBUTE_KIND_NAMES.map((kind) => (
                          <button
                            key={kind}
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() => setAttributesOf({ type: v, kind })}
                            title={`${ATTRIBUTE_KINDS[kind].title} verwalten`}
                          >
                            {kind === "position" ? "Positionsattr." : "Transaktionsattr."} ({v.attributeCounts?.[kind] ?? 0})
                          </button>
                        ))}
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => {
                          setEditing(v.id);
                          setEditLabel(v.label);
                        }}
                      >
                        Umbenennen
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => act(() => api(`/api/domains/${v.id}`, { method: "PATCH", body: { active: !v.active } }))}
                      >
                        {v.active ? "Deaktivieren" : "Aktivieren"}
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy || (v.usage ?? 0) > 0}
                        title={(v.usage ?? 0) > 0 ? "Wird verwendet – stattdessen deaktivieren" : undefined}
                        onClick={() => {
                          const n = (v.attributeCounts?.position ?? 0) + (v.attributeCounts?.trx ?? 0);
                          const attrs = n ? ` und seine ${n} Attribute` : "";
                          if (window.confirm(`«${v.label}»${attrs} löschen?`)) act(() => api(`/api/domains/${v.id}`, { method: "DELETE" }));
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

      {attributesOf && (
        <TypeAttributesModal
          type={attributesOf.type}
          kind={attributesOf.kind}
          onClose={(count) => {
            const { type, kind } = attributesOf;
            setList(
              list.map((x) =>
                x.id === type.id
                  ? { ...x, attributeCounts: { position: x.attributeCounts?.position ?? 0, trx: x.attributeCounts?.trx ?? 0, [kind]: count } }
                  : x,
              ),
            );
            setAttributesOf(null);
          }}
        />
      )}

      <form
        className="row"
        style={{ marginTop: 14, alignItems: "flex-end" }}
        onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            await api("/api/domains", { body: { domain, code: effectiveCode, label } });
            setLabel("");
            setCode("");
            setCodeTouched(false);
          });
        }}
      >
        <label className="field grow" style={{ marginBottom: 0 }}>
          <span>Neue Bezeichnung</span>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={100} placeholder={meta.field} />
        </label>
        <label className="field" style={{ marginBottom: 0, width: 200 }}>
          <span>Code</span>
          <input
            type="text"
            className="mono"
            value={effectiveCode}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeTouched(true);
            }}
            required
            maxLength={40}
          />
        </label>
        <button className="btn btn-primary" disabled={busy || !label.trim() || !CODE_RE.test(effectiveCode)}>
          Hinzufügen
        </button>
      </form>
      <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
        Der Code wird in den Daten gespeichert und kann später nicht mehr geändert werden; die Bezeichnung schon.
      </p>
    </section>
  );
}
