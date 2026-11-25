"use client";

import { useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import { JOURNEY_TYPES, JOURNEY_TYPE_LABELS, type JourneyType } from "@/lib/journeyTypes";
import type { JourneyView } from "@/lib/types";
import { JourneyStepsModal } from "./JourneyStepsModal";

type Draft = { id: string | null; name: string; description: string; journeyType: JourneyType };
const EMPTY: Draft = { id: null, name: "", description: "", journeyType: "campaign" };
const BASE = "/api/journeys";

/** The journeys page: name, description, type (Kampagne / Event), steps per journey. */
export function JourneysClient({ initial }: { initial: JourneyView[] }) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepsOf, setStepsOf] = useState<JourneyView | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setList(await api<JourneyView[]>(BASE));
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
        Journeys <span className="count-badge">{list.length}</span>
      </h2>
      <p className="small muted">Wege, die Kunden durchlaufen, z.B. «Onboarding Neukunde», «Hypothek verlängern» oder «Rückgewinnung». Typ
        «Kampagne»: Kunden werden zugewiesen; Typ «Event»: gehört zu einem Event (Administration → Events).</p>
      <Notice kind="error">{error}</Notice>

      {list.length === 0 ? (
        <p className="empty">Noch keine Journeys.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Typ</th>
                <th>Beschreibung</th>
                <th>Geändert</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr key={j.id}>
                  <td>
                    <strong>{j.name}</strong>
                  </td>
                  <td>
                    <span className={`badge ${j.journeyType === "event" ? "badge-warn" : "badge-accent"}`}>{JOURNEY_TYPE_LABELS[j.journeyType]}</span>
                  </td>
                  <td className="small" style={{ whiteSpace: "pre-wrap" }}>
                    {j.description || <span className="muted">–</span>}
                  </td>
                  <td>{formatDate(j.updatedAt)}</td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                      <button className="btn btn-sm" disabled={busy} onClick={() => setStepsOf(j)} title="Schritte dieser Journey verwalten">
                        Schritte ({j.stepCount})
                      </button>
                      <button className="btn btn-sm" disabled={busy} onClick={() => setDraft({ id: j.id, name: j.name, description: j.description, journeyType: j.journeyType })}>
                        Bearbeiten
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => {
                          const steps = j.stepCount ? ` mit ${j.stepCount} Schritt${j.stepCount === 1 ? "" : "en"}` : "";
                          if (window.confirm(`Journey «${j.name}»${steps} löschen?`)) act(() => api(`${BASE}/${j.id}`, { method: "DELETE" }));
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

      {stepsOf && (
        <JourneyStepsModal
          journey={stepsOf}
          onClose={(count) => {
            const id = stepsOf.id;
            setList(list.map((x) => (x.id === id ? { ...x, stepCount: count } : x)));
            setStepsOf(null);
          }}
        />
      )}

      <form
        className="step"
        style={{ marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const body = { name: draft.name, description: draft.description, journeyType: draft.journeyType };
          const ok = await act(() => api(draft.id ? `${BASE}/${draft.id}` : BASE, { method: draft.id ? "PUT" : "POST", body }));
          if (ok) setDraft(EMPTY);
        }}
      >
        <h3>{draft.id ? "Journey bearbeiten" : "Neue Journey"}</h3>
        <label className="field">
          <span>Name</span>
          <input type="text" required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Typ</span>
          <select value={draft.journeyType} onChange={(e) => setDraft({ ...draft, journeyType: e.target.value as JourneyType })}>
            {JOURNEY_TYPES.map((t) => (
              <option key={t} value={t}>
                {JOURNEY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Beschreibung</span>
          <textarea rows={3} maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
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
