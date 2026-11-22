"use client";

import { useState } from "react";
import { MeaningBadge } from "@/app/journeys/FeedbackOptionsModal";
import type { CustomerJourneyStepView } from "@/lib/types";

/** Shows the POST request that records a customer feedback on one KundenJourney step. */
export function FeedbackApiModal({
  runId,
  step,
  customerName,
  onClose,
}: {
  runId: string;
  step: CustomerJourneyStepView;
  customerName: string;
  onClose: () => void;
}) {
  const [option, setOption] = useState(step.feedbackOptions[0]?.option ?? "Termin vereinbart");
  const [copied, setCopied] = useState<string | null>(null);
  const url = `${window.location.origin}/api/customer-journeys/${runId}/steps/${step.id}/feedbacks`;
  const body = JSON.stringify({ feedback: option, feedbackComment: "", feedbackRating: null }, null, 2);
  const http = `POST ${url}\nContent-Type: application/json\nCookie: sid=<Sitzung>\n\n${body}`;
  const curl = `curl -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Cookie: sid=<Sitzung>' \\\n  -d '${JSON.stringify({ feedback: option, feedbackComment: "", feedbackRating: null }).replace(/'/g, "'\\''")}'`;

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>API – Feedback setzen</h2>
        <p className="small muted">
          {customerName} · Schritt {step.actionName}. Dieser Aufruf erfasst ein Feedback des Kunden zu diesem Schritt.
        </p>

        {step.feedbackOptions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
              Feedback-Option fürs Beispiel
            </div>
            <div className="row" style={{ gap: 6 }}>
              {step.feedbackOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`btn btn-sm${o.option === option ? " btn-primary" : ""}`}
                  onClick={() => {
                    setOption(o.option);
                    setCopied(null);
                  }}
                >
                  <MeaningBadge meaning={o.meaning} /> {o.option}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <strong className="small">HTTP-Anfrage</strong>
          <button type="button" className="btn btn-sm" onClick={() => copy("http", http)}>
            {copied === "http" ? "Kopiert ✓" : "Kopieren"}
          </button>
        </div>
        <pre className="step-preview" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: 0 }}>
          {http}
        </pre>

        <div className="row" style={{ justifyContent: "space-between", margin: "12px 0 4px" }}>
          <strong className="small">curl</strong>
          <button type="button" className="btn btn-sm" onClick={() => copy("curl", curl)}>
            {copied === "curl" ? "Kopiert ✓" : "Kopieren"}
          </button>
        </div>
        <pre className="step-preview" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: 0 }}>
          {curl}
        </pre>

        <table className="small" style={{ marginTop: 12 }}>
          <tbody>
            <tr>
              <td>
                <code>feedback</code>
              </td>
              <td>Pflicht, max. 200 Zeichen – üblicherweise eine der Feedback-Optionen</td>
            </tr>
            <tr>
              <td>
                <code>feedbackComment</code>
              </td>
              <td>optional, max. 2000 Zeichen</td>
            </tr>
            <tr>
              <td>
                <code>feedbackRating</code>
              </td>
              <td>optional, 1 – 5 oder null</td>
            </tr>
          </tbody>
        </table>
        <p className="small muted">
          Antwort: <code>201</code> mit dem gespeicherten Feedback (JSON). Fehler: <code>400</code> ungültige Eingabe, <code>401</code> nicht
          angemeldet, <code>403</code> keine Berechtigung, <code>404</code> Schritt nicht gefunden.
        </p>
        <p className="small muted">
          Die API verlangt derzeit eine angemeldete Sitzung (Cookie <code>sid</code>, Rolle Redaktion oder Admin) – für Aufrufe aus anderen Systemen
          bräuchte es noch einen API-Schlüssel.
        </p>

        <div className="actions">
          <button className="btn" onClick={onClose}>
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}
