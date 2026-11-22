"use client";

import { Fragment, useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText } from "@/lib/client";
import { formatDay } from "@/lib/customers";
import type { Segment } from "@/lib/placeholders";
import type { Customer, JourneyStepView } from "@/lib/types";

export type Preview = {
  customer: { id: string; name: string };
  segments: Segment[];
  services: { name: string; status: "ok" | "sample" | "error"; message?: string; sent?: Record<string, unknown> }[];
};

/** «Testen» of a journey step: choose a customer, see the content with placeholders filled. */
export function StepTestModal({
  journeyId,
  step,
  actionName,
  onClose,
}: {
  journeyId: string;
  step: JourneyStepView;
  actionName: string;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // customer search (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      api<Customer[]>(`/api/customers?${new URLSearchParams({ ...(q && { q }), limit: "50" })}`)
        .then((list) => {
          setCustomers(list);
          setCustomerId((cur) => (cur && list.some((c) => c.id === cur) ? cur : (list[0]?.id ?? "")));
        })
        .catch((err) => setError(errorText(err)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function run() {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await api<Preview>(`/api/journeys/${journeyId}/steps/${step.id}/test`, { body: { customerId } }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal-wide" style={{ maxWidth: 980 }} onClick={(e) => e.stopPropagation()}>
        <h2>Schritt testen – {actionName}</h2>
        <p className="small muted">Der Inhalt wird für einen Kunden aufbereitet: Platzhalter werden mit seinen Daten gefüllt, verwendete Services aufgerufen.</p>
        <Notice kind="error">{error}</Notice>

        <div className="row" style={{ alignItems: "flex-end", marginBottom: 12 }}>
          <label className="field grow" style={{ marginBottom: 0, maxWidth: 260 }}>
            <span>Kunde suchen</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vor- oder Nachname" />
          </label>
          <label className="field grow" style={{ marginBottom: 0 }}>
            <span>Kunde</span>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!customers?.length}>
              {!customers?.length && <option value="">{customers ? "Keine Kunden gefunden" : "Lädt …"}</option>}
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lastname} {c.name} ({formatDay(c.dateOfBirth)})
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy || !customerId} onClick={run}>
            {busy ? "Teste …" : "Testen"}
          </button>
        </div>

        {preview && <StepPreviewResult preview={preview} />}

        <details className="small">
          <summary>Wie werden Platzhalter gefüllt?</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li>
              <code>{"{{Kunde.…}}"}</code> – Felder und Kundenattribute des Kunden
            </li>
            <li>
              <code>{"{{Produkt.Name|Typ}}"}</code> – alle Produkte, mit Komma getrennt
            </li>
            <li>
              <code>{"{{Position.Typ.Attribut}}"}</code> – Werte aller Positionen dieses Typs, mit Komma getrennt
            </li>
            <li>
              <code>{"{{Transaktion.Typ.Attribut}}"}</code> – die neueste Transaktion des Typs (nach ihrem Datumsattribut)
            </li>
            <li>
              <code>{"{{Service.Name.Attribut}}"}</code> – der Service wird aufgerufen; PUT-Attribute kommen aus gleichnamigen Feldern / Attributen des
              Kunden. Nicht erreichbar → Beispieldaten (gelb markiert).
            </li>
          </ul>
        </details>

        <div className="actions">
          <button className="btn" onClick={onClose}>
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}

/** The rendered content (filled / sample / missing placeholders) and the services called. */
export function StepPreviewResult({ preview }: { preview: Preview }) {
  const placeholders = preview.segments.filter((s): s is Extract<Segment, { kind: "placeholder" }> => s.kind === "placeholder");
  const missing = placeholders.filter((p) => p.value === null);
  return (
    <>
        <h3>
          Ergebnis für {preview.customer.name}{" "}
          <span className="small muted" style={{ fontWeight: 400 }}>
            · {placeholders.length - missing.length} von {placeholders.length} Platzhaltern gefüllt
          </span>
        </h3>
        <div className="step-preview">
          {preview.segments.map((s, i) =>
            s.kind === "text" ? (
              <Fragment key={i}>{s.text}</Fragment>
            ) : s.value !== null ? (
              <mark key={i} className={`ph-filled${s.note ? " ph-sample" : ""}`} title={`${s.token}${s.note ? ` – ${s.note}` : ""}`}>
                {s.value}
              </mark>
            ) : (
              <mark key={i} className="ph-missing" title={`${s.token} – ${s.note ?? "kein Wert"}`}>
                {s.token}
              </mark>
            ),
          )}
          {!preview.segments.length && <span className="muted">(kein Inhalt)</span>}
        </div>

        {missing.length > 0 && (
          <Notice kind="warn">
            Ohne Wert:{" "}
            {missing.map((m, i) => (
              <span key={i}>
                {i > 0 && ", "}
                <code>{m.token}</code> ({m.note ?? "kein Wert"})
              </span>
            ))}
          </Notice>
        )}

        {preview.services.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <h4 style={{ margin: "0 0 6px" }}>Aufgerufene Services</h4>
            {preview.services.map((s) => (
              <div key={s.name} className="small" style={{ marginBottom: 4 }}>
                <span className={`badge ${s.status === "ok" ? "badge-ok" : s.status === "sample" ? "badge-warn" : "badge-danger"}`}>
                  {s.status === "ok" ? "ok" : s.status === "sample" ? "Beispieldaten" : "Fehler"}
                </span>{" "}
                <strong>{s.name}</strong>
                {s.message && <span className="muted"> – {s.message}</span>}
                {s.sent && (
                  <div className="muted">
                    gesendet: <code>{JSON.stringify(s.sent)}</code>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </>
  );
}
