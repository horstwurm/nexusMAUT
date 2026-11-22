"use client";

import { formatValue, type AttributeDef, type PositionValue } from "@/lib/positions";
import type { ServiceFetchedView } from "@/lib/types";

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

/** A form value back as a stored value (for the read-only display of «Service» attributes). */
const shown = (d: AttributeDef, v: FormValue | undefined): string => {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  return formatValue(d, d.attributeType === "num" && !Number.isNaN(Number(v)) ? Number(v) : v);
};

export function AttributeFields({
  defs,
  values,
  onChange,
  fetched,
}: {
  defs: AttributeDef[];
  values: Record<string, FormValue>;
  onChange: (values: Record<string, FormValue>) => void;
  /** when «Service» attribute values were fetched (record's serviceFetched) */
  fetched?: ServiceFetchedView;
}) {
  const set = (id: string, v: FormValue) => onChange({ ...values, [id]: v });
  return (
    <>
      {defs.map((d) => {
        const v = values[d.id];
        if (d.service) {
          // value from a service: read-only, fetched again when the record is saved
          const f = fetched?.[d.id];
          return (
            <div key={d.id} className="field">
              <span>{d.attribute}</span>
              <div className="service-value">
                <strong>{shown(d, v)}</strong>
                {v !== null && v !== undefined && v !== "" && f && (
                  f.mock ? <span className="svc-tag svc-tag-mock">Mock</span> : <span className="svc-tag svc-tag-real">echt</span>
                )}
                <span className="small muted">
                  {" "}
                  · Service «{d.service.serviceName}» › {d.service.attrName}
                  {f ? ` · abgerufen ${new Date(f.at).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}` : " · noch nie abgerufen"}
                </span>
                {f?.error && <div className="small" style={{ color: "var(--warn)" }}>{f.error}</div>}
              </div>
              <span className="hint">Wird beim Speichern neu vom Service geholt.</span>
            </div>
          );
        }
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

// --- table cells ------------------------------------------------------------------------

/** Column header of an attribute; «Service» attributes marked (⚡ + source as tooltip). */
export function AttrHeader({ def }: { def: AttributeDef }) {
  return (
    <th className={def.attributeType === "num" ? "num" : ""}>
      {def.attribute}
      {def.service && (
        <span className="svc-mark" title={`Wert vom Service «${def.service.serviceName}» › ${def.service.attrName}`} aria-label="Wert von einem Service">
          {" "}
          ⚡
        </span>
      )}
    </th>
  );
}

/** Table cell of a stored value; for «Service» attributes styled, with fetch time / error as tooltip. */
export function AttrCell({ def, value, fetched }: { def: AttributeDef; value: PositionValue | undefined; fetched?: ServiceFetchedView }) {
  const cls = def.attributeType === "num" ? "num" : "";
  if (!def.service) return <td className={cls}>{formatValue(def, value)}</td>;
  const f = fetched?.[def.id];
  const when = f ? `abgerufen ${new Date(f.at).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}` : "noch nie abgerufen";
  const has = value !== undefined && value !== "";
  const mock = has && f?.mock;
  const kind = !has ? "" : mock ? "Mock-Wert (Zufallswert, nicht vom Service)" : "echter Wert vom Service";
  return (
    <td
      className={`${cls} svc-cell${mock ? " svc-mock" : ""}`}
      title={`Service «${def.service.serviceName}» › ${def.service.attrName}${kind ? ` · ${kind}` : ""} · ${when}${f?.error ? ` · ${f.error}` : ""}`}
    >
      {formatValue(def, value)}
      {has && (mock ? <span className="svc-tag svc-tag-mock">Mock</span> : <span className="svc-tag svc-tag-real">echt</span>)}
      {f?.error && <span className="svc-warn"> ⚠</span>}
    </td>
  );
}
