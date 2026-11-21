import { describe, expect, it } from "vitest";
import { ageOn, anniversaryWithin, compareValue, evaluateCondition, evaluateRule, rangeProblem, TODAY as HEUTE, type CustomerData, type RuleContext } from "./rules";

const TODAY = "2026-11-20";
const ctx: RuleContext = {
  today: TODAY,
  attributes: new Map([
    ["saldo", { attributeType: "num" }],
    ["kat", { attributeType: "list" }],
    ["datum", { attributeType: "date" }],
    ["betrag", { attributeType: "num" }],
    ["aktiv", { attributeType: "bool" }],
    ["segment", { attributeType: "list" }],
  ]),
};
const anna: CustomerData = {
  name: "Anna",
  lastname: "Muster",
  dateOfBirth: "1960-11-21", // 65 today, 66 tomorrow
  attributes: { segment: "Premium" },
  positions: [
    { type: "konto", values: { saldo: 80_000, aktiv: true } },
    { type: "konto", values: { saldo: 500 } },
    { type: "kreditkarte", values: {} },
  ],
  transactions: [
    { type: "kreditkarte", values: { datum: "2026-11-01", kat: "Reisen", betrag: 1200 } },
    { type: "kreditkarte", values: { datum: "2026-10-15", kat: "Reisen", betrag: 300.5 } },
    { type: "kreditkarte", values: { datum: "2026-03-01", kat: "Reisen", betrag: 5000 } },
    { type: "kreditkarte", values: { datum: "2026-11-10", kat: "Online", betrag: 50 } },
  ],
};

describe("compareValue", () => {
  it("compares texts case-insensitively", () => {
    expect(compareValue("alpha", "Müller", "eq", "müller", TODAY)).toBe(true);
    expect(compareValue("alpha", "Müller-Meier", "contains", "MEIER", TODAY)).toBe(true);
    expect(compareValue("list", "Gold", "in", ["gold", "Platinum"], TODAY)).toBe(true);
  });
  it("handles missing values", () => {
    expect(compareValue("num", undefined, "gt", 1, TODAY)).toBe(false);
    expect(compareValue("num", undefined, "ne", 1, TODAY)).toBe(true);
    expect(compareValue("alpha", "", "empty", null, TODAY)).toBe(true);
  });
  it("compares dates incl. relative periods", () => {
    expect(compareValue("date", "2026-11-01", "lastDays", 30, TODAY)).toBe(true);
    expect(compareValue("date", "2026-09-01", "lastDays", 30, TODAY)).toBe(false);
    expect(compareValue("date", "2026-12-01", "nextDays", 30, TODAY)).toBe(true);
    expect(compareValue("date", "2026-01-01", "before", "2026-06-01", TODAY)).toBe(true);
  });
  it("date ranges: inclusive, open ends", () => {
    const range = ["2026-01-01", "2026-03-31"];
    expect(compareValue("date", "2026-01-01", "between", range, TODAY)).toBe(true);
    expect(compareValue("date", "2026-03-31", "between", range, TODAY)).toBe(true);
    expect(compareValue("date", "2026-04-01", "between", range, TODAY)).toBe(false);
    expect(compareValue("date", "1990-01-01", "between", ["", "2000-12-31"], TODAY)).toBe(true);
    expect(compareValue("date", "2026-11-01", "between", ["2026-06-01", ""], TODAY)).toBe(true);
    expect(compareValue("date", undefined, "between", range, TODAY)).toBe(false);
  });
  it("booleans", () => {
    expect(compareValue("bool", true, "isTrue", null, TODAY)).toBe(true);
    expect(compareValue("bool", undefined, "isFalse", null, TODAY)).toBe(false);
  });
});

describe("rangeProblem", () => {
  it("checks [from, to]", () => {
    expect(rangeProblem(["2026-01-01", "2026-12-31"])).toBeNull();
    expect(rangeProblem(["", "2026-12-31"])).toBeNull();
    expect(rangeProblem(["", ""])).toMatch(/mindestens/);
    expect(rangeProblem(["2026-12-31", "2026-01-01"])).toMatch(/nach/);
    expect(rangeProblem("2026-01-01")).toMatch(/von und bis/);
  });
});

describe("ageOn", () => {
  it("counts full years", () => {
    expect(ageOn("1960-11-21", TODAY)).toBe(65);
    expect(ageOn("1960-11-20", TODAY)).toBe(66);
  });
});

