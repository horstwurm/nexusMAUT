"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MeaningBadge } from "@/app/journeys/FeedbackOptionsModal";
import { Notice } from "@/components/Notice";
import { api, errorText } from "@/lib/client";
import type { CustomerJourneyStepView } from "@/lib/types";

type ActionRequest = {
  action: { name: string; url: string };
  /** done = the stored content, preview = the template rendered now */
  contentSource: "done" | "preview";
  body: Record<string, unknown> & { unfilled: string[] };
};

const shellQuote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** A request as HTTP text and as curl command, each with a copy button. */
function RequestBlock({ id, url, body, auth, copied, onCopy }: {
  id: string;
  url: string;
  body: unknown;
  /** value of the Authorization header */
  auth?: string;
  copied: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const http = `POST ${url}\nContent-Type: application/json${auth ? `\nAuthorization: ${auth}` : ""}\n\n${JSON.stringify(body, null, 2)}`;
  const curl = `curl -X POST ${shellQuote(url)} \\\n  -H 'Content-Type: application/json' \\\n${auth ? `  -H ${shellQuote(`Authorization: ${auth}`)} \\\n` : ""}  -d ${shellQuote(JSON.stringify(body))}`;
  return (
    <>
      {(
        [
          ["http", "HTTP-Anfrage", http],
          ["curl", "curl", curl],
        ] as const
      ).map(([kind, label, text]) => (
        <div key={kind}>
          <div className="row" style={{ justifyContent: "space-between", margin: "10px 0 4px" }}>
            <strong className="small">{label}</strong>
            <button type="button" className="btn btn-sm" onClick={() => onCopy(`${id}-${kind}`, text)}>
              {copied === `${id}-${kind}` ? "Kopiert ✓" : "Kopieren"}
            </button>
          </div>
          <pre className="step-preview" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, maxHeight: 320 }}>
            {text}
          </pre>
        </div>
      ))}
    </>
  );
}

/**
 * «API» of a KundenJourney step, two columns: the request that hands the step to
 * its action (action URL + content as JSON) and the one that records the
 * customer's feedback.
 */
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
  const [request, setRequest] = useState<ActionRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedbackUrl = `${window.location.origin}/api/customer-journeys/${runId}/steps/${step.id}/feedbacks`;

  useEffect(() => {
    api<ActionRequest>(`/api/customer-journeys/${runId}/steps/${step.id}/action-request`, { method: "POST" })
      .then(setRequest)
      .catch((err) => setError(errorText(err)));
  }, [runId, step.id]);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
        <h2>API</h2>
        <p className="small muted">
          {customerName} · Schritt {step.actionName}
        </p>

        <div className="api-columns">
          <section>
            <h3 style={{ marginTop: 0 }}>1 · Aktion aufrufen</h3>
            <p className="small muted">
              Übergibt den Schritt an die Aktion: POST an die URL der Aktion, der Inhalt für den Kunden als JSON. Wird hier nur angezeigt, nicht
              gesendet.
            </p>
            <Notice kind="error">{error}</Notice>
            {!request && !error && <p className="empty">Inhalt wird aufbereitet …</p>}
            {request && (
              <>
                {!request.action.url && (
                  <Notice kind="warn">
                    Die Aktion «{request.action.name}» hat keine URL – in der <Link href="/admin?tab=actions">Administration → Aktionen</Link>{" "}
                    hinterlegen.
                  </Notice>
                )}
                <p className="small">
                  {request.contentSource === "done"
                    ? "Inhalt: wie beim Erledigen gespeichert."
                    : "Inhalt: Vorlage jetzt für den Kunden aufbereitet (der Schritt ist noch nicht erledigt)."}
                  {request.body.unfilled.length > 0 && (
                    <span style={{ color: "var(--warn)" }}> Ohne Wert: {request.body.unfilled.join(", ")}</span>
                  )}
                </p>
                <RequestBlock id="action" url={request.action.url || "<URL der Aktion>"} body={request.body} copied={copied} onCopy={copy} />
                <p className="small muted">
                  Die Aktion meldet das Ergebnis über <code>feedbackUrl</code> zurück (rechte Spalte).
                </p>
              </>
            )}
          </section>

          <section>
            <h3 style={{ marginTop: 0 }}>2 · Feedback setzen</h3>
            <p className="small muted">
              Erfasst ein Feedback des Kunden zu diesem Schritt – vom System, das die Aktion «{step.actionName}» ausführt, mit deren API-Schlüssel (
              <Link href="/admin?tab=actions">Administration → Aktionen</Link>).
            </p>
            {step.feedbackOptions.length > 0 && (
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
            )}
            <RequestBlock
              id="feedback"
              url={feedbackUrl}
              body={{ feedback: option, feedbackComment: "", feedbackRating: null }}
              auth="Bearer <API-Schlüssel der Aktion>"
              copied={copied}
              onCopy={copy}
            />
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
              Antwort: <code>201</code> mit dem gespeicherten Feedback. Fehler: <code>400</code> ungültige Eingabe, <code>401</code> Schlüssel fehlt, ist ungültig oder widerrufen,{" "}
              <code>403</code> Schlüssel einer anderen Aktion, <code>404</code> Schritt nicht gefunden. Ohne Schlüssel geht es nur mit einer
              angemeldeten Sitzung (Redaktion / Admin).
            </p>
          </section>
        </div>

        <div className="actions">
          <button className="btn" onClick={onClose}>
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}
