"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import { LOG_ACTIONS, type LogAction, type LogList } from "@/lib/logfile";

const PAGE = 100;
const ACTION_BADGE: Partial<Record<LogAction, string>> = { created: "badge-ok", deleted: "badge-danger", executed: "badge-accent", started: "badge-accent", uploaded: "badge-accent" };

type Filter = { area: string; user: string; action: string; from: string; to: string; q: string };
const EMPTY: Filter = { area: "", user: "", action: "", from: "", to: "", q: "" };

/**
 * Admin tab «Logfile» (like the change log of nexusEAM): every change made in the app –
 * who, when, which record, created / changed (field: old → new) / deleted, and actions
 * like «Ausführen» or uploads. Newest first, filters, «Mehr anzeigen».
 */
export function LogfileAdmin() {
  const [filter, setFilter] = useState<Filter>(EMPTY);
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<LogList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) });
      setData(await api<LogList>(`/api/logfile?${params}`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [filter, limit]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const set = (k: keyof Filter) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilter({ ...filter, [k]: e.target.value });
    setLimit(PAGE);
  };
  const filtered = Object.values(filter).some(Boolean);

  return (
    <section className="card">
      <h2>Logfile</h2>
      <p className="small muted">
        Jede Änderung in nexusMAUT – Kunden, Positionen, Transaktionen, Journeys, Aktionen, Services, Events, Textbausteine, Einstellungen –
        mit wer, wann, was: angelegt, geändert (Feld: vorher → nachher) oder gelöscht, dazu Aktionen wie «Ausführen», «Daten prüfen» oder Uploads.
        Passwörter und Schlüssel erscheinen nie, nur dass sie geändert wurden. Nur für Admins.
      </p>
      <Notice kind="error">{error}</Notice>

      <div className="row" style={{ gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
        <label className="field" style={{ margin: 0 }}>
          <span>Bereich</span>
          <select value={filter.area} onChange={set("area")} style={{ width: "auto" }}>
            <option value="">Alle Bereiche</option>
            {data?.options.areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span>Benutzer</span>
          <select value={filter.user} onChange={set("user")} style={{ width: "auto" }}>
            <option value="">Alle Benutzer</option>
            {data?.options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span>Aktion</span>
          <select value={filter.action} onChange={set("action")} style={{ width: "auto" }}>
            <option value="">Alle Aktionen</option>
            {(Object.keys(LOG_ACTIONS) as LogAction[]).map((a) => (
              <option key={a} value={a}>
                {LOG_ACTIONS[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span>Von</span>
          <input type="date" value={filter.from} onChange={set("from")} />
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span>Bis</span>
          <input type="date" value={filter.to} onChange={set("to")} />
        </label>
        <label className="field" style={{ margin: 0, flex: "1 1 180px" }}>
          <span>Objekt</span>
          <input type="search" value={filter.q} onChange={set("q")} placeholder="Name enthält …" />
        </label>
        {filtered && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setFilter(EMPTY);
              setLimit(PAGE);
            }}
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      {data && !data.entries.length ? (
        <p className="empty">{filtered ? "Keine Einträge für diesen Filter." : "Noch keine Einträge."}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Benutzer</th>
                <th>Bereich</th>
                <th>Objekt</th>
                <th>Aktion</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data?.entries.map((e) => (
                <tr key={e.id}>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>
                    {formatDate(e.at, true)}
                  </td>
                  <td className="small" title={e.userEmail}>
                    {e.userName}
                  </td>
                  <td className="small">{e.area}</td>
                  <td className="small" style={{ maxWidth: 260, overflowWrap: "anywhere" }}>
                    {e.link && e.action !== "deleted" ? <Link href={e.link}>{e.entityName}</Link> : <strong>{e.entityName}</strong>}
                  </td>
                  <td>
                    <span className={`badge ${ACTION_BADGE[e.action as LogAction] ?? ""}`}>{LOG_ACTIONS[e.action as LogAction] ?? e.action}</span>
                  </td>
                  <td className="small" style={{ maxWidth: 520 }}>
                    {e.changes.length > 0 && (
                      <ul className="log-changes">
                        {e.changes.map((c, i) => (
                          <li key={i}>
                            <strong>{c.field}:</strong> {c.from ? <span className="log-from">{c.from}</span> : <span className="muted">(leer)</span>} →{" "}
                            {c.to ? <span className="log-to">{c.to}</span> : <span className="muted">(leer)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {e.note && <div className="muted">{e.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.more && (
        <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={() => setLimit(limit + PAGE)}>
            {busy ? "Lädt …" : "Mehr anzeigen"}
          </button>
        </div>
      )}
    </section>
  );
}
