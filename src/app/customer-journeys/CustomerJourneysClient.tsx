"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { StepPreviewResult, type Preview } from "@/app/journeys/StepTestModal";
import { api, errorText, formatDate } from "@/lib/client";
import type { Customer, CustomerFeedbackView, CustomerJourneyStatus, CustomerJourneyStepView, CustomerJourneyView, DataStatus } from "@/lib/types";

type JourneyOption = { id: string; name: string; description: string; stepCount: number };
type RunCounts = { journeyId: string; active: number; done: number; cancelled: number };
type RuleOption = { id: string; name: string; matchCount: number };
type RunDetail = CustomerJourneyView & { steps: CustomerJourneyStepView[] };

const STATUS: Record<CustomerJourneyStatus, { label: string; badge: string }> = {
  active: { label: "aktiv", badge: "badge-accent" },
  done: { label: "abgeschlossen", badge: "badge-ok" },
  cancelled: { label: "abgebrochen", badge: "" },
};
const STEP_STATUS: Record<CustomerJourneyStepView["status"], { label: string; badge: string }> = {
  open: { label: "offen", badge: "" },
  done: { label: "erledigt", badge: "badge-ok" },
  skipped: { label: "übersprungen", badge: "badge-warn" },
};
const DATA_STATUS: Record<DataStatus, { label: string; badge: string }> = {
  unchecked: { label: "nicht geprüft", badge: "" },
  ok: { label: "OK", badge: "badge-ok" },
  error: { label: "Datenfehler", badge: "badge-danger" },
};

