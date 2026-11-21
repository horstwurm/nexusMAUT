"use client";

import { useState, type ReactNode } from "react";

export type AdminTab = { id: string; label: string; count?: number; content: ReactNode };

/** Tabs for the admin panels; the active one is kept in the URL (?tab=…). */
export function AdminTabs({ tabs, initial }: { tabs: AdminTab[]; initial: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.id === initial) ? initial : tabs[0].id);
  const select = (id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  };
  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={active === t.id} className={active === t.id ? "active" : ""} onClick={() => select(t.id)}>
            {t.label}
            {t.count !== undefined && <span className="count-badge">{t.count}</span>}
          </button>
        ))}
      </div>
      {/* all panels stay mounted, so unsaved input survives switching tabs */}
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id}>
          {t.content}
        </div>
      ))}
    </>
  );
}
