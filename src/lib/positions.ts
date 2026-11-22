// Positions of a customer's product/service: one value per attribute of the
// product's type (productServiceTypePositionAttributes). Values are stored by
// attribute id, typed: alpha/list/date → string, num → number, bool → boolean.
// Shared by server (validation) and pages (inputs, display).

import type { AttributeType } from "./typeAttributes";

/** A «Service» attribute's source (names for display). */
export type AttributeServiceSource = { serviceId: string; attrId: string; serviceName: string; attrName: string };
export type AttributeDef = {
  id: string;
  attribute: string;
  attributeType: AttributeType;
  options: string[];
  /** value fetched from a service – read-only in forms */
  service?: AttributeServiceSource | null;
};
export type PositionValue = string | number | boolean;
export type PositionValues = Record<string, PositionValue>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_TEXT = 500;

/** One value: `{ value }` (null = empty), or `{ error }`. */
export function parseValue(def: AttributeDef, raw: unknown): { value: PositionValue | null } | { error: string } {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { value: null };
  const name = `«${def.attribute}»`;
  switch (def.attributeType) {
    case "alpha": {
      if (typeof raw !== "string") return { error: `${name}: Text erwartet` };
      const v = raw.trim();
      return v.length > MAX_TEXT ? { error: `${name}: höchstens ${MAX_TEXT} Zeichen` } : { value: v };
    }
    case "num": {
      // numbers, or text like "1'250.50" / "12,5"
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(/['’ ]/g, "").replace(",", ".")) : NaN;
      return Number.isFinite(n) ? { value: n } : { error: `${name}: Zahl erwartet` };
    }
    case "date": {
      if (typeof raw !== "string" || !DAY.test(raw)) return { error: `${name}: Datum als JJJJ-MM-TT` };
      const d = new Date(`${raw}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw ? { value: raw } : { error: `${name}: ungültiges Datum` };
    }
    case "bool":
      return typeof raw === "boolean" ? { value: raw } : { error: `${name}: Ja/Nein erwartet` };
    case "list": {
      if (typeof raw !== "string") return { error: `${name}: Option erwartet` };
      const match = def.options.find((o) => o.toLowerCase() === raw.trim().toLowerCase());
      return match ? { value: match } : { error: `${name}: «${raw}» ist keine Option` };
    }
  }
}

/** Validates values against attributes. Keys of unknown attributes are dropped, empty values left out. */
export function parseAttributeValues(defs: AttributeDef[], input: Record<string, unknown>): { values: PositionValues } | { error: string } {
  const values: PositionValues = {};
  for (const def of defs) {
    const r = parseValue(def, input[def.id]);
    if ("error" in r) return r;
    if (r.value !== null) values[def.id] = r.value;
  }
  return { values };
}

/** Like parseAttributeValues, but a position / transaction needs at least one value. */
export function parsePosition(defs: AttributeDef[], input: Record<string, unknown>): { values: PositionValues } | { error: string } {
  const r = parseAttributeValues(defs, input);
  if ("values" in r && Object.keys(r.values).length === 0) return { error: "Mindestens ein Wert ist nötig" };
  return r;
}

/** Display text of a stored value (tolerant: a value from before an attribute type change is shown as is). */
export function formatValue(def: AttributeDef, v: PositionValue | undefined): string {
  if (v === undefined || v === "") return "–";
  if (def.attributeType === "num" && typeof v === "number") return v.toLocaleString("de-CH", { maximumFractionDigits: 6 });
  if (def.attributeType === "date" && typeof v === "string" && DAY.test(v)) return v.split("-").reverse().join(".");
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  return String(v);
}
