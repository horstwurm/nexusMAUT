"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { ATTRIBUTE_TYPES } from "@/lib/typeAttributes";
import type { TypeAttribute } from "@/lib/types";
import { AttributesModal } from "./TypeAttributesModal";

/** Admin card for the customer attributes (relation customerAttributes). */
export function CustomerAttributesAdmin({ initial }: { initial: TypeAttribute[] }) {
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>
            Kundenattribute <span className="count-badge">{list.length}</span>
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            Angaben, die jeder Kunde haben kann, z.B. Segment (Auswahlliste) oder Newsletter (Ja/Nein). Werte im Kundenformular, nutzbar in
            Kunden Selektionen.
          </p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
          Kundenattribute verwalten
        </button>
      </div>
      {list.length === 0 ? (
        <p className="empty">Noch keine Kundenattribute.</p>
      ) : (
        <div className="tags">
          {list.map((a) => (
            <span key={a.id} className="badge" title={a.options.join(", ") || undefined}>
              {a.attribute} · {ATTRIBUTE_TYPES[a.attributeType]}
            </span>
          ))}
        </div>
      )}
      {open && (
        <AttributesModal
          base="/api/customer-attributes"
          title="Kundenattribute"
          hint="Gelten für alle Kunden. Wird ein Attribut gelöscht, verschwinden seine Werte bei allen Kunden."
          newLabel="Neues Kundenattribut"
          fallbackCount={list.length}
          onClose={async () => {
            setOpen(false);
            setList(await api<TypeAttribute[]>("/api/customer-attributes"));
          }}
        />
      )}
    </section>
  );
}
