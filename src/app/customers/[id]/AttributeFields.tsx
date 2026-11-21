"use client";

import type { AttributeDef, PositionValue } from "@/lib/positions";

// Inputs for attribute values (positions and transactions), one per attribute
// type. Form state per attribute id: text inputs keep strings, bool keeps
// true / false / null (empty); the server parses and checks them.

export type FormValue = string | boolean | null;

function toForm(def: AttributeDef, v: PositionValue | undefined): FormValue {
  if (v === undefined) return def.attributeType === "bool" ? null : "";
  if (def.attributeType === "bool") return typeof v === "boolean" ? v : null;
  return String(v);
}

/** Initial form state for these attributes from stored values. */
export const formValues = (defs: AttributeDef[], values: Record<string, PositionValue>) =>
  Object.fromEntries(defs.map((d) => [d.id, toForm(d, values[d.id])])) as Record<string, FormValue>;

export function AttributeFields({
  defs,
  values,
  onChange,
}: {
  defs: AttributeDef[];
  values: Record<string, FormValue>;
  onChange: (values: Record<string, FormValue>) => void;
}) {
  const set = (id: string, v: FormValue) => onChange({ ...values, [id]: v });
  return (
    <>
      {defs.map((d) => {
        const v = values[d.id];
        return (
          <label key={d.id} className="field">
            <span>{d.attribute}</span>
            {d.attributeType === "alpha" && (
              <input type="text" maxLength={500} value={(v as string) ?? ""} onChange={(e) => set(d.id, e.target.value)} />
            )}
            {d.attributeType === "num" && (
              <input
                type="text"
                inputMode="decimal"
                value={(v as string) ?? ""}
                onChange={(e) => set(d.id, e.target.value)}
                placeholder="z.B. 12 oder 1'250.50"
              />
            )}
            {d.attributeType === "date" && (
              <input type="date" value={(v as string) ?? ""} onChange={(e) => set(d.id, e.target.value)} style={{ maxWidth: 220 }} />
            )}
            {d.attributeType === "bool" && (
              <select
                value={v === null || v === undefined ? "" : v ? "1" : "0"}
                onChange={(e) => set(d.id, e.target.value === "" ? null : e.target.value === "1")}
                style={{ maxWidth: 220 }}
              >
                <option value="">–</option>
                <option value="1">Ja</option>
                <option value="0">Nein</option>
              </select>
            )}
            {d.attributeType === "list" && (
              <select value={(v as string) ?? ""} onChange={(e) => set(d.id, e.target.value)}>
                <option value="">–</option>
                {/* a value no longer among the options stays selectable until changed */}
                {typeof v === "string" && v && !d.options.includes(v) && <option value={v}>{v} (nicht mehr in der Liste)</option>}
                {d.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
          </label>
        );
      })}
    </>
  );
}
