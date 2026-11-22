"use client";

import { useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText } from "@/lib/client";
import { FEEDBACK_MEANINGS, MEANING_INFO, type FeedbackMeaning } from "@/lib/feedbackOptions";
import type { FeedbackOptionView } from "@/lib/types";

type Draft = { id: string | null; option: string; meaning: FeedbackMeaning };

export function MeaningBadge({ meaning }: { meaning: FeedbackMeaning }) {
  const info = MEANING_INFO[meaning];
  return <span className={`badge ${info.badge}`}>{info.label}</span>;
}

/** Feedback options of one journey step (relation journeyStepFeedbackOptions): option + meaning, in order. */
export function FeedbackOptionsModal({
  base,
  title,
  initial,
  onClose,
}: {
  /** …/steps/SID/feedback-options */
  base: string;
  title: string;
  initial: FeedbackOptionView[];
  onClose: (options: FeedbackOptionView[]) => void;
}) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState<Draft>({ id: null, option: "", meaning: "OK" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => onClose(list);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setList(await api<FeedbackOptionView[]>(base));
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number, by: number) => {
    const a = list[i];
    const b = list[i + by];
    const sa = a.sort === b.sort ? Math.max(0, b.sort + by) : b.sort;
    return act(async () => {
      await api(`${base}/${a.id}`, { method: "PATCH", body: { sort: sa } });
      await api(`${base}/${b.id}`, { method: "PATCH", body: { sort: a.sort } });
    });
  };

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Feedback-Optionen</h2>
        <p className="small muted">{title} – die Antworten, die ein Kunde auf diesen Schritt geben kann, jede mit ihrer Bedeutung.</p>
        <Notice kind="error">{error}</Notice>

        {list.length === 0 ? (
          <p className="empty">Noch keine Feedback-Optionen.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Option</th>
                  <th>Bedeutung</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((o, i) => (
                  <tr key={o.id}>
                    <td>{o.option}</td>
                    <td>
                      <MeaningBadge meaning={o.meaning} />
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                        <button className="btn btn-sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Nach oben">
                          ↑
                        </button>
                        <button className="btn btn-sm" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} aria-label="Nach unten">
                          ↓
                        </button>
                        <button className="btn btn-sm" disabled={busy} onClick={() => setDraft({ id: o.id, option: o.option, meaning: o.meaning })}>
                          Bearbeiten
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Option «${o.option}» löschen?`)) act(() => api(`${base}/${o.id}`, { method: "DELETE" }));
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
            const body = { option: draft.option, meaning: draft.meaning };
            const ok = await act(() => api(draft.id ? `${base}/${draft.id}` : base, { method: draft.id ? "PUT" : "POST", body }));
            if (ok) setDraft({ id: null, option: "", meaning: "OK" });
          }}
        >
          <h3>{draft.id ? "Option bearbeiten" : "Neue Option"}</h3>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
              <span>Option</span>
              <input
                type="text"
                required
                maxLength={200}
                value={draft.option}
                onChange={(e) => setDraft({ ...draft, option: e.target.value })}
                placeholder="z.B. Termin vereinbart"
                autoFocus
              />
            </label>
            <label className="field" style={{ flex: "0 0 160px", marginBottom: 0 }}>
              <span>Bedeutung</span>
              <select value={draft.meaning} onChange={(e) => setDraft({ ...draft, meaning: e.target.value as FeedbackMeaning })}>
                {FEEDBACK_MEANINGS.map((m) => (
                  <option key={m} value={m}>
                    {m} – {MEANING_INFO[m].label}
                  </option>
                ))}
              </select>
            </label>
            {draft.id && (
              <button type="button" className="btn" onClick={() => setDraft({ id: null, option: "", meaning: "OK" })}>
                Abbrechen
              </button>
            )}
            <button className="btn btn-primary" disabled={busy || !draft.option.trim()}>
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
