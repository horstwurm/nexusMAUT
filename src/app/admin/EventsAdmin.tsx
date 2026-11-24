"use client";

import { useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import { TRIGGER_SERVICE_TYPE, UPDATE_FREQUENCIES, UPDATE_FREQUENCY_LABELS, type UpdateFrequency } from "@/lib/events";
import type { EventView, JourneyView, ServiceView } from "@/lib/types";

type Draft = { id: string | null; name: string; description: string; serviceId: string; updateFrequency: UpdateFrequency; journeyId: string };

/** Admin tab «Events»: name, description, the trigger service that reports the event, how often it is asked and its journey. */
export function EventsAdmin({
  initial,
  services: initialServices,
  journeys: initialJourneys,
  timerOn,
}: {
  initial: EventView[];
  services: ServiceView[];
  journeys: JourneyView[];
  /** the background timer runs (EVENT_TIMER=on) */
  timerOn: boolean;
}) {
  const [list, setList] = useState(initial);
  const [services, setServices] = useState(initialServices);
  const [journeys, setJourneys] = useState(initialJourneys);
  const triggers = services.filter((s) => s.serviceType === TRIGGER_SERVICE_TYPE);
  const empty = (): Draft => ({ id: null, name: "", description: "", serviceId: triggers[0]?.id ?? "", updateFrequency: "daily", journeyId: "" });
  const [draft, setDraft] = useState<Draft>(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      const [events, svc, jrn] = await Promise.all([
        api<EventView[]>("/api/events"),
        api<ServiceView[]>("/api/services"),
        api<JourneyView[]>("/api/journeys"),
      ]);
      setList(events);
      setServices(svc);
      setJourneys(jrn);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** the trigger services, plus the event's current service when it isn't one any more */
  const choices = [...triggers];
  const current = list.find((e) => e.id === draft.id);
  if (current && !current.serviceIsTrigger && current.serviceName && !choices.some((s) => s.id === current.serviceId))
    choices.push({ ...services.find((s) => s.id === current.serviceId)!, name: `${current.serviceName} (kein Trigger-Service mehr)` });

  return (
    <section className="card">
      <h2>
        Events <span className="count-badge">{list.length}</span>
      </h2>
      <p className="small muted">
        Ereignisse bei Kunden, z.B. «Hypothek läuft ab» oder «Grosse Einzahlung». Ein Event wird von einem Trigger-Service gemeldet (Servicetyp
        «{TRIGGER_SERVICE_TYPE}»); die Aktualisierung legt fest, wie oft ein Zeitgeber im Hintergrund den Service abfragt (gerechnet ab dem letzten
        Aufruf; «Manuell» = nur mit «Service jetzt aufrufen» unter KundenJourneys → Events). {timerOn ? "Der Zeitgeber läuft." : "Der Zeitgeber ist zurzeit ausgeschaltet."}
      </p>
      <Notice kind="error">{error}</Notice>
      {!triggers.length && (
        <Notice kind="warn">
          Es gibt noch keinen Trigger-Service. Zuerst unter <a href="/admin?tab=services">Services</a> einen Service mit dem Servicetyp «
          {TRIGGER_SERVICE_TYPE}» anlegen.
        </Notice>
      )}

      {!journeys.length && (
        <Notice kind="warn">
          Es gibt noch keine Journey. Zuerst unter <a href="/journeys">Journeys</a> eine anlegen.
        </Notice>
      )}

      {list.length === 0 ? (
        <p className="empty">Noch keine Events.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Beschreibung</th>
                <th>Trigger-Service</th>
                <th>Aktualisierung</th>
                <th>Journey</th>
                <th>Geändert</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                  </td>
                  <td className="small" style={{ whiteSpace: "pre-wrap" }}>
                    {e.description || <span className="muted">–</span>}
                  </td>
                  <td>
                    {e.serviceName ?? <span className="badge badge-danger">Service fehlt</span>}
                    {e.serviceName && !e.serviceIsTrigger && (
                      <>
                        {" "}
                        <span className="badge badge-warn" title={`Der Service hat nicht mehr den Servicetyp «${TRIGGER_SERVICE_TYPE}»`}>
                          kein Trigger
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-accent">{UPDATE_FREQUENCY_LABELS[e.updateFrequency] ?? e.updateFrequency}</span>
                  </td>
                  <td>{e.journeyName ?? <span className={e.journeyId ? "badge badge-danger" : "muted"}>{e.journeyId ? "Journey fehlt" : "–"}</span>}</td>
                  <td>{formatDate(e.updatedAt)}</td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 4 }}>
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          setDraft({
                            id: e.id,
                            name: e.name,
                            description: e.description,
                            serviceId: e.serviceId,
                            updateFrequency: e.updateFrequency,
                            journeyId: e.journeyName ? (e.journeyId ?? "") : "",
                          })
                        }
                      >
                        Bearbeiten
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Event «${e.name}» löschen?`)) act(() => api(`/api/events/${e.id}`, { method: "DELETE" }));
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
        onSubmit={async (ev) => {
          ev.preventDefault();
          const body = {
            name: draft.name,
            description: draft.description,
            serviceId: draft.serviceId,
            updateFrequency: draft.updateFrequency,
            journeyId: draft.journeyId,
          };
          const ok = await act(() => api(draft.id ? `/api/events/${draft.id}` : "/api/events", { method: draft.id ? "PUT" : "POST", body }));
          if (ok) setDraft(empty());
        }}
      >
        <h3>{draft.id ? "Event bearbeiten" : "Neues Event"}</h3>
        <label className="field">
          <span>Name</span>
          <input type="text" required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Beschreibung</span>
          <textarea rows={3} maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </label>
        <label className="field">
          <span>Trigger-Service</span>
          <select required value={draft.serviceId} onChange={(e) => setDraft({ ...draft, serviceId: e.target.value })}>
            {!choices.some((s) => s.id === draft.serviceId) && <option value="">– wählen –</option>}
            {choices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Aktualisierung</span>
          <select value={draft.updateFrequency} onChange={(e) => setDraft({ ...draft, updateFrequency: e.target.value as UpdateFrequency })}>
            {UPDATE_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {UPDATE_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Journey</span>
          <select required value={draft.journeyId} onChange={(e) => setDraft({ ...draft, journeyId: e.target.value })}>
            <option value="">– wählen –</option>
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {draft.id && (
            <button type="button" className="btn" onClick={() => setDraft(empty())}>
              Abbrechen
            </button>
          )}
          <button className="btn btn-primary" disabled={busy || !draft.name.trim() || !draft.serviceId || !draft.journeyId}>
            {draft.id ? "Speichern" : "Hinzufügen"}
          </button>
        </div>
      </form>
    </section>
  );
}
