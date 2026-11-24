"use client";

import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import type { UploadResult, UploadView } from "@/lib/types";
import { randomSourceName, UPLOAD_SOURCE_LABELS } from "@/lib/uploads";

const MAX_BYTES = 4 * 1024 * 1024;
const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const n = (v: number) => v.toLocaleString("de-CH");

type Opts = { deleteCustomers: boolean; deleteAttributes: boolean; deleteUploadData: boolean; uploads: string[] };

/** The form for test and upload: files and the three delete options. */
function formOf(files: File[], opts: Opts, mode: "test" | "upload") {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  form.set("mode", mode);
  form.set("deleteCustomers", String(opts.deleteCustomers));
  form.set("deleteAttributes", String(opts.deleteAttributes));
  // «Upload Daten löschen» – only without «Bestehende Kunden löschen» (that deletes everything anyway)
  if (opts.deleteUploadData && !opts.deleteCustomers) for (const id of opts.uploads) form.append("deleteUploads", id);
  return form;
}

/** «Test»: sends the files and options; the server checks them and writes nothing. */
async function sendTest(files: File[], opts: Opts): Promise<UploadResult> {
  const form = formOf(files, opts, "test");
  const res = await fetch("/api/data-management/initial-upload", { method: "POST", body: form, cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `Fehler ${res.status}`);
  return data as UploadResult;
}

type Progress = { percent: number; label: string };

/**
 * The upload itself, with progress: sending the files = 0–10 % (XHR upload progress), then the
 * server's NDJSON lines {progress, label} = 10–100 %, finally {result} or {error}.
 */
function uploadWithProgress(files: File[], opts: Opts, sourceName: string, onProgress: (p: Progress) => void): Promise<UploadResult> {
  const form = formOf(files, opts, "upload");
  form.set("sourceName", sourceName);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let read = 0;
    let result: UploadResult | null = null;
    let failure: string | null = null;
    /** handles the complete NDJSON lines received so far */
    const consume = () => {
      if (xhr.status !== 200) return;
      const text = xhr.responseText;
      const end = text.lastIndexOf("\n") + 1;
      if (end <= read) return;
      for (const line of text.slice(read, end).split("\n")) {
        if (!line.trim()) continue;
        const m = JSON.parse(line) as { progress?: number; label?: string; result?: UploadResult; error?: string };
        if (m.result) result = m.result;
        else if (m.error) failure = m.error;
        else if (typeof m.progress === "number") onProgress({ percent: 10 + Math.round(m.progress * 0.9), label: m.label ?? "" });
      }
      read = end;
    };
    xhr.open("POST", "/api/data-management/initial-upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress({ percent: Math.round((e.loaded / e.total) * 10), label: "Datei senden" });
    };
    xhr.onprogress = consume;
    xhr.onload = () => {
      if (xhr.status !== 200) {
        let message = `Fehler ${xhr.status}`;
        try {
          message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
        } catch {
          /* keep the status */
        }
        reject(new Error(message));
        return;
      }
      consume();
      if (result) {
        onProgress({ percent: 100, label: result.done ? "Fertig" : "Nicht hochgeladen" });
        resolve(result);
      } else reject(new Error(failure ?? "Der Upload wurde unterbrochen"));
    };
    xhr.onerror = () => reject(new Error("Keine Verbindung zum Server"));
    xhr.send(form);
  });
}

