"use client";

import { useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import type { Me, UserRow as Row } from "@/lib/types";

const ROLES: { value: Me["role"]; label: string }[] = [
  { value: "pending", label: "Kein Zugang" },
  { value: "editor", label: "Redaktion" },
  { value: "admin", label: "Admin" },
];

export function UsersClient({ meId, initial }: { meId: string; initial: Row[] }) {
  const [list, setList] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function setRole(u: Row, role: Me["role"]) {
    setError(null);
    try {
      await api(`/api/users/${encodeURIComponent(u.id)}`, { method: "PATCH", body: { role } });
      setList(list.map((x) => (x.id === u.id ? { ...x, role } : x)));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(u: Row) {
    if (!window.confirm(`${u.email} entfernen? Bei einer erneuten Anmeldung über nexusIdentity erscheint die Person wieder ohne Zugang; ein eigenes Konto (Passwort) ist gelöscht.`)) return;
    setError(null);
    try {
      await api(`/api/users/${encodeURIComponent(u.id)}`, { method: "DELETE" });
      setList(list.filter((x) => x.id !== u.id));
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <section className="card">
      <Notice kind="error">{error}</Notice>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Anmeldung</th>
              <th>Zuletzt angemeldet</th>
              <th>Rolle</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name}
                  <div className="small muted">{u.email}</div>
                </td>
                <td>
                  <span className="row" style={{ gap: 4 }}>
                    {u.nexusIdentity && <span className="badge">nexusIdentity</span>}
                    {u.hasPassword && <span className="badge">Passwort</span>}
                  </span>
                </td>
                <td>{formatDate(u.lastLoginAt, true)}</td>
                <td>
                  <select value={u.role} disabled={u.id === meId} onChange={(e) => setRole(u, e.target.value as Me["role"])} style={{ width: "auto" }}>
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  {u.id !== meId && (
                    <button className="btn btn-sm btn-danger" onClick={() => remove(u)}>
                      Entfernen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
