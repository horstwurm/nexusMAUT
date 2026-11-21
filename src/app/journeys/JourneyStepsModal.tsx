"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/Notice";
import { PlaceholderPicker, WithPlaceholders } from "@/components/Placeholders";
import { api, errorText } from "@/lib/client";
import type { PlaceholderGroup } from "@/lib/placeholders";
import type { ActionView, JourneyStepView, JourneyView } from "@/lib/types";
import { StepTestModal } from "./StepTestModal";

type Draft = { id: string | null; actionId: string; content: string };

/** The steps of one journey (relation journeySteps): action + content – in order. */
export function JourneyStepsModal({ journey, onClose }: { journey: JourneyView; onClose: (count: number) => void }) {
  const base = `/api/journeys/${journey.id}/steps`;
  const [steps, setSteps] = useState<JourneyStepView[] | null>(null);
  const [actions, setActions] = useState<ActionView[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<PlaceholderGroup[] | null>(null);
  const [testing, setTesting] = useState<JourneyStepView | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    Promise.all([api<JourneyStepView[]>(base), api<ActionView[]>("/api/actions"), api<PlaceholderGroup[]>("/api/placeholders")])
      .then(([s, a, c]) => {
        setSteps(s);
        setActions(a);
        setCatalog(c);
      })
      .catch((err) => setError(errorText(err)));
  }, [base]);

  const actionName = (id: string) => actions.find((a) => a.id === id)?.name ?? "(gelöschte Aktion)";
  const close = () => onClose(steps?.length ?? journey.stepCount);
  const noActions = steps !== null && !actions.length;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setSteps(await api<JourneyStepView[]>(base));
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number, by: number) => {
    const a = steps![i];
    const b = steps![i + by];
    const sa = a.sort === b.sort ? Math.max(0, b.sort + by) : b.sort;
    return act(async () => {
      await api(`${base}/${a.id}`, { method: "PATCH", body: { sort: sa } });
      await api(`${base}/${b.id}`, { method: "PATCH", body: { sort: a.sort } });
    });
  };

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Schritte von «{journey.name}»</h2>
        <p className="small muted">Jeder Schritt ist eine Aktion mit ihrem Inhalt – in der Reihenfolge der Journey.</p>
        <Notice kind="error">{error}</Notice>
        {noActions && (
          <Notice kind="warn">
            Jeder Schritt braucht eine Aktion – zuerst im Tab <Link href="/admin?tab=actions">Aktionen</Link> eine anlegen.
          </Notice>
        )}

        {steps === null ? (
          <p className="empty">Lädt …</p>
        ) : steps.length === 0 ? (
          <p className="empty">Noch keine Schritte.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Aktion</th>
                  <th>Inhalt</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {steps.map((s, i) => (
                  <tr key={s.id}>
                    <td className="num muted">{i + 1}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <strong>{actionName(s.actionId)}</strong>
                    </td>
                    <td className="small" style={{ whiteSpace: "pre-wrap" }}>
                      {s.content ? <WithPlaceholders text={s.content} catalog={catalog} /> : <span className="muted">–</span>}
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy || !s.content}
                          onClick={() => setTesting(s)}
                          title={s.content ? "Inhalt für einen Kunden mit gefüllten Platzhaltern anzeigen" : "Kein Inhalt zum Testen"}
                        >
                          Testen
                        </button>
                        <button className="btn btn-sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Nach oben">
                          ↑
                        </button>
                        <button className="btn btn-sm" disabled={busy || i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Nach unten">
                          ↓
                        </button>
                        <button className="btn btn-sm" disabled={busy} onClick={() => setDraft({ id: s.id, actionId: s.actionId, content: s.content })}>
                          Bearbeiten
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Schritt ${i + 1} löschen?`)) act(() => api(`${base}/${s.id}`, { method: "DELETE" }));
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

        {draft ? (
          <form
            className="step"
            style={{ marginTop: 16 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const body = { actionId: draft.actionId, content: draft.content };
              const ok = await act(() => api(draft.id ? `${base}/${draft.id}` : base, { method: draft.id ? "PUT" : "POST", body }));
              if (ok) setDraft(null);
            }}
          >
            <h3>{draft.id ? "Schritt bearbeiten" : "Neuer Schritt"}</h3>
            <label className="field" style={{ maxWidth: 420 }}>
              <span>Aktion</span>
              <select required value={draft.actionId} onChange={(e) => setDraft({ ...draft, actionId: e.target.value })}>
                {!actions.some((a) => a.id === draft.actionId) && <option value={draft.actionId}>(gelöschte Aktion)</option>}
                {actions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Inhalt</span>
              <textarea
                ref={contentRef}
                rows={8}
                maxLength={10_000}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                placeholder="z.B. Guten Tag {{Kunde.Vorname}} {{Kunde.Nachname}} … – Platzhalter unten per Klick einfügen"
                autoFocus
              />
              <span className="hint">{draft.content.length.toLocaleString("de-CH")} / {(10_000).toLocaleString("de-CH")} Zeichen</span>
            </label>
            <PlaceholderPicker catalog={catalog} value={draft.content} onChange={(content) => setDraft({ ...draft, content })} textarea={contentRef} />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                Abbrechen
              </button>
              <button className="btn btn-primary" disabled={busy || !draft.actionId}>
                {draft.id ? "Speichern" : "Hinzufügen"}
              </button>
            </div>
          </form>
        ) : (
          <button
            className="btn btn-sm btn-primary"
            style={{ marginTop: 12 }}
            disabled={busy || steps === null || noActions}
            title={noActions ? "Zuerst eine Aktion anlegen (siehe Hinweis oben)" : undefined}
            onClick={() => setDraft({ id: null, actionId: actions[0]?.id ?? "", content: "" })}
          >
            + Schritt
          </button>
        )}

        {testing && <StepTestModal journeyId={journey.id} step={testing} actionName={actionName(testing.actionId)} onClose={() => setTesting(null)} />}

        <div className="actions">
          <button className="btn" onClick={close}>
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}
