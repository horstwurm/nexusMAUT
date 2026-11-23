"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText } from "@/lib/client";
import type { ExecutionPreview, ExecutionResult } from "@/lib/types";

/**
 * «Ausführen» – confirmation before sending: how many steps «Bereit zur
 * Ausführung» go to which action, then «Senden» / «Abbrechen» and the result.
 */
export function ExecuteModal({ journeyId, journeyName, onClose }: { journeyId: string; journeyName: string; onClose: (changed: boolean) => void }) {
  const [preview, setPreview] = useState<ExecutionPreview | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<ExecutionPreview>(`/api/customer-journeys/execute?journeyId=${encodeURIComponent(journeyId)}`)
      .then(setPreview)
      .catch((err) => setError(errorText(err)));
  }, [journeyId]);

  const close = () => {
    if (!sending) onClose(result !== null);
  };
  const withoutUrl = preview ? preview.total - preview.sendable : 0;

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="execute-title">
        <h2 id="execute-title">Ausführen – {journeyName}</h2>
        <Notice kind="error">{error}</Notice>

        {!preview && !error && <p className="empty">Lädt …</p>}

        {preview && !result && (
          <>
            {preview.sendable === 0 ? (
              <Notice kind="info">
                {preview.total === 0
                  ? "Keine Schritte «Bereit zur Ausführung» in aktiven KundenJourneys dieser Journey."
                  : "Keiner der bereiten Schritte kann gesendet werden – ihren Aktionen fehlt die URL."}
              </Notice>
            ) : (
              <p className="execute-count">
                <strong>{preview.sendable.toLocaleString("de-CH")}</strong> Schritt{preview.sendable === 1 ? "" : "e"} werden ausgeführt
              </p>
            )}
            <p className="small muted">
              Jeder Schritt «Bereit zur Ausführung» wird für seinen Kunden aufbereitet und als JSON an die URL seiner Aktion gesendet. Antwortet die
              Aktion mit Erfolg (2xx), wird der Schritt «Erledigt»; sonst bleibt er bereit und der Fehler wird vermerkt.
            </p>
            {preview.byAction.length > 0 && (
              <div className="table-wrap">
                <table className="small">
                  <thead>
                    <tr>
                      <th>Aktion</th>
                      <th>URL</th>
                      <th className="num">Schritte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.byAction.map((a) => (
                      <tr key={a.actionId}>
                        <td>
                          <strong>{a.name}</strong>
                        </td>
                        <td className="mono" style={{ overflowWrap: "anywhere" }}>
                          {a.url || <span style={{ color: "var(--warn)" }}>keine URL – wird nicht gesendet</span>}
                        </td>
                        <td className="num">{a.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {withoutUrl > 0 && (
              <Notice kind="warn">
                {withoutUrl} Schritt{withoutUrl === 1 ? "" : "e"} ohne URL der Aktion – in der <Link href="/admin?tab=actions">Administration → Aktionen</Link>{" "}
                hinterlegen.
              </Notice>
            )}
            {preview.knownDataErrors > 0 && (
              <Notice kind="warn">
                {preview.knownDataErrors} davon hatte{preview.knownDataErrors === 1 ? "" : "n"} bei der letzten Prüfung einen Datenfehler. Schritte mit fehlenden
                Daten werden beim Senden erneut geprüft und nicht gesendet.
              </Notice>
            )}
          </>
        )}

        {result && (
          <>
            <Notice kind={result.failed || result.dataErrors ? "warn" : "ok"}>
              {result.sent} gesendet und erledigt
              {result.failed ? ` · ${result.failed} fehlgeschlagen` : ""}
              {result.dataErrors ? ` · ${result.dataErrors} mit Datenfehler nicht gesendet` : ""}
              {result.withoutUrl ? ` · ${result.withoutUrl} ohne URL` : ""}
            </Notice>
            {result.remaining > 0 && (
              <Notice kind="info">{result.remaining} Schritte sind noch nicht dran gewesen (Zeitlimit) – nochmals «Ausführen».</Notice>
            )}
            {result.errors.length > 0 && (
              <ul className="small" style={{ color: "var(--danger)", paddingLeft: 18 }}>
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="actions">
          {result ? (
            <button className="btn" onClick={close}>
              Schliessen
            </button>
          ) : (
            <>
              <button className="btn" onClick={close} disabled={sending}>
                Abbrechen
              </button>
              <button
                className="btn btn-danger-solid"
                disabled={sending || !preview || preview.sendable === 0}
                onClick={async () => {
                  setSending(true);
                  setError(null);
                  try {
                    setResult(await api<ExecutionResult>("/api/customer-journeys/execute", { body: { journeyId } }));
                  } catch (err) {
                    setError(errorText(err));
                  } finally {
                    setSending(false);
                  }
                }}
              >
                {sending ? "Sende …" : "Senden"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