/** Admin → Data Management → Initial Upload: choose the source, test it, upload it (with confirmation). */
export function InitialUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<Opts>({ deleteCustomers: false, deleteAttributes: false, deleteUploadData: false, uploads: [] });
  /** earlier uploads – loaded when «Upload Daten löschen» is switched on */
  const [uploads, setUploads] = useState<UploadView[] | null>(null);
  const [uploadsError, setUploadsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"test" | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [confirm, setConfirm] = useState<UploadResult | null>(null);
  /** the upload's unique name – asked in the confirmation dialog */
  const [sourceName, setSourceName] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const change = (o: Partial<Opts>) => {
    setOpts({ ...opts, ...o });
    setResult(null);
  };
  const loadUploads = () =>
    api<UploadView[]>("/api/data-management/uploads")
      .then((l) => {
        setUploads(l);
        setUploadsError(null);
      })
      .catch((err) => setUploadsError(errorText(err)));
  useEffect(() => {
    if (opts.deleteUploadData && uploads === null) loadUploads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.deleteUploadData]);
  const total = files.reduce((s, f) => s + f.size, 0);
  const tooBig = total > MAX_BYTES;

  /** «Test» (also the first step of «Upload»): shows the report */
  async function runTest() {
    setBusy("test");
    setError(null);
    try {
      const r = await sendTest(files, opts);
      setResult(r);
      return r;
    } catch (err) {
      setError(errorText(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="upload-form">
      <label className="field">
        <span>Quelle</span>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          onChange={(e) => {
            setFiles([...(e.target.files ?? [])]);
            setResult(null);
            setError(null);
          }}
        />
        <span className="hint">Eine Excel- oder JSON-Datei, oder die CSV-Dateien Typen, Kunden, Positionen und Transaktionen (Mehrfachauswahl). Zusammen max. 4 MB.</span>
      </label>
      {files.length > 0 && (
        <ul className="upload-files small">
          {files.map((f) => (
            <li key={f.name}>
              <span className="mono">{f.name}</span> <span className="muted">{size(f.size)}</span>
            </li>
          ))}
        </ul>
      )}
      {tooBig && <Notice kind="error">Die Dateien sind zusammen {size(total)} gross – höchstens 4 MB.</Notice>}

      <label className="switch-field">
        <input type="checkbox" role="switch" className="switch" checked={opts.deleteCustomers} onChange={(e) => change({ deleteCustomers: e.target.checked })} />
        <span>
          <strong>Bestehende Kunden löschen</strong>
          <span className="small muted" style={{ display: "block" }}>
            Vor dem Upload alle Kunden mit ihren Positionen, Transaktionen, Produkten, Kommunikationspräferenzen und KundenJourneys löschen.
          </span>
        </span>
      </label>
      <label className="switch-field">
        <input type="checkbox" role="switch" className="switch" checked={opts.deleteAttributes} onChange={(e) => change({ deleteAttributes: e.target.checked })} />
        <span>
          <strong>Bestehende Attribute löschen</strong>
          <span className="small muted" style={{ display: "block" }}>
            Die Positions- und Transaktionsattribute der Typen in der Quelle löschen und aus der Quelle neu anlegen.
          </span>
        </span>
      </label>
      <label className="switch-field">
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={opts.deleteUploadData && !opts.deleteCustomers}
          disabled={opts.deleteCustomers}
          onChange={(e) => change({ deleteUploadData: e.target.checked })}
        />
        <span>
          <strong>Upload Daten löschen</strong>
          <span className="small muted" style={{ display: "block" }}>
            {opts.deleteCustomers
              ? "Nicht nötig – «Bestehende Kunden löschen» löscht alle Kunden."
              : "Vor dem Upload die Daten gewählter früherer Uploads löschen: ihre Kunden mit allem, was dazugehört, und ihre Positionen und Transaktionen."}
          </span>
        </span>
      </label>
      {opts.deleteUploadData && !opts.deleteCustomers && (
        <div className="upload-list">
          <Notice kind="error">{uploadsError}</Notice>
          {uploads === null ? (
            <p className="small muted">Lädt …</p>
          ) : uploads.length === 0 ? (
            <p className="small muted">Noch keine Uploads.</p>
          ) : (
            <div className="table-wrap">
              <table className="small">
                <thead>
                  <tr>
                    <th style={{ width: 1 }} aria-label="Wählen" />
                    <th>Upload</th>
                    <th>Datum</th>
                    <th className="num">Kunden</th>
                    <th className="num">Positionen</th>
                    <th className="num">Transaktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => {
                    const empty = u.current.customers + u.current.positions + u.current.transactions === 0;
                    const checked = opts.uploads.includes(u.id);
                    return (
                      <tr key={u.id} className={empty ? "muted" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Daten von «${u.name}» löschen`}
                            checked={checked}
                            disabled={empty && !checked}
                            onChange={(e) => change({ uploads: e.target.checked ? [...opts.uploads, u.id] : opts.uploads.filter((x) => x !== u.id) })}
                          />
                        </td>
                        <td>
                          <strong>{u.name}</strong> <span className="badge">{UPLOAD_SOURCE_LABELS[u.source]}</span>
                          {u.deletedAt && <span className="badge" style={{ marginLeft: 4 }}>gelöscht</span>}
                          <div className="muted">{u.createdByName}</div>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{formatDate(u.createdAt, true)}</td>
                        <td className="num">{n(u.current.customers)}</td>
                        <td className="num">{n(u.current.positions)}</td>
                        <td className="num">{n(u.current.transactions)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            Zahlen: was davon noch in nexusMAUT ist. {opts.uploads.length ? `${opts.uploads.length} gewählt.` : "Keiner gewählt."}
          </p>
        </div>
      )}

      <Notice kind="error">{error}</Notice>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" disabled={!files.length || tooBig || busy !== null} onClick={() => runTest()} title="Quelle prüfen – schreibt nichts">
          {busy === "test" ? "Prüfe …" : "Test"}
        </button>
        <button
          className="btn btn-danger-solid"
          disabled={!files.length || tooBig || busy !== null}
          title="Quelle prüfen und nach Bestätigung hochladen"
          onClick={async () => {
            const r = await runTest();
            if (r) {
              setSourceName(randomSourceName());
              setConfirmError(null);
              setConfirm(r);
            }
          }}
        >
          {busy === "upload" ? "Lädt hoch …" : "Upload"}
        </button>
      </div>

      {result && <UploadReportView result={result} />}

      {confirm && (
        <div className="modal-back" onClick={() => busy === null && setConfirm(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="upload-confirm-title">
            <h2 id="upload-confirm-title">Initial Upload – {UPLOAD_SOURCE_LABELS[confirm.source]}</h2>
            {confirm.errorCount > 0 ? (
              <>
                <Notice kind="error">
                  Die Quelle hat {n(confirm.errorCount)} Fehler – so wird nichts hochgeladen. Details unten, nach dem Korrigieren nochmals «Test».
                </Notice>
                <UploadReportView result={confirm} compact />
              </>
            ) : (
              <>
                <p className="execute-count">
                  <strong>{n(confirm.counts.customers)}</strong> Kunden werden angelegt
                </p>
                <p className="small">
                  mit {n(confirm.counts.positions)} Positionen, {n(confirm.counts.transactions)} Transaktionen und {n(confirm.counts.products)} Produkten
                  {confirm.newTypes.length + confirm.newAttributes.length + confirm.newCustomerAttributes.length > 0 &&
                    ` – dazu ${confirm.newTypes.length} neue Typen und ${confirm.newAttributes.length + confirm.newCustomerAttributes.length} neue Attribute`}
                  .
                </p>
                {opts.deleteCustomers && confirm.deletes.customers > 0 && (
                  <Notice kind="error">
                    Zuerst werden <strong>alle {n(confirm.deletes.customers)} bestehenden Kunden</strong> mit {n(confirm.deletes.positions)} Positionen,{" "}
                    {n(confirm.deletes.transactions)} Transaktionen und {n(confirm.deletes.customerJourneys)} KundenJourneys gelöscht – das lässt sich nicht
                    rückgängig machen.
                  </Notice>
                )}
                {confirm.uploadDeletes && (
                  <Notice kind="error">
                    Zuerst werden die Daten der Uploads {confirm.uploadDeletes.names.map((x) => `«${x}»`).join(", ")} gelöscht:{" "}
                    <strong>{n(confirm.uploadDeletes.customers)} Kunden</strong>, {n(confirm.uploadDeletes.positions)} Positionen, {n(confirm.uploadDeletes.transactions)}{" "}
                    Transaktionen und {n(confirm.uploadDeletes.customerJourneys)} KundenJourneys – das lässt sich nicht rückgängig machen.
                  </Notice>
                )}
                {confirm.deletes.attributes > 0 && (
                  <Notice kind="warn">{n(confirm.deletes.attributes)} bestehende Positions- und Transaktionsattribute werden gelöscht und aus der Quelle neu angelegt.</Notice>
                )}
                {confirm.warnings.map((w) => (
                  <Notice key={w} kind="warn">
                    {w}
                  </Notice>
                ))}
                <label className="field" style={{ marginTop: 12 }}>
                  <span>Quellname</span>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <input type="text" required maxLength={60} value={sourceName} onChange={(e) => setSourceName(e.target.value)} disabled={busy !== null} autoFocus />
                    <button type="button" className="btn btn-sm" onClick={() => setSourceName(randomSourceName())} title="Neuen Vorschlag erzeugen">
                      Neu
                    </button>
                  </div>
                  <span className="hint">Eindeutiger Name dieses Uploads – steht bei jedem Kunden, jeder Position und Transaktion (Spalte «Quelle»).</span>
                </label>
                <Notice kind="error">{confirmError}</Notice>
              </>
            )}
            {progress && (
              <div className="upload-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Fortschritt des Uploads">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="small">
                    {progress.label}
                    {progress.percent < 100 ? " …" : ""}
                  </span>
                  <strong className="small">{progress.percent} %</strong>
                </div>
                <div className="upload-progress-track">
                  <div className="upload-progress-bar" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            )}
            <div className="actions">
              <button className="btn" disabled={busy !== null} onClick={() => setConfirm(null)}>
                Abbrechen
              </button>
              {confirm.errorCount === 0 && (
                <button
                  className="btn btn-danger-solid"
                  disabled={busy !== null || !sourceName.trim()}
                  onClick={async () => {
                    setBusy("upload");
                    setConfirmError(null);
                    setProgress({ percent: 0, label: "Datei senden" });
                    try {
                      const r = await uploadWithProgress(files, opts, sourceName, setProgress);
                      await new Promise((res) => setTimeout(res, 400)); // let the bar show 100 %
                      setConfirm(null);
                      setResult(r);
                      if (r.done) {
                        setFiles([]);
                        if (input.current) input.current.value = "";
                        setOpts((o) => ({ ...o, uploads: [] }));
                        setUploads(null);
                        if (opts.deleteUploadData) loadUploads();
                      }
                    } catch (err) {
                      // e.g. the name is taken – stay in the dialog
                      setConfirmError(errorText(err));
                    } finally {
                      setBusy(null);
                      setProgress(null);
                    }
                  }}
                >
                  {busy === "upload" ? "Lädt hoch …" : "Upload ausführen"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The result of «Test» or «Upload»: counts, what is created / deleted, warnings and errors. */
function UploadReportView({ result: r, compact = false }: { result: UploadResult; compact?: boolean }) {
  const created = r.created;
  return (
    <div className="upload-report">
      {!compact && (
        <Notice kind={r.done ? "ok" : r.errorCount ? "error" : "info"}>
          {r.done
            ? `«${r.sourceName}» hochgeladen aus ${UPLOAD_SOURCE_LABELS[r.source]}: ${n(created!.customers)} Kunden, ${n(created!.positions)} Positionen, ${n(created!.transactions)} Transaktionen, ${n(created!.products)} Produkte${created!.types ? `, ${created!.types} Typen` : ""}${created!.attributes ? `, ${created!.attributes} Attribute` : ""}.`
            : r.errorCount
              ? `Test: ${n(r.errorCount)} Fehler – so lässt sich die Quelle nicht hochladen.`
              : "Test: keine Fehler – bereit für den Upload."}
        </Notice>
      )}
      {!compact && (
        <div className="upload-counts">
          {(
            [
              ["Kunden", r.counts.customers],
              ["Positionen", r.counts.positions],
              ["Transaktionen", r.counts.transactions],
              ["Produkte", r.counts.products],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <strong>{n(v)}</strong>
              <span className="small muted">{label}</span>
            </div>
          ))}
        </div>
      )}
      {!compact && (
        <p className="small muted" style={{ margin: "4px 0 8px" }}>
          {UPLOAD_SOURCE_LABELS[r.source]}: {r.files.join(", ")}
          {!r.done && r.existingCustomers > 0 && ` · ${n(r.existingCustomers)} Kunden bereits in nexusMAUT`}
        </p>
      )}
      {!compact && r.newTypes.length + r.newAttributes.length + r.newCustomerAttributes.length > 0 && (
        <details className="small" style={{ marginBottom: 8 }}>
          <summary>
            {r.done ? "Angelegt" : "Wird angelegt"}: {r.newTypes.length} Typen, {r.newAttributes.length} Positions-/Transaktionsattribute, {r.newCustomerAttributes.length}{" "}
            Kundenattribute
          </summary>
          <ul>
            {[...r.newTypes.map((t) => `Typ ${t}`), ...r.newAttributes, ...r.newCustomerAttributes.map((a) => `Kundenattribut ${a}`)].map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      )}
      {!compact && r.uploadDeletes && (
        <Notice kind="warn">
          {r.done ? "Gelöscht" : "Wird zuerst gelöscht"} – Daten der Uploads {r.uploadDeletes.names.map((x) => `«${x}»`).join(", ")}: {n(r.uploadDeletes.customers)} Kunden,{" "}
          {n(r.uploadDeletes.positions)} Positionen, {n(r.uploadDeletes.transactions)} Transaktionen, {n(r.uploadDeletes.customerJourneys)} KundenJourneys.
        </Notice>
      )}
      {!compact &&
        r.warnings.map((w) => (
          <Notice key={w} kind="warn">
            {w}
          </Notice>
        ))}
      {r.errors.length > 0 && (
        <div className="upload-errors small">
          <strong>
            {n(r.errorCount)} Fehler{r.errorCount > r.errors.length ? ` (die ersten ${r.errors.length})` : ""}
          </strong>
          <ul>
            {r.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