describe("evaluateCondition", () => {
  it("customer level", () => {
    expect(evaluateCondition({ level: "customer", field: "age", op: "gte", value: 65 }, anna, ctx)).toBe(true);
    expect(evaluateCondition({ level: "customer", field: "lastname", op: "eq", value: "muster" }, anna, ctx)).toBe(true);
  });
  it("customer attributes; a deleted one matches nothing", () => {
    expect(evaluateCondition({ level: "customer", field: "attribute", attrId: "segment", op: "eq", value: "premium" }, anna, ctx)).toBe(true);
    expect(evaluateCondition({ level: "customer", field: "attribute", attrId: "segment", op: "empty", value: null }, anna, ctx)).toBe(false);
    expect(evaluateCondition({ level: "customer", field: "attribute", attrId: "gone", op: "notEmpty", value: null }, anna, ctx)).toBe(false);
  });
  it("position level: counts with filter, «has none»", () => {
    const rich = { attrId: "saldo", op: "gt" as const, value: 50_000 };
    expect(evaluateCondition({ level: "position", type: "konto", filter: rich, op: "gte", value: 1 }, anna, ctx)).toBe(true);
    expect(evaluateCondition({ level: "position", type: "konto", filter: null, op: "eq", value: 2 }, anna, ctx)).toBe(true);
    expect(evaluateCondition({ level: "position", type: "hypothek", filter: null, op: "eq", value: 0 }, anna, ctx)).toBe(true);
    expect(evaluateCondition({ level: "position", type: "konto", filter: { attrId: "gone", op: "gt", value: 0 }, op: "gte", value: 1 }, anna, ctx)).toBe(false);
  });
  it("trx level: count / sum with filter and period", () => {
    const reisen = { attrId: "kat", op: "eq" as const, value: "Reisen" };
    const base = { level: "trx" as const, type: "kreditkarte", sumAttrId: "betrag" };
    expect(evaluateCondition({ ...base, filter: reisen, period: null, measure: "count", op: "eq", value: 3 }, anna, ctx)).toBe(true);
    expect(
      evaluateCondition({ ...base, filter: reisen, period: { dateAttrId: "datum", days: 90 }, measure: "count", op: "eq", value: 2 }, anna, ctx),
    ).toBe(true);
    expect(
      evaluateCondition({ ...base, filter: reisen, period: { dateAttrId: "datum", days: 90 }, measure: "sum", op: "eq", value: 1500.5 }, anna, ctx),
    ).toBe(true);
  });
});

describe("evaluateRule", () => {
  const old = { level: "customer" as const, field: "age" as const, op: "gte" as const, value: 70 };
  const konto = { level: "position" as const, type: "konto", filter: null, op: "gte" as const, value: 1 };
  it("all / any; empty rule matches nobody", () => {
    expect(evaluateRule({ match: "all", conditions: [old, konto] }, anna, ctx)).toBe(false);
    expect(evaluateRule({ match: "any", conditions: [old, konto] }, anna, ctx)).toBe(true);
    expect(evaluateRule({ match: "any", conditions: [] }, anna, ctx)).toBe(false);
  });
});

describe("«heute» as a date value", () => {
  it("compares with the evaluation day", () => {
    expect(compareValue("date", TODAY, "eq", HEUTE, TODAY)).toBe(true);
    expect(compareValue("date", "2026-11-19", "before", HEUTE, TODAY)).toBe(true);
    expect(compareValue("date", "2026-11-21", "after", HEUTE, TODAY)).toBe(true);
    expect(compareValue("date", "2026-11-21", "before", HEUTE, TODAY)).toBe(false);
  });
  it("as an end of a range", () => {
    expect(compareValue("date", "2026-06-01", "between", ["2026-01-01", HEUTE], TODAY)).toBe(true);
    expect(compareValue("date", "2026-12-01", "between", ["2026-01-01", HEUTE], TODAY)).toBe(false);
    expect(compareValue("date", "2027-01-01", "between", [HEUTE, ""], TODAY)).toBe(true);
    expect(rangeProblem([HEUTE, "2026-12-31"])).toBeNull();
    expect(rangeProblem(["2026-01-01", HEUTE])).toBeNull();
  });
});

describe("anniversaries (birthdays)", () => {
  it("compares day and month only, today included", () => {
    expect(compareValue("date", "1980-11-25", "anniversaryNext", 7, TODAY)).toBe(true);
    expect(compareValue("date", "1980-11-25", "anniversaryNext", 3, TODAY)).toBe(false);
    expect(compareValue("date", "1990-11-15", "anniversaryLast", 7, TODAY)).toBe(true);
    expect(compareValue("date", "1990-11-15", "anniversaryNext", 365, TODAY)).toBe(true); // next year's, 360 days ahead
    expect(compareValue("date", "1990-11-15", "anniversaryNext", 300, TODAY)).toBe(false);
    expect(compareValue("date", "1960-11-20", "anniversaryNext", 0, TODAY)).toBe(true); // birthday today
    expect(compareValue("date", "1960-11-21", "anniversaryLast", 0, TODAY)).toBe(false);
  });
  it("across the year end and 29 February", () => {
    expect(anniversaryWithin("1975-01-03", "2026-12-30", 1, 7)).toBe(true);
    expect(anniversaryWithin("1996-02-29", "2027-02-28", 1, 0)).toBe(true);
    expect(anniversaryWithin("1996-02-29", "2028-02-28", 1, 0)).toBe(false); // 2028 has a 29th
    expect(anniversaryWithin("1996-02-29", "2028-02-29", 1, 0)).toBe(true);
  });
  it("differs from «in den letzten … Tagen» (= the date itself)", () => {
    expect(compareValue("date", "1980-11-15", "lastDays", 365, TODAY)).toBe(false);
    expect(compareValue("date", "1980-11-15", "anniversaryLast", 365, TODAY)).toBe(true);
  });
});
