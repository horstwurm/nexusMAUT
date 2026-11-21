"use client";

import { useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import type { ActionView } from "@/lib/types";
import { AttributesModal } from "./TypeAttributesModal";

type Draft = { id: string | null; name: string; description: string; url: string };
const EMPTY: Draft = { id: null, name: "", description: "", url: "" };

/** Admin card for the actions (Aktionen): name + description. */
export function ActionsAdmin({ initial }: { initial: ActionView[] }) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attributesOf, setAttributesOf] = useState<ActionView | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setList(await api<ActionView[]>("/api/actions"));
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
        Aktionen <span className="count-badge">{list.length}</span>
      </h2>
      <p className="small muted">Was mit Kunden geschehen kann, z.B. «Beratungstermin anbieten» oder «Willkommensmail senden».</p>
      <Notice kind="error">{error}</Notice>

      {list.length === 0 ? (
        <p className="empty">Noch keine Aktionen.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Beschreibung</th>
                <th>URL</th>
                <th>Geändert</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.name}</strong>
                  </td>
                  <td className="small" style={{ whiteSpace: "pre-wrap" }}>
                    {a.description || <span className="muted">–</span>}
                  </td>
                  <td className="small mono" style={{ maxWidth: 280, overflowWrap: "anywhere" }}>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer">
                        {a.url}
                      </a>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                  <td>{formatDate(a.updatedAt)}</td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                      <button className="btn btn-sm" disabled={busy} onClick={() => setAttributesOf(a)} title="Attribute dieser Aktion verwalten">
                        Attribute ({a.attributeCount})
                      </button>
                      <button className="btn btn-sm" disabled={busy} onClick={() => setDraft({ id: a.id, name: a.name, description: a.description, url: a.url })}>
                        Bearbeiten
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => {
                          const attrs = a.attributeCount ? ` und ihre ${a.attributeCount} Attribute` : "";
                          if (window.confirm(`Aktion «${a.name}»${attrs} löschen?`)) act(() => api(`/api/actions/${a.id}`, { method: "DELETE" }));
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
        <AttributesModal
          base={`/api/actions/${attributesOf.id}/attributes`}
          title={`Attribute der Aktion «${attributesOf.name}»`}
          hint="Angaben, die zu dieser Aktion gehören, z.B. Kanal (Auswahlliste), Frist (Datum) oder Betrag (Zahl)."
          newLabel="Neues Aktionsattribut"
          fallbackCount={attributesOf.attributeCount}
          onClose={(count) => {
            const id = attributesOf.id;
            setList(list.map((x) => (x.id === id ? { ...x, attributeCount: count } : x)));
            setAttributesOf(null);
          }}
        />
      )}

      <form
        className="step"
        style={{ marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const body = { name: draft.name, description: draft.description, url: draft.url };
          const ok = await act(() => api(draft.id ? `/api/actions/${draft.id}` : "/api/actions", { method: draft.id ? "PUT" : "POST", body }));
          if (ok) setDraft(EMPTY);
        }}
      >
        <h3>{draft.id ? "Aktion bearbeiten" : "Neue Aktion"}</h3>
        <label className="field">
          <span>Name</span>
          <input type="text" required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Beschreibung</span>
          <textarea rows={3} maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </label>
        <label className="field">
          <span>URL</span>
          <input
            type="url"
            className="mono"
            maxLength={2000}
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://… (optional)"
          />
        </label>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {draft.id && (
            <button type="button" className="btn" onClick={() => setDraft(EMPTY)}>
              Abbrechen
            </button>
          )}
          <button className="btn btn-primary" disabled={busy || !draft.name.trim()}>
            {draft.id ? "Speichern" : "Hinzufügen"}
          </button>
        </div>
      </form>
    </section>
  );
}
