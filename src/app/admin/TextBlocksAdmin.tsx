"use client";

import { useEffect, useRef, useState } from "react";
import { CharCount, FormatToolbar, FormattedContent } from "@/components/Formatting";
import { Notice } from "@/components/Notice";
import { PlaceholderPicker } from "@/components/Placeholders";
import { StepTestModal } from "@/app/journeys/StepTestModal";
import { api, errorText, formatDate } from "@/lib/client";
import { codeFromLabel } from "@/lib/domains";
import type { PlaceholderGroup } from "@/lib/placeholders";
import { blockToken, TEXT_BLOCK_CATEGORIES, TEXT_BLOCK_CODE_RE } from "@/lib/textBlocks";
import type { TextBlockView } from "@/lib/types";

type Draft = { id: string | null; code: string; codeTouched: boolean; label: string; category: string; content: string };
const EMPTY: Draft = { id: null, code: "", codeTouched: false, label: "", category: "", content: "" };
const BASE = "/api/text-blocks";

/**
 * Admin tab «Textbausteine»: reusable parts of step contents (salutation, signature,
 * legal notice …), used as {{Baustein.code}} – inserted live when a content is rendered.
 */
export function TextBlocksAdmin({ initial }: { initial: TextBlockView[] }) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [preview, setPreview] = useState(false);
  const [catalog, setCatalog] = useState<PlaceholderGroup[] | null>(null);
  const [testing, setTesting] = useState<TextBlockView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // placeholders for the editor – without the blocks themselves (a block can't contain another)
  useEffect(() => {
    api<PlaceholderGroup[]>("/api/placeholders")
      .then((c) => setCatalog(c.filter((g) => g.id !== "bausteine")))
      .catch((err) => setError(errorText(err)));
  }, []);

  async function act(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      setList(await api<TextBlockView[]>(BASE));
      if (msg) setInfo(msg);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const codeOk = TEXT_BLOCK_CODE_RE.test(draft.code);

  return (
    <section className="card">
      <h2>
        Textbausteine <span className="count-badge">{list.length}</span>
      </h2>
      <p className="small muted">
        Wiederverwendbare Teile von Schritt-Inhalten, z.B. Anrede, Signatur oder rechtlicher Hinweis. Im Schritt als <code>{"{{Baustein.code}}"}</code>{" "}
        (Platzhalter-Gruppe «Bausteine»); beim Aufbereiten wird der aktuelle Text eingesetzt – Änderungen gelten sofort für alle Schritte, die noch
        nicht erledigt sind. Ein Baustein kann Platzhalter, Bedingungen und Formatierung enthalten, aber keinen anderen Baustein; für Aktionen
        «Nur Text» wird die Formatierung entfernt.
      </p>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{info}</Notice>

      {list.length === 0 ? (
        <p className="empty">Noch keine Textbausteine.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Baustein</th>
                <th>Kategorie</th>
                <th>Inhalt</th>
                <th>Verwendet</th>
                <th>Geändert</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.label}</strong>
                    <div>
                      <code className="small">{blockToken(b.code)}</code>
                    </div>
                  </td>
                  <td>{b.category ? <span className="badge">{b.category}</span> : <span className="muted">–</span>}</td>
                  <td className="small" style={{ maxWidth: 420 }}>
                    <div className="step-preview" style={{ maxHeight: 130, marginBottom: 0, whiteSpace: "normal", padding: "8px 10px" }}>
                      <FormattedContent markdown={b.content} />
                    </div>
                  </td>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>
                    {b.usedInSteps || b.usedInRuns ? (
                      <>
                        {b.usedInSteps} Schritt{b.usedInSteps === 1 ? "" : "e"}
                        {b.usedInRuns > 0 && <div className="muted">{b.usedInRuns} offen in KundenJourneys</div>}
                      </>
                    ) : (
                      <span className="muted">nicht verwendet</span>
                    )}
                  </td>
                  <td>{formatDate(b.updatedAt)}</td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                      <button className="btn btn-sm" disabled={busy || !b.content.trim()} onClick={() => setTesting(b)} title="Für einen Kunden aufbereiten">
                        Testen
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => {
                          setPreview(false);
                          setDraft({ id: b.id, code: b.code, codeTouched: true, label: b.label, category: b.category, content: b.content });
                        }}
                      >
                        Bearbeiten
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Textbaustein «${b.label}» löschen?`)) act(() => api(`${BASE}/${b.id}`, { method: "DELETE" }), "Textbaustein gelöscht.");
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
          const body = { ...(draft.id ? {} : { code: draft.code }), label: draft.label, category: draft.category, content: draft.content };
          const ok = await act(
            () => api(draft.id ? `${BASE}/${draft.id}` : BASE, { method: draft.id ? "PUT" : "POST", body }),
            draft.id ? "Textbaustein gespeichert." : "Textbaustein angelegt.",
          );
          if (ok) setDraft(EMPTY);
        }}
      >
        <h3>{draft.id ? "Textbaustein bearbeiten" : "Neuer Textbaustein"}</h3>
        <div className="grid2">
          <label className="field">
            <span>Bezeichnung</span>
            <input
              type="text"
              required
              maxLength={120}
              value={draft.label}
              onChange={(e) =>
                setDraft({ ...draft, label: e.target.value, ...(!draft.id && !draft.codeTouched && { code: codeFromLabel(e.target.value) }) })
              }
              placeholder="z.B. Signatur Kundencenter"
            />
          </label>
          <label className="field">
            <span>Kategorie</span>
            <input type="text" list="text-block-categories" maxLength={60} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            <datalist id="text-block-categories">
              {[...new Set([...TEXT_BLOCK_CATEGORIES, ...list.map((b) => b.category).filter(Boolean)])].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <label className="field" style={{ maxWidth: 420 }}>
          <span>Code</span>
          <input
            type="text"
            className="mono"
            required
            maxLength={40}
            value={draft.code}
            disabled={!!draft.id}
            onChange={(e) => setDraft({ ...draft, code: e.target.value.toLowerCase(), codeTouched: true })}
          />
          <span className="hint" style={!draft.id && draft.code && !codeOk ? { color: "var(--danger)" } : undefined}>
            {draft.id ? "Der Code bleibt fest – Schritte verweisen damit auf den Baustein." : "Kleinbuchstaben, Ziffern, - und _; später nicht änderbar."} Im
            Schritt: <code>{blockToken(draft.code || "code")}</code>
          </span>
        </label>

        <div className="field">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Inhalt</span>
            <div className="seg-toggle" role="tablist" aria-label="Ansicht">
              <button type="button" role="tab" aria-selected={!preview} className={!preview ? "active" : ""} onClick={() => setPreview(false)}>
                Bearbeiten
              </button>
              <button type="button" role="tab" aria-selected={preview} className={preview ? "active" : ""} onClick={() => setPreview(true)}>
                Vorschau
              </button>
            </div>
          </div>
          {!preview && <FormatToolbar value={draft.content} onChange={(content) => setDraft({ ...draft, content })} textarea={contentRef} />}
          {preview ? (
            <div className="md-preview">
              <FormattedContent markdown={draft.content} />
            </div>
          ) : (
            <textarea
              ref={contentRef}
              rows={6}
              maxLength={10_000}
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              placeholder={"z.B. Freundliche Grüsse\n{{Kunde.Berater}}"}
              aria-label="Inhalt"
            />
          )}
          <CharCount length={draft.content.length} max={null} hint="Formatierung, Platzhalter und Bedingungen wie in Schritten" />
        </div>
        <PlaceholderPicker catalog={catalog} value={draft.content} onChange={(content) => setDraft({ ...draft, content })} textarea={contentRef} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {draft.id && (
            <button type="button" className="btn" onClick={() => setDraft(EMPTY)}>
              Abbrechen
            </button>
          )}
          <button className="btn btn-primary" disabled={busy || !draft.label.trim() || (!draft.id && !codeOk)}>
            {draft.id ? "Speichern" : "Hinzufügen"}
          </button>
        </div>
      </form>

      {testing && (
        <StepTestModal testUrl={`${BASE}/${testing.id}/test`} title={`Textbaustein testen – ${testing.label}`} onClose={() => setTesting(null)} />
      )}
    </section>
  );
}
