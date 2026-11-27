// Conditions in journey step contents (pure – server and editor):
//   {{#Wenn Kunde.Anrede = "Frau"}} … {{#Sonst Kunde.Anrede = "Herr"}} … {{#Sonst}} … {{/Wenn}}
// A condition compares a placeholder's value (Kunde.Anrede, Position.hypothek.Betrag,
// Service.Bonität.Stufe …, written without braces) with a value: = ≠ > ≥ < ≤ enthält, or
// tests «leer» / «nicht leer». Numbers (1'000, 12.5), dates (dd.mm.yyyy, yyyy-mm-dd, heute)
// and texts (case-insensitive) are compared by kind. A missing value only matches «leer» –
// otherwise the condition is false and the next branch («Sonst») is taken.

export const CONDITION_OPS = ["=", "≠", ">", "≥", "<", "≤", "enthält", "leer", "nicht leer"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export const CONDITION_OP_LABELS: Record<ConditionOp, string> = {
  "=": "ist gleich",
  "≠": "ist nicht",
  ">": "grösser als",
  "≥": "mindestens",
  "<": "kleiner als",
  "≤": "höchstens",
  enthält: "enthält",
  leer: "ist leer",
  "nicht leer": "ist nicht leer",
};

/** Operators without a value. */
export const UNARY_OPS: ConditionOp[] = ["leer", "nicht leer"];

export type Condition = { path: string; op: ConditionOp; value: string };

const ALIASES: Record<string, ConditionOp> = { "!=": "≠", "<>": "≠", ">=": "≥", "<=": "≤", "==": "=" };

/** «Kunde.Anrede = "Frau"» → { path, op, value }, or an error text. */
export function parseCondition(src: string): Condition | { error: string } {
  const s = src.trim();
  if (!s) return { error: "Bedingung fehlt" };
  const unary = /^(.+?)\s+(nicht\s+leer|leer)$/i.exec(s);
  if (unary) return { path: unary[1].trim(), op: unary[2].toLowerCase().replace(/\s+/, " ") as ConditionOp, value: "" };
  const contains = /^(.+?)\s+enthält\s+(.+)$/i.exec(s);
  const cmp = contains ? null : /^(.+?)\s*(!=|<>|>=|<=|==|=|≠|≥|≤|>|<)\s*(.+)$/.exec(s);
  if (!contains && !cmp) return { error: "Vergleich fehlt (=, ≠, >, ≥, <, ≤, enthält, leer, nicht leer)" };
  const path = (contains ? contains[1] : cmp![1]).trim();
  const op = contains ? "enthält" : (ALIASES[cmp![2]] ?? (cmp![2] as ConditionOp));
  let value = (contains ? contains[2] : cmp![3]).trim();
  if (/^".*"$/.test(value) || /^'.*'$/.test(value) || /^«.*»$/.test(value)) value = value.slice(1, -1);
  if (!path) return { error: "Feld fehlt" };
  return { path, op, value };
}

/** The condition as written in a template (values quoted unless numbers / «heute»). */
export function conditionText(c: Condition) {
  if (UNARY_OPS.includes(c.op)) return `${c.path} ${c.op}`;
  const v = /^-?[\d'’]+([.,]\d+)?$/.test(c.value.trim()) || /^heute$/i.test(c.value.trim()) ? c.value.trim() : `"${c.value.replace(/"/g, "'")}"`;
  return `${c.path} ${c.op} ${v}`;
}

/** A number as written or formatted (1'250.50, 1’250.5, 12,5, -3) or null. */
function asNumber(v: string): number | null {
  const s = v.trim().replace(/['’\s]/g, "");
  const n = /^-?\d+([.,]\d+)?$/.test(s) ? Number(s.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** A day as YYYY-MM-DD from dd.mm.yyyy, yyyy-mm-dd or «heute», else null. */
function asDay(v: string, today: string): string | null {
  const s = v.trim();
  if (/^heute$/i.test(s)) return today;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/**
 * Whether the condition holds for a placeholder's (formatted) value; `null` =
 * no value. Numbers and dates compare by kind, texts case-insensitively.
 */
export function evaluateCondition(c: Condition, value: string | null, today = new Date().toISOString().slice(0, 10)): boolean {
  const empty = value === null || value.trim() === "" || value === "–";
  if (c.op === "leer") return empty;
  if (c.op === "nicht leer") return !empty;
  if (empty) return false;
  const v = value!;
  if (c.op === "enthält") return v.toLowerCase().includes(c.value.toLowerCase());
  let order: number;
  const [na, nb] = [asNumber(v), asNumber(c.value)];
  const [da, db] = [asDay(v, today), asDay(c.value, today)];
  if (na !== null && nb !== null) order = na - nb;
  else if (da !== null && db !== null) order = da.localeCompare(db);
  else order = v.trim().localeCompare(c.value.trim(), "de", { sensitivity: "base" });
  switch (c.op) {
    case "=":
      return order === 0;
    case "≠":
      return order !== 0;
    case ">":
      return order > 0;
    case "≥":
      return order >= 0;
    case "<":
      return order < 0;
    case "≤":
      return order <= 0;
  }
  return false;
}
