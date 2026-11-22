// Rules (Regeln): customer segments defined by conditions on three levels –
// the customer, its positions, its transactions. Pure evaluation shared by
// server (matches) and tests; the page uses the operator lists and texts.

import type { PositionValue } from "./positions";
import type { AttributeType } from "./typeAttributes";

// --- operators --------------------------------------------------------------------

export const OPERATORS = {
  eq: "ist",
  ne: "ist nicht",
  contains: "enthält",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  before: "vor",
  after: "nach",
  between: "zwischen",
  lastDays: "in den letzten … Tagen",
  nextDays: "in den nächsten … Tagen",
  anniversaryNext: "Jahrestag in den nächsten … Tagen",
  anniversaryLast: "Jahrestag in den letzten … Tagen",
  isTrue: "ist Ja",
  isFalse: "ist Nein",
  in: "ist eine von",
  empty: "ist leer",
  notEmpty: "ist nicht leer",
} as const;

export type Operator = keyof typeof OPERATORS;
export const OPERATOR_NAMES = Object.keys(OPERATORS) as Operator[];

/** Operators that make sense per value type. */
export const OPERATORS_BY_TYPE: Record<AttributeType, Operator[]> = {
  alpha: ["eq", "ne", "contains", "empty", "notEmpty"],
  num: ["eq", "ne", "gt", "gte", "lt", "lte", "empty", "notEmpty"],
  date: ["eq", "before", "after", "between", "lastDays", "nextDays", "anniversaryNext", "anniversaryLast", "empty", "notEmpty"],
  bool: ["isTrue", "isFalse", "empty"],
  list: ["eq", "ne", "in", "empty", "notEmpty"],
};

/** Operators whose value is a number of days. */
export const DAYS_OPERATORS: Operator[] = ["lastDays", "nextDays", "anniversaryNext", "anniversaryLast"];
/** Anniversaries compare day and month only – at most a year around today. */
export const MAX_ANNIVERSARY_DAYS = 366;

/** Operators for counts and sums (always a number). */
export const COUNT_OPERATORS: Operator[] = ["gte", "gt", "eq", "ne", "lte", "lt"];

/** Operators without a comparison value. */
export const NO_VALUE: Operator[] = ["isTrue", "isFalse", "empty", "notEmpty"];

export type RuleValue = string | number | boolean | string[] | null;

/** A date value meaning «the day the rule is evaluated» (instead of a fixed date). */
export const TODAY = "@heute";
/** A date value or TODAY → the actual day. */
const resolveDay = (v: string, today: string) => (v === TODAY ? today : v);

// --- conditions ---------------------------------------------------------------------

export const CUSTOMER_FIELDS = {
  name: { label: "Vorname", type: "alpha" },
  lastname: { label: "Nachname", type: "alpha" },
  age: { label: "Alter", type: "num" },
  dateOfBirth: { label: "Geburtsdatum", type: "date" },
} as const satisfies Record<string, { label: string; type: AttributeType }>;

export type CustomerField = keyof typeof CUSTOMER_FIELDS;

/** A comparison on one attribute of a position / transaction. */
export type AttrFilter = { attrId: string; op: Operator; value: RuleValue };

/** On a built-in field, or (field "attribute") on a customer attribute. */
export type CustomerCondition = {
  level: "customer";
  field: CustomerField | "attribute";
  attrId?: string | null;
  op: Operator;
  value: RuleValue;
};

/** «Number of positions of TYPE (matching FILTER) OP VALUE» – e.g. ≥ 1 = «has one», = 0 = «has none». */
export type PositionCondition = {
  level: "position";
  type: string;
  filter: AttrFilter | null;
  op: Operator;
  value: number;
};

/**
 * «Count of / sum of SUM_ATTR over the transactions of TYPE (matching FILTER,
 * within the last DAYS by DATE_ATTR) OP VALUE».
 */
export type TrxCondition = {
  level: "trx";
  type: string;
  filter: AttrFilter | null;
  period: { dateAttrId: string; days: number } | null;
  measure: "count" | "sum";
  sumAttrId: string | null;
  op: Operator;
  value: number;
};

// Service values are «Service» attributes (customer / position / trx) with
// stored values – compared like any attribute (service conditions until 2026-11).
export type Condition = CustomerCondition | PositionCondition | TrxCondition;
export type Rule = { match: "all" | "any"; conditions: Condition[] };

// --- data the evaluation works on -----------------------------------------------------

export type AttrInfo = { attributeType: AttributeType };
export type RuleContext = {
  /** YYYY-MM-DD */
  today: string;
  /** attribute id → its type (customer, position and transaction attributes) */
  attributes: Map<string, AttrInfo>;
};
export type CustomerData = {
  name: string;
  lastname: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  /** customer attribute values */
  attributes: Record<string, PositionValue>;
  positions: { type: string; values: Record<string, PositionValue> }[];
  /** with the type of their position */
  transactions: { type: string; values: Record<string, PositionValue> }[];
};