export function CustomerJourneysClient({
  journeys,
  rules,
  initialCounts,
  initialJourneyId,
}: {
  journeys: JourneyOption[];
  rules: RuleOption[];
  initialCounts: RunCounts[];
  initialJourneyId: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(initialJourneyId);
  const [counts, setCounts] = useState<RunCounts[]>(initialCounts);
  const journey = journeys.find((j) => j.id === selected) ?? null;

  const select = (id: string) => {
    setSelected(id);
    // keep the selection in the URL (reload / link)
    window.history.replaceState(null, "", `?journey=${id}`);
  };
  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await api<RunCounts[]>("/api/customer-journeys/summary"));
    } catch {
      // counts are informative only
    }
  }, []);

  return (
    <div className="side-layout">
      <nav className="side-nav" aria-label="Journeys">
        <div className="side-nav-head">KundenJourneys</div>
        {journeys.length === 0 && <p className="small muted">Noch keine Journeys – zuerst unter «Journeys» anlegen.</p>}
        {journeys.map((j) => {
          const c = counts.find((x) => x.journeyId === j.id);
          const total = c ? c.active + c.done + c.cancelled : 0;
          return (
            <button key={j.id} className={`side-nav-item${j.id === selected ? " active" : ""}`} onClick={() => select(j.id)} aria-current={j.id === selected ? "page" : undefined}>
              <span className="side-nav-name">{j.name}</span>
              <span className="side-nav-count" title={c ? `${c.active} aktiv, ${c.done} abgeschlossen, ${c.cancelled} abgebrochen` : "Noch keinem Kunden zugewiesen"}>
                {c?.active ?? 0} / {total}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="side-main">
        {journey ? (
          <JourneyRuns key={journey.id} journey={journey} rules={rules} onCountsChanged={refreshCounts} />
        ) : (
          <section className="card">
            <p className="empty">Links eine Journey wählen.</p>
          </section>
        )}
      </div>
    </div>
  );
}

/** One journey: assign it, and its customers' runs. */
function JourneyRuns({ journey, rules, onCountsChanged }: { journey: JourneyOption; rules: RuleOption[]; onCountsChanged: () => Promise<void> }) {
  const [list, setList] = useState<CustomerJourneyView[] | null>(null);
  const [filter, setFilter] = useState({ status: "active", q: "" });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // bumped after «Daten prüfen» so opened step lists reload
  const [checkVersion, setCheckVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ journeyId: journey.id });
      if (filter.status) params.set("status", filter.status);
      if (filter.q.trim()) params.set("q", filter.q.trim());
      setList(await api<CustomerJourneyView[]>(`/api/customer-journeys?${params}`));
    } catch (err) {
      setError(errorText(err));
    }
  }, [journey.id, filter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };
  const replace = (row: CustomerJourneyView) => setList((l) => l?.map((x) => (x.id === row.id ? { ...x, ...row } : x)) ?? l);

  async function act(fn: () => Promise<unknown>, msg?: string) {
    setError(null);
    setInfo(null);
    try {
      await fn();
      if (msg) setInfo(msg);
      await Promise.all([load(), onCountsChanged()]);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{journey.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {journey.description || "Keine Beschreibung"} · {journey.stepCount} Schritt{journey.stepCount === 1 ? "" : "e"}
          </p>
        </div>
      </div>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{info}</Notice>

      <AssignForm
        journey={journey}
        rules={rules}
        onAssigned={async (msg) => {
          setInfo(msg);
          setError(null);
          await Promise.all([load(), onCountsChanged()]);
        }}
        onError={setError}
      />

      <section className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} style={{ width: "auto" }} aria-label="Status">
            <option value="">Alle Status</option>
            <option value="active">aktiv</option>
            <option value="done">abgeschlossen</option>
            <option value="cancelled">abgebrochen</option>
          </select>
          <input type="search" placeholder="Kunde suchen" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={{ maxWidth: 260 }} />
          <span className="small muted">{list ? `${list.length} KundenJourney${list.length === 1 ? "" : "s"}` : "Lädt …"}</span>
          <button
            className="btn"
            style={{ marginLeft: "auto" }}
            disabled={checking}
            title="Offene Schritte aller aktiven KundenJourneys dieser Journey für ihren Kunden aufbereiten – fehlen Daten, wird der Schritt als «Datenfehler» markiert"
            onClick={async () => {
              setChecking(true);
              setError(null);
              setInfo(null);
              try {
                const r = await api<{ runs: number; steps: number; ok: number; errors: number }>("/api/customer-journeys/check", { body: { journeyId: journey.id } });
                setInfo(
                  r.steps
                    ? `${r.steps} offene Schritte in ${r.runs} aktiven KundenJourneys geprüft: ${r.ok} OK, ${r.errors} mit Datenfehler.`
                    : "Keine offenen Schritte in aktiven KundenJourneys zu prüfen.",
                );
                setCheckVersion((v) => v + 1);
                await load();
              } catch (err) {
                setError(errorText(err));
              } finally {
                setChecking(false);
              }
            }}
          >
            {checking ? "Prüfe Daten …" : "Daten prüfen"}
          </button>
        </div>

        {list && list.length === 0 ? (
          <p className="empty">Keine KundenJourneys{filter.status || filter.q ? " für diesen Filter" : ""}.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 1 }} aria-label="Schritte aufklappen" />
                  <th>Kunde</th>
                  <th>Quelle</th>
                  <th>Fortschritt</th>
                  <th>Status</th>
                  <th>Gestartet</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list?.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td>
                        <button className="btn btn-sm accordion-toggle" onClick={() => toggle(r.id)} aria-expanded={open.has(r.id)}>
                          {open.has(r.id) ? "▾" : "▸"}
                        </button>
                      </td>
                      <td>
                        <Link href={`/customers/${r.customerId}`}>
                          <strong>{r.customerName}</strong>
                        </Link>
                      </td>
                      <td className="small">{r.source.kind === "rule" ? `Selektion «${r.source.ruleName}»` : "einzeln"}</td>
                      <td style={{ minWidth: 140 }}>
                        <Progress p={r.progress} />
                      </td>
                      <td>
                        <span className={`badge ${STATUS[r.status].badge}`}>{STATUS[r.status].label}</span>
                        {r.dataErrors > 0 && (
                          <span className="badge badge-danger" style={{ marginLeft: 4 }} title="Schritte mit fehlenden Daten – aufklappen für Details">
                            Datenfehler {r.dataErrors}
                          </span>
                        )}
                      </td>
                      <td>{formatDate(r.startedAt)}</td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                          {r.status === "cancelled" ? (
                            <button className="btn btn-sm" onClick={() => act(() => api(`/api/customer-journeys/${r.id}`, { method: "PATCH", body: { status: "active" } }), "Reaktiviert.")}>
                              Reaktivieren
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm"
                              onClick={() => {
                                if (window.confirm(`Journey «${r.journeyName}» für ${r.customerName} abbrechen?`))
                                  act(() => api(`/api/customer-journeys/${r.id}`, { method: "PATCH", body: { status: "cancelled" } }), "Abgebrochen.");
                              }}
                            >
                              Abbrechen
                            </button>
                          )}
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              if (window.confirm(`KundenJourney «${r.journeyName}» von ${r.customerName} mit ihrem Fortschritt löschen?`))
                                act(() => api(`/api/customer-journeys/${r.id}`, { method: "DELETE" }), "Gelöscht.");
                            }}
                          >
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open.has(r.id) && (
                      <tr>
                        <td colSpan={7} className="accordion-body">
                          <RunSteps key={checkVersion} runId={r.id} onChange={replace} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Progress({ p }: { p: CustomerJourneyView["progress"] }) {
  const finished = p.done + p.skipped;
  const pct = p.total ? Math.round((finished / p.total) * 100) : 0;
  return (
    <div title={`${p.done} erledigt, ${p.skipped} übersprungen, ${p.total - finished} offen`}>
      <div className="small">
        {finished} / {p.total}
      </div>
      <div className="progress">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** «Journey zuweisen»: a journey to all customers of a Kunden Selektion, or to chosen customers. */
function AssignForm({
  journey,
  rules,
  onAssigned,
  onError,
}: {
  journey: JourneyOption;
  rules: RuleOption[];
  onAssigned: (msg: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const journeyId = journey.id;
  const [target, setTarget] = useState<"rule" | "customers">(rules.length ? "rule" : "customers");
  const [ruleId, setRuleId] = useState(rules[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Customer[]>([]);
  const [chosen, setChosen] = useState<Customer[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target !== "customers" || q.trim().length < 2) return;
    const t = setTimeout(() => {
      api<Customer[]>(`/api/customers?${new URLSearchParams({ q, limit: "20" })}`)
        .then(setFound)
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, target]);

  // results only for a search of at least 2 characters
  const shown = target === "customers" && q.trim().length >= 2 ? found : [];
  const rule = rules.find((r) => r.id === ruleId);
  const count = target === "rule" ? (rule?.matchCount ?? 0) : chosen.length;

  if (!journey.stepCount) {
    return (
      <section className="card">
        <p className="empty">Diese Journey hat noch keine Schritte – zuerst unter «Journeys» Schritte anlegen, dann zuweisen.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Kunden zuweisen</h2>
      <div className="grid2">
        <div className="field">
          <span>Für</span>
          <div className="row" style={{ gap: 16, paddingTop: 6 }}>
            <label className="check" style={{ marginBottom: 0 }}>
              <input type="radio" checked={target === "rule"} onChange={() => setTarget("rule")} disabled={!rules.length} />
              <span>Kunden Selektion</span>
            </label>
            <label className="check" style={{ marginBottom: 0 }}>
              <input type="radio" checked={target === "customers"} onChange={() => setTarget("customers")} />
              <span>einzelne Kunden</span>
            </label>
          </div>
        </div>
      </div>

      {target === "rule" ? (
        <label className="field" style={{ maxWidth: 520 }}>
          <span>Kunden Selektion</span>
          <select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.matchCount} Kunden)
              </option>
            ))}
          </select>
          <span className="hint">Alle Kunden, die die Selektion jetzt erfüllen. Wer die Journey bereits aktiv hat, wird übersprungen.</span>
        </label>
      ) : (
        <div className="field">
          <span>Kunden</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name suchen (ab 2 Zeichen)" style={{ maxWidth: 320 }} />
          {shown.length > 0 && (
            <div className="tags" style={{ marginTop: 6 }}>
              {shown
                .filter((c) => !chosen.some((x) => x.id === c.id))
                .map((c) => (
                  <button key={c.id} type="button" className="badge ph-chip" onClick={() => setChosen([...chosen, c])}>
                    + {c.lastname} {c.name}
                  </button>
                ))}
            </div>
          )}
          {chosen.length > 0 && (
            <div className="tags" style={{ marginTop: 8 }}>
              {chosen.map((c) => (
                <button key={c.id} type="button" className="badge badge-accent ph-chip" title="Entfernen" onClick={() => setChosen(chosen.filter((x) => x.id !== c.id))}>
                  {c.lastname} {c.name} ✕
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button
          className="btn btn-primary"
          disabled={busy || !journeyId || !count}
          onClick={async () => {
            setBusy(true);
            onError(null);
            try {
              const body = target === "rule" ? { journeyId, ruleId } : { journeyId, customerIds: chosen.map((c) => c.id) };
              const r = await api<{ created: number; skipped: number; matched: number }>("/api/customer-journeys", { body });
              setChosen([]);
              await onAssigned(`${r.created} Kunden zugewiesen${r.skipped ? `, ${r.skipped} übersprungen (Journey bereits aktiv)` : ""}.`);
            } catch (err) {
              onError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Weise zu …" : `Zuweisen (${count} Kunden)`}
        </button>
      </div>
    </section>
  );
}

/** The steps of one run: status buttons, rendered content (done) or the template. */
function RunSteps({ runId, onChange }: { runId: string; onChange: (row: CustomerJourneyView) => void }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<CustomerJourneyStepView | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<{ step: CustomerJourneyStepView; feedback: CustomerFeedbackView | null } | null>(null);

  const reload = useCallback(async () => {
    try {
      setRun(await api<RunDetail>(`/api/customer-journeys/${runId}`));
    } catch (err) {
      setError(errorText(err));
    }
  }, [runId]);

  useEffect(() => {
    const t = setTimeout(reload, 0);
    return () => clearTimeout(t);
  }, [reload]);

  async function deleteFeedback(step: CustomerJourneyStepView, f: CustomerFeedbackView) {
    if (!window.confirm(`Feedback «${f.feedback}» löschen?`)) return;
    setError(null);
    try {
      await api(`/api/customer-journeys/${runId}/steps/${step.id}/feedbacks/${f.id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function setStatus(stepId: string, status: CustomerJourneyStepView["status"]) {
    setBusy(stepId);
    setError(null);
    try {
      const next = await api<RunDetail>(`/api/customer-journeys/${runId}/steps/${stepId}`, { method: "PATCH", body: { status } });
      setRun(next);
      onChange(next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  if (error && !run) return <Notice kind="error">{error}</Notice>;
  if (!run) return <p className="small muted">Lädt …</p>;
  const locked = run.status === "cancelled";

  return (
    <div>
      <h4 style={{ margin: "0 0 8px" }}>
        Schritte <span className="count-badge">{run.steps.length}</span>
        {locked && <span className="small muted"> – abgebrochen, zuerst reaktivieren</span>}
      </h4>
      <Notice kind="error">{error}</Notice>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Aktion</th>
              <th>Status</th>
              <th>Daten</th>
              <th>Inhalt</th>
              <th>Feedback</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {run.steps.map((s, i) => (
              <tr key={s.id}>
                <td className="num muted">{i + 1}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <strong>{s.actionName}</strong>
                </td>
                <td>
                  <span className={`badge ${STEP_STATUS[s.status].badge}`}>{STEP_STATUS[s.status].label}</span>
                  {s.doneAt && <div className="small muted">{formatDate(s.doneAt, true)}</div>}
                </td>
                <td className="small" style={{ maxWidth: 260 }}>
                  <span className={`badge ${DATA_STATUS[s.dataStatus].badge}`} title={s.dataCheckedAt ? `geprüft ${formatDate(s.dataCheckedAt, true)}` : undefined}>
                    {DATA_STATUS[s.dataStatus].label}
                  </span>
                  {s.dataStatus === "error" && s.dataProblems.length > 0 && (
                    <ul style={{ margin: "4px 0 0", paddingLeft: 16, color: "var(--danger)" }}>
                      {s.dataProblems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="small" style={{ maxWidth: 560 }}>
                  {s.status === "done" && s.content !== null ? (
                    <>
                      <div className="step-preview" style={{ maxHeight: 180, marginBottom: 4 }}>
                        {s.content || <span className="muted">(leer)</span>}
                      </div>
                      {s.unfilled.length > 0 && <div style={{ color: "var(--warn)" }}>Ohne Wert: {s.unfilled.join(", ")}</div>}
                    </>
                  ) : s.template ? (
                    <details>
                      <summary className="muted">Vorlage</summary>
                      <div className="step-preview" style={{ maxHeight: 180 }}>
                        {s.template}
                      </div>
                    </details>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
                <td className="small" style={{ minWidth: 200, maxWidth: 320 }}>
                  {s.feedbacks.map((f) => (
                    <div key={f.id} className="feedback">
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap", alignItems: "baseline" }}>
                        {f.feedbackRating !== null && (
                          <span className="rating" title={`Bewertung ${f.feedbackRating} von 5`}>
                            {"★".repeat(f.feedbackRating)}
                            <span className="muted">{"★".repeat(5 - f.feedbackRating)}</span>
                          </span>
                        )}
                        <strong className="grow">{f.feedback}</strong>
                        <button className="btn-link" onClick={() => setFeedbackFor({ step: s, feedback: f })} title="Bearbeiten">
                          ✎
                        </button>
                        <button className="btn-link" onClick={() => deleteFeedback(s, f)} title="Löschen">
                          ✕
                        </button>
                      </div>
                      {f.feedbackComment && <div className="muted" style={{ whiteSpace: "pre-wrap" }}>{f.feedbackComment}</div>}
                      <div className="muted" style={{ fontSize: 11 }}>{formatDate(f.createdAt, true)}</div>
                    </div>
                  ))}
                  <button className="btn btn-sm" onClick={() => setFeedbackFor({ step: s, feedback: null })}>
                    + Feedback
                  </button>
                </td>
                <td>
                  <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                    <button className="btn btn-sm" onClick={() => setTesting(s)} title="Inhalt für diesen Kunden aufbereiten, ohne den Schritt zu ändern">
                      Testen
                    </button>
                    {s.status === "open" ? (
                      <>
                        <button className="btn btn-sm btn-primary" disabled={!!busy || locked} onClick={() => setStatus(s.id, "done")} title="Inhalt für den Kunden aufbereiten und als erledigt markieren">
                          {busy === s.id ? "…" : "Erledigt"}
                        </button>
                        <button className="btn btn-sm" disabled={!!busy || locked} onClick={() => setStatus(s.id, "skipped")}>
                          Überspringen
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-sm" disabled={!!busy || locked} onClick={() => setStatus(s.id, "open")}>
                        Wieder öffnen
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {testing && <RunStepTestModal runId={runId} customerName={run.customerName} step={testing} onClose={() => setTesting(null)} />}
      {feedbackFor && (
        <FeedbackModal
          runId={runId}
          customerName={run.customerName}
          step={feedbackFor.step}
          feedback={feedbackFor.feedback}
          onClose={() => setFeedbackFor(null)}
          onSaved={async () => {
            setFeedbackFor(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

/** «Testen» of a step for the run's customer: renders the content, changes nothing. */
function RunStepTestModal({ runId, customerName, step, onClose }: { runId: string; customerName: string; step: CustomerJourneyStepView; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setPreview(await api<Preview>(`/api/customer-journeys/${runId}/steps/${step.id}/test`, { method: "POST" }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [runId, step.id]);

  useEffect(() => {
    const t = setTimeout(run, 0);
    return () => clearTimeout(t);
  }, [run]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal-wide" style={{ maxWidth: 980 }} onClick={(e) => e.stopPropagation()}>
        <h2>
          Schritt testen – {step.actionName} für {customerName}
        </h2>
        <p className="small muted">Der Inhalt wird mit den aktuellen Daten des Kunden aufbereitet und verwendete Services werden aufgerufen. Der Schritt bleibt unverändert.</p>
        <Notice kind="error">{error}</Notice>
        {busy && !preview && <p className="small muted">Teste …</p>}
        {preview && <StepPreviewResult preview={preview} />}
        <div className="actions">
          <button className="btn" disabled={busy} onClick={run}>
            {busy ? "Teste …" : "Erneut testen"}
          </button>
          <button className="btn" onClick={onClose}>
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}

/** Add / edit a customer's feedback on a step (relation customerFeedback). */
function FeedbackModal({
  runId,
  customerName,
  step,
  feedback,
  onClose,
  onSaved,
}: {
  runId: string;
  customerName: string;
  step: CustomerJourneyStepView;
  feedback: CustomerFeedbackView | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    feedback: feedback?.feedback ?? "",
    feedbackComment: feedback?.feedbackComment ?? "",
    feedbackRating: feedback?.feedbackRating ?? null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const base = `/api/customer-journeys/${runId}/steps/${step.id}/feedbacks`;
      if (feedback) await api(`${base}/${feedback.id}`, { method: "PUT", body: form });
      else await api(base, { body: form });
      await onSaved();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>
          {feedback ? "Feedback bearbeiten" : "Feedback erfassen"} – {step.actionName}
        </h2>
        <p className="small muted">Rückmeldung von {customerName} zu diesem Schritt.</p>
        <Notice kind="error">{error}</Notice>
        <label className="field">
          <span>Feedback</span>
          <input value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} maxLength={200} required autoFocus placeholder="z. B. interessiert, Termin gewünscht" />
        </label>
        <div className="field">
          <span>Bewertung</span>
          <div className="row" style={{ gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`btn btn-sm${form.feedbackRating !== null && n <= form.feedbackRating ? " btn-primary" : ""}`}
                onClick={() => setForm({ ...form, feedbackRating: form.feedbackRating === n ? null : n })}
                aria-pressed={form.feedbackRating === n}
                title={`${n} von 5`}
              >
                ★ {n}
              </button>
            ))}
            <span className="small muted">{form.feedbackRating === null ? "keine Bewertung" : `${form.feedbackRating} von 5 – nochmals klicken zum Entfernen`}</span>
          </div>
        </div>
        <label className="field">
          <span>Kommentar</span>
          <textarea rows={4} value={form.feedbackComment} onChange={(e) => setForm({ ...form, feedbackComment: e.target.value })} maxLength={2000} />
        </label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={busy || !form.feedback.trim()}>
            {busy ? "Speichere …" : "Speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}
