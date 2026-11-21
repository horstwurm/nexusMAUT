import { describe, expect, it } from "vitest";
import { formatValue, parseAttributeValues, parsePosition, parseValue, type AttributeDef } from "./positions";

const def = (attributeType: AttributeDef["attributeType"], options: string[] = []): AttributeDef => ({
  id: attributeType,
  attribute: attributeType,
  attributeType,
  options,
});

describe("parseValue", () => {
  it("treats empty as null", () => {
    expect(parseValue(def("num"), "  ")).toEqual({ value: null });
    expect(parseValue(def("bool"), undefined)).toEqual({ value: null });
  });
  it("parses numbers incl. Swiss formats", () => {
    expect(parseValue(def("num"), 12)).toEqual({ value: 12 });
    expect(parseValue(def("num"), "1'250.50")).toEqual({ value: 1250.5 });
    expect(parseValue(def("num"), "12,5")).toEqual({ value: 12.5 });
    expect(parseValue(def("num"), "zwölf")).toHaveProperty("error");
  });
  it("checks dates, booleans and texts", () => {
    expect(parseValue(def("date"), "2026-02-28")).toEqual({ value: "2026-02-28" });
    expect(parseValue(def("date"), "2026-02-30")).toHaveProperty("error");
    expect(parseValue(def("bool"), false)).toEqual({ value: false });
    expect(parseValue(def("bool"), "ja")).toHaveProperty("error");
    expect(parseValue(def("alpha"), "  x ")).toEqual({ value: "x" });
    expect(parseValue(def("alpha"), "x".repeat(501))).toHaveProperty("error");
  });
  it("accepts list options case-insensitively, stores the option", () => {
    expect(parseValue(def("list", ["Basic", "Premium"]), "premium")).toEqual({ value: "Premium" });
    expect(parseValue(def("list", ["Basic"]), "Gold")).toHaveProperty("error");
  });
});

describe("parsePosition", () => {
  const defs = [def("num"), def("alpha")];
  it("drops unknown keys and empty values", () => {
    expect(parsePosition(defs, { num: "3", alpha: "", other: "x" })).toEqual({ values: { num: 3 } });
  });
  it("needs one value and reports the first error", () => {
    expect(parsePosition(defs, {})).toHaveProperty("error");
    expect(parsePosition(defs, { num: "x" })).toEqual({ error: "«num»: Zahl erwartet" });
  });
});

describe("parseAttributeValues", () => {
  it("allows no values at all (customer attributes)", () => {
    expect(parseAttributeValues([def("num")], {})).toEqual({ values: {} });
    expect(parseAttributeValues([def("num")], { num: "x" })).toHaveProperty("error");
  });
});

describe("formatValue", () => {
  it("formats by type", () => {
    expect(formatValue(def("num"), 1250.5)).toMatch(/1.250,5|1’250.5|1'250.5/);
    expect(formatValue(def("date"), "2026-01-31")).toBe("31.01.2026");
    expect(formatValue(def("bool"), true)).toBe("Ja");
    expect(formatValue(def("alpha"), undefined)).toBe("–");
  });
});