// --- evaluation -----------------------------------------------------------------------

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function ageOn(dateOfBirth: string, today: string) {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "";
const lower = (v: unknown) => String(v).trim().toLowerCase();

/** Compares one stored value with a condition. A missing value only matches «empty» and «ist nicht». */
export function compareValue(type: AttributeType, v: PositionValue | undefined | null, op: Operator, target: RuleValue, today: string): boolean {
  if (op === "empty") return isEmpty(v);
  if (op === "notEmpty") return !isEmpty(v);
  if (isEmpty(v)) return op === "ne";
  switch (type) {
    case "alpha":
    case "list":
      if (op === "eq") return lower(v) === lower(target);
      if (op === "ne") return lower(v) !== lower(target);
      if (op === "contains") return lower(v).includes(lower(target));
      if (op === "in") return Array.isArray(target) && target.some((t) => lower(t) === lower(v));
      return false;
    case "num": {
      if (typeof v !== "number" || typeof target !== "number") return false;
      return compareNumber(v, op, target);
    }
    case "date": {
      if (typeof v !== "string") return false;
      if (op === "lastDays" && typeof target === "number") return v <= today && v >= addDays(today, -target);
      if (op === "nextDays" && typeof target === "number") return v >= today && v <= addDays(today, target);
      if ((op === "anniversaryNext" || op === "anniversaryLast") && typeof target === "number") {
        return anniversaryWithin(v, today, op === "anniversaryNext" ? 1 : -1, target);
      }
      if (op === "between") {
        // [from, to], both days included; an empty end is open; either end may be TODAY
        if (!Array.isArray(target)) return false;
        const [from, to] = target.map((d) => resolveDay(d, today));
        return (!from || v >= from) && (!to || v <= to);
      }
      if (typeof target !== "string") return false;
      const day = resolveDay(target, today);
      if (op === "eq") return v === day;
      if (op === "before") return v < day;
      if (op === "after") return v > day;
      return false;
    }
    case "bool":
      if (op === "isTrue") return v === true;
      if (op === "isFalse") return v === false;
      return false;
  }
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Whether the yearly anniversary of `day` (e.g. a birthday) falls within
 * `days` days after (dir 1) or before (dir -1) `today`, today included.
 * 29 February counts on 28 February in non-leap years.
 */
export function anniversaryWithin(day: string, today: string, dir: 1 | -1, days: number): boolean {
  const md = day.slice(5, 10);
  const n = Math.max(0, Math.min(MAX_ANNIVERSARY_DAYS, Math.floor(days)));
  for (let i = 0; i <= n; i++) {
    const d = addDays(today, dir * i);
    const dMd = d.slice(5, 10);
    if (dMd === md) return true;
    if (md === "02-29" && dMd === "02-28" && !isLeap(Number(d.slice(0, 4)))) return true;
  }
  return false;
}

export function compareNumber(n: number, op: Operator, target: number): boolean {
  switch (op) {
    case "eq":
      return n === target;
    case "ne":
      return n !== target;
    case "gt":
      return n > target;
    case "gte":
      return n >= target;
    case "lt":
      return n < target;
    case "lte":
      return n <= target;
    default:
      return false;
  }
}

/** A filter on an attribute that no longer exists matches nothing. */
function passes(filter: AttrFilter | null, values: Record<string, PositionValue>, ctx: RuleContext) {
  if (!filter) return true;
  const attr = ctx.attributes.get(filter.attrId);
  if (!attr) return false;
  return compareValue(attr.attributeType, values[filter.attrId], filter.op, filter.value, ctx.today);
}

export function evaluateCondition(c: Condition, data: CustomerData, ctx: RuleContext): boolean {
  if (c.level === "customer") {
    if (c.field === "attribute") {
      const attr = c.attrId ? ctx.attributes.get(c.attrId) : undefined;
      if (!attr) return false; // deleted attribute
      return compareValue(attr.attributeType, data.attributes[c.attrId!], c.op, c.value, ctx.today);
    }
    const field = CUSTOMER_FIELDS[c.field];
    const v = c.field === "age" ? ageOn(data.dateOfBirth, ctx.today) : data[c.field];
    return compareValue(field.type, v, c.op, c.value, ctx.today);
  }
  if (c.level === "position") {
    const n = data.positions.filter((p) => p.type === c.type && passes(c.filter, p.values, ctx)).length;
    return compareNumber(n, c.op, c.value);
  }
  const from = c.period ? addDays(ctx.today, -c.period.days) : null;
  const list = data.transactions.filter((t) => {
    if (t.type !== c.type || !passes(c.filter, t.values, ctx)) return false;
    if (!c.period) return true;
    const d = t.values[c.period.dateAttrId];
    return typeof d === "string" && d >= from! && d <= ctx.today;
  });
  if (c.measure === "count") return compareNumber(list.length, c.op, c.value);
  const sum = list.reduce((s, t) => {
    const v = c.sumAttrId ? t.values[c.sumAttrId] : undefined;
    return s + (typeof v === "number" ? v : 0);
  }, 0);
  return compareNumber(Math.round(sum * 100) / 100, c.op, c.value);
}

const DAY_OR_EMPTY = /^(\d{4}-\d{2}-\d{2}|@heute)?$/;

/** Problem with the value of a «zwischen» comparison, or null: [from, to], one end may be empty. */
export function rangeProblem(value: RuleValue): string | null {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((v) => typeof v === "string" && DAY_OR_EMPTY.test(v))) {
    return "Zeitraum: von und bis als Datum";
  }
  const [from, to] = value;
  if (!from && !to) return "Zeitraum: mindestens von oder bis angeben";
  // with «heute» on one end the order depends on the day – only fixed dates are compared
  if (from && to && from !== TODAY && to !== TODAY && from > to) return "Zeitraum: «von» liegt nach «bis»";
  return null;
}

/** A rule without conditions matches nobody (not everybody). */
export function evaluateRule(rule: Rule, data: CustomerData, ctx: RuleContext): boolean {
  if (!rule.conditions.length) return false;
  return rule.match === "all"
    ? rule.conditions.every((c) => evaluateCondition(c, data, ctx))
    : rule.conditions.some((c) => evaluateCondition(c, data, ctx));
}
