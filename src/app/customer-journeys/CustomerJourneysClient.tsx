"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import type { Customer, CustomerJourneyStatus, CustomerJourneyStepView, CustomerJourneyView } from "@/lib/types";

type JourneyOption = { id: string; name: string; stepCount: number };
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

export function CustomerJourneysClient({ journeys, rules }: { journeys: JourneyOption[]; rules: RuleOption[] }) {
  const [list, setList] = useState<CustomerJourneyView[] | null>(null);
  const [filter, setFilter] = useState({ journeyId: "", status: "active", q: "" });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]);
      setList(await api<CustomerJourneyView[]>(`/api/customer-journeys?${params}`));
    } catch (err) {
      setError(errorText(err));
    }
  }, [filter]);

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
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{info}</Notice>

      <AssignForm
        journeys={journeys}
        rules={rules}
        onAssigned={async (msg) => {
          setInfo(msg);
          setError(null);
          await load();
        }}
        onError={setError}
      />

      <section className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <select value={filter.journeyId} onChange={(e) => setFilter({ ...filter, journeyId: e.target.value })} style={{ width: "auto" }} aria-label="Journey">
            <option value="">Alle Journeys</option>
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} style={{ width: "auto" }} aria-label="Status">
            <option value="">Alle Status</option>
            <option value="active">aktiv</option>
            <option value="done">abgeschlossen</option>
            <option value="cancelled">abgebrochen</option>
          </select>
          <input type="search" placeholder="Kunde suchen" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={{ maxWidth: 260 }} />
          <span className="small muted">{list ? `${list.length} KundenJourney${list.length === 1 ? "" : "s"}` : "Lädt …"}</span>
        </div>

        {list && list.length === 0 ? (
          <p className="empty">Keine KundenJourneys{filter.status || filter.journeyId || filter.q ? " für diesen Filter" : ""}.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 1 }} aria-label="Schritte aufklappen" />
                  <th>Kunde</th>
                  <th>Journey</th>
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
                      <td>{r.journeyName}</td>
                      <td className="small">{r.source.kind === "rule" ? `Selektion «${r.source.ruleName}»` : "einzeln"}</td>
                      <td style={{ minWidth: 140 }}>
                        <Progress p={r.progress} />
                      </td>
                      <td>
                        <span className={`badge ${STATUS[r.status].badge}`}>{STATUS[r.status].label}</span>
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
                        <td colSpan={8} className="accordion-body">
                          <RunSteps runId={r.id} onChange={replace} />
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
  journeys,
  rules,
  onAssigned,
  onError,
}: {
  journeys: JourneyOption[];
  rules: RuleOption[];
  onAssigned: (msg: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const usable = journeys.filter((j) => j.stepCount > 0);
  const [journeyId, setJourneyId] = useState(usable[0]?.id ?? "");
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

  if (!journeys.length) {
    return (
      <section className="card">
        <p className="empty">Noch keine Journeys – zuerst unter «Journeys» eine mit Schritten anlegen.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Journey zuweisen</h2>
      <div className="grid2">
        <label className="field">
          <span>Journey</span>
          <select value={journeyId} onChange={(e) => setJourneyId(e.target.value)}>
            {journeys.map((j) => (
              <option key={j.id} value={j.id} disabled={!j.stepCount}>
                {j.name} ({j.stepCount} Schritt{j.stepCount === 1 ? "" : "e"}){!j.stepCount ? " – ohne Schritte" : ""}
              </option>
            ))}
          </select>
        </label>
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

  useEffect(() => {
    api<RunDetail>(`/api/customer-journeys/${runId}`)
      .then(setRun)
      .catch((err) => setError(errorText(err)));
  }, [runId]);

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
              <th>Inhalt</th>
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
                <td>
                  <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
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
    </div>
  );
}
