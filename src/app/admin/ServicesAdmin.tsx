"use client";

import { useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import { labelOf } from "@/lib/domains";
import { SERVICE_ATTRIBUTE_KINDS, type ServiceAttributeKind } from "@/lib/services";
import type { DomainValue, ServiceView } from "@/lib/types";
import { ServiceCallModal } from "./ServiceCallModal";
import { AttributesModal } from "./TypeAttributesModal";

type Draft = { id: string | null; name: string; serviceType: string; url: string };
const BASE = "/api/services";

/** Admin tab «Services»: name, service type, PUT / GET attributes. */
export function ServicesAdmin({ initial, types }: { initial: ServiceView[]; types: DomainValue[] }) {
  const activeTypes = types.filter((t) => t.active);
  const empty = (): Draft => ({ id: null, name: "", serviceType: activeTypes[0]?.code ?? "", url: "" });
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState<Draft>(empty);
  const [attributesOf, setAttributesOf] = useState<{ service: ServiceView; kind: ServiceAttributeKind } | null>(null);
  const [testing, setTesting] = useState<ServiceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setList(await api<ServiceView[]>(BASE));
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>
        Services <span className="count-badge">{list.length}</span>
      </h2>
      <p className="small muted">Services mit Typ und den Attributen, die sie entgegennehmen (PUT) und liefern (GET).</p>
      <Notice kind="error">{error}</Notice>
      {!activeTypes.length && (
        <Notice kind="warn">
          Zuerst unten in der Werteliste <a href="#servicetypen">Servicetypen</a> einen Typ anlegen (danach Seite neu laden).
        </Notice>
      )}

      {list.length === 0 ? (
        <p className="empty">Noch keine Services.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Servicetyp</th>
                <th>URL</th>
                <th>Geändert</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                  </td>
                  <td>
                    <span className="badge badge-accent">{labelOf(types, s.serviceType)}</span>
                  </td>
                  <td className="small mono" style={{ maxWidth: 320, overflowWrap: "anywhere" }}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.url}
                      </a>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                  <td>{formatDate(s.updatedAt)}</td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy || !s.url}
                        onClick={() => setTesting(s)}
                        title={s.url ? "Service mit Testwerten aufrufen" : "Zuerst eine URL erfassen"}
                      >
                        Testen
                      </button>
                      {(Object.keys(SERVICE_ATTRIBUTE_KINDS) as ServiceAttributeKind[]).map((kind) => (
                        <button
                          key={kind}
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => setAttributesOf({ service: s, kind })}
                          title={SERVICE_ATTRIBUTE_KINDS[kind].hint}
                        >
                          {SERVICE_ATTRIBUTE_KINDS[kind].title} ({s.attributeCounts[kind]})
                        </button>
                      ))}
                      <button className="btn btn-sm" disabled={busy} onClick={() => setDraft({ id: s.id, name: s.name, serviceType: s.serviceType, url: s.url })}>
                        Bearbeiten
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => {
                          const n = s.attributeCounts.put + s.attributeCounts.get;
                          const attrs = n ? ` und seine ${n} Attribute` : "";
                          if (window.confirm(`Service «${s.name}»${attrs} löschen?`)) act(() => api(`${BASE}/${s.id}`, { method: "DELETE" }));
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

      {testing && <ServiceCallModal service={testing} onClose={() => setTesting(null)} />}

      {attributesOf && (
        <AttributesModal
          base={`${BASE}/${attributesOf.service.id}/${SERVICE_ATTRIBUTE_KINDS[attributesOf.kind].path}`}
          title={`${SERVICE_ATTRIBUTE_KINDS[attributesOf.kind].title} von «${attributesOf.service.name}»`}
          hint={SERVICE_ATTRIBUTE_KINDS[attributesOf.kind].hint}
          newLabel={`Neues ${SERVICE_ATTRIBUTE_KINDS[attributesOf.kind].title.replace("-Attribute", "-Attribut")}`}
          fallbackCount={attributesOf.service.attributeCounts[attributesOf.kind]}
          allowList={attributesOf.kind === "get"}
          onClose={(count) => {
            const { service, kind } = attributesOf;
            setList(list.map((x) => (x.id === service.id ? { ...x, attributeCounts: { ...x.attributeCounts, [kind]: count } } : x)));
            setAttributesOf(null);
          }}
        />
      )}

      <form
        className="step"
        style={{ marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const body = { name: draft.name, serviceType: draft.serviceType, url: draft.url };
          const ok = await act(() => api(draft.id ? `${BASE}/${draft.id}` : BASE, { method: draft.id ? "PUT" : "POST", body }));
          if (ok) setDraft(empty());
        }}
      >
        <h3>{draft.id ? "Service bearbeiten" : "Neuer Service"}</h3>
        <div className="grid2">
          <label className="field">
            <span>Name</span>
            <input type="text" required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Servicetyp</span>
            <select required value={draft.serviceType} onChange={(e) => setDraft({ ...draft, serviceType: e.target.value })}>
              <option value="" disabled>
                Bitte wählen …
              </option>
              {/* a type deactivated since stays selectable for this service */}
              {types
                .filter((t) => t.active || t.code === draft.serviceType)
                .map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                    {t.active ? "" : " (inaktiv)"}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>URL</span>
          <input
            type="url"
            maxLength={2000}
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://api.example.ch/kunden (optional)"
            className="mono"
          />
        </label>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {draft.id && (
            <button type="button" className="btn" onClick={() => setDraft(empty())}>
              Abbrechen
            </button>
          )}
          <button className="btn btn-primary" disabled={busy || !draft.name.trim() || !draft.serviceType}>
            {draft.id ? "Speichern" : "Hinzufügen"}
          </button>
        </div>
      </form>
    </section>
  );
}
