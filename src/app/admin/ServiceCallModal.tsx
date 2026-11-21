"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText } from "@/lib/client";
import { formatValue, type AttributeDef } from "@/lib/positions";
import { CALL_METHODS, type CallMethod, type MappedValue } from "@/lib/serviceCall";
import { ATTRIBUTE_TYPES } from "@/lib/typeAttributes";
import type { ServiceView, TypeAttribute } from "@/lib/types";
import { AttributeFields, formValues, type FormValue } from "../customers/[id]/AttributeFields";

type CallResult = {
  request: { method: CallMethod; url: string; body: string | null; payload: Record<string, unknown> };
  response: { status: number; ok: boolean; durationMs: number; contentType: string | null; raw: string; truncated: boolean } | null;
  error: string | null;
  mapped: MappedValue[] | null;
  /** service not available: the expected answer with sample data */
  mock?: { response: Record<string, unknown>; mapped: MappedValue[] };
};

const toDefs = (list: TypeAttribute[]): AttributeDef[] => list.map((a) => ({ id: a.id, attribute: a.attribute, attributeType: a.attributeType, options: a.options }));

/** «Testen»: fills the PUT attributes, calls the service, shows the GET attributes from the answer. */
export function ServiceCallModal({ service, onClose }: { service: ServiceView; onClose: () => void }) {
  const base = `/api/services/${service.id}`;
  const [putDefs, setPutDefs] = useState<AttributeDef[] | null>(null);
  const [getDefs, setGetDefs] = useState<AttributeDef[]>([]);
  const [values, setValues] = useState<Record<string, FormValue>>({});
  const [method, setMethod] = useState<CallMethod>("POST");
  const [result, setResult] = useState<CallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api<TypeAttribute[]>(`${base}/put-attributes`), api<TypeAttribute[]>(`${base}/get-attributes`)])
      .then(([p, g]) => {
        const defs = toDefs(p);
        setPutDefs(defs);
        setGetDefs(toDefs(g));
        setValues(formValues(defs, {}));
      })
      .catch((err) => setError(errorText(err)));
  }, [base]);

  // what will be sent (preview, before the call)
  const payload = Object.fromEntries(
    (putDefs ?? [])
      .filter((d) => values[d.id] !== null && values[d.id] !== "" && values[d.id] !== undefined)
      .map((d) => [d.attribute, d.attributeType === "num" ? Number(String(values[d.id]).replace(/['’ ]/g, "").replace(",", ".")) : values[d.id]]),
  );
  const previewUrl = (() => {
    if (method !== "GET" || !service.url) return service.url;
    try {
      const u = new URL(service.url);
      for (const [k, v] of Object.entries(payload)) u.searchParams.set(k, String(v));
      return u.toString();
    } catch {
      return service.url;
    }
  })();

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal-wide" style={{ maxWidth: 980 }} onClick={(e) => e.stopPropagation()}>
        <h2>Service «{service.name}» testen</h2>
        <p className="small muted">
          Die PUT-Attribute werden als JSON gesendet (bei GET als URL-Parameter), die JSON-Antwort wird über die Namen den GET-Attributen
          zugeordnet und auf den Attributtyp geprüft.
        </p>
        <Notice kind="error">{error}</Notice>

        <div className="grid2" style={{ alignItems: "start" }}>
          <div>
            <h3>Anfrage</h3>
            <div className="row" style={{ marginBottom: 10 }}>
              <select value={method} onChange={(e) => setMethod(e.target.value as CallMethod)} style={{ width: "auto" }} aria-label="Methode">
                {CALL_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <code style={{ overflowWrap: "anywhere" }}>{previewUrl || "(keine URL)"}</code>
            </div>
            {putDefs === null ? (
              <p className="small muted">Lädt …</p>
            ) : putDefs.length === 0 ? (
              <p className="small muted">Keine PUT-Attribute – es wird ohne Werte aufgerufen.</p>
            ) : (
              <AttributeFields defs={putDefs} values={values} onChange={setValues} />
            )}
            {method !== "GET" && (
              <>
                <div className="small muted" style={{ margin: "6px 0 4px" }}>
                  Body (JSON)
                </div>
                <pre style={{ margin: 0, maxHeight: 180 }}>
                  <code>{JSON.stringify(payload, null, 2)}</code>
                </pre>
              </>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn btn-primary"
                disabled={busy || putDefs === null || !service.url}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  setResult(null);
                  try {
                    setResult(await api<CallResult>(`${base}/call`, { body: { method, values } }));
                  } catch (err) {
                    setError(errorText(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Rufe auf …" : "Aufrufen"}
              </button>
            </div>
          </div>

          <div>
            <h3>Ergebnis</h3>
            {!result ? (
              <p className="small muted">
                Noch nicht aufgerufen. Erwartet werden {getDefs.length ? getDefs.map((d) => `«${d.attribute}»`).join(", ") : "keine GET-Attribute"}.
              </p>
            ) : (
              <>
                {result.response && (
                  <div className="row small" style={{ marginBottom: 8 }}>
                    <span className={`badge ${result.response.ok ? "badge-ok" : "badge-danger"}`}>HTTP {result.response.status}</span>
                    <span className="muted">{result.response.durationMs} ms</span>
                    {result.response.contentType && <span className="muted mono">{result.response.contentType}</span>}
                  </div>
                )}
                <Notice kind={result.response ? "warn" : "error"}>{result.error}</Notice>
                {result.mapped && <MappedTable rows={result.mapped} />}
                {result.mock && (
                  <div className="mock-result">
                    <Notice kind="warn">
                      <strong>Service nicht verfügbar</strong> – so sähe das Ergebnis aus (Beispieldaten, nicht vom Service).
                    </Notice>
                    <MappedTable rows={result.mock.mapped} sample />
                    <details open style={{ marginTop: 10 }}>
                      <summary className="small">Erwartete Antwort (JSON)</summary>
                      <pre style={{ maxHeight: 220 }}>
                        <code>{JSON.stringify(result.mock.response, null, 2)}</code>
                      </pre>
                    </details>
                  </div>
                )}
                {result.response && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="small">Rohe Antwort{result.response.truncated ? " (gekürzt)" : ""}</summary>
                    <pre style={{ maxHeight: 260 }}>
                      <code>{prettyJson(result.response.raw)}</code>
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
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

function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text || "(leer)";
  }
}

/** The GET attributes with their values and status; `sample` marks sample data. */
function MappedTable({ rows, sample }: { rows: MappedValue[]; sample?: boolean }) {
  if (!rows.length) return <p className="small muted">Keine GET-Attribute definiert.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>GET-Attribut</th>
            <th>Wert</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.attribute}>
              <td>
                <strong>{m.attribute}</strong>
                <div className="small muted">
                  {m.list ? `Liste · ${m.list.rows.length} Zeile${m.list.rows.length === 1 ? "" : "n"}` : ATTRIBUTE_TYPES[m.attributeType]}
                </div>
              </td>
              <td className={sample ? "muted" : undefined} style={sample ? { fontStyle: "italic" } : undefined}>
                {m.list ? (
                  <ListValue list={m.list} />
                ) : m.status === "ok" ? (
                  formatValue({ id: "", attribute: m.attribute, attributeType: m.attributeType, options: [] }, m.value ?? undefined)
                ) : m.raw !== undefined ? (
                  <code>{JSON.stringify(m.raw)}</code>
                ) : (
                  <span className="muted">–</span>
                )}
              </td>
              <td className="small">
                {sample ? (
                  <span className="badge badge-warn">Beispiel</span>
                ) : (
                  <>
                    {m.status === "ok" && <span className="badge badge-ok">ok</span>}
                    {m.status === "missing" && <span className="badge badge-warn">fehlt</span>}
                    {m.status === "invalid" && (
                      <span className="badge badge-danger" title={m.error}>
                        {m.error}
                      </span>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SHOWN_ROWS = 50;

/** A list result as a table: one row per entry, wrong values marked. */
function ListValue({ list }: { list: NonNullable<MappedValue["list"]> }) {
  if (!list.rows.length) return <span className="muted">(leere Liste)</span>;
  const fmt = (c: (typeof list.columns)[number], v: unknown) =>
    v === null || v === undefined ? "–" : formatValue({ id: "", attribute: c.attribute, attributeType: c.attributeType, options: [] }, v as never);
  return (
    <div className="table-wrap" style={{ maxHeight: 280, overflow: "auto" }}>
      <table className="list-value">
        <thead>
          <tr>
            <th className="num">#</th>
            {list.columns.map((c) => (
              <th key={c.attribute} className={c.attributeType === "num" ? "num" : ""}>
                {c.attribute}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.rows.slice(0, SHOWN_ROWS).map((r, i) => (
            <tr key={i} className={r.errors.length ? "row-invalid" : undefined} title={r.errors.join("\n") || undefined}>
              <td className="num muted">{i + 1}</td>
              {list.columns.map((c) => (
                <td key={c.attribute} className={c.attributeType === "num" ? "num" : ""}>
                  {fmt(c, r.values[c.attribute])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(list.rows.length > SHOWN_ROWS || list.truncated) && (
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          {list.rows.length > SHOWN_ROWS ? `+ ${list.rows.length - SHOWN_ROWS} weitere Zeilen` : ""}
          {list.truncated ? " (Antwort auf 1000 Zeilen gekürzt)" : ""}
        </p>
      )}
    </div>
  );
}
