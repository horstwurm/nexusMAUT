import { describe, expect, it } from "vitest";
import { attributeDefinitionError, kindFromPath, normalizeOptions } from "./typeAttributes";

describe("normalizeOptions", () => {
  it("trims, drops empty and case-insensitive duplicates, keeps order", () => {
    expect(normalizeOptions([" Gold", "", "silber", "GOLD", "Bronze "])).toEqual(["Gold", "silber", "Bronze"]);
  });
});

describe("attributeDefinitionError", () => {
  it("requires options for lists only", () => {
    expect(attributeDefinitionError("list", [])).toMatch(/mindestens/);
    expect(attributeDefinitionError("list", ["a"])).toBeNull();
    expect(attributeDefinitionError("num", [])).toBeNull();
    expect(attributeDefinitionError("alpha", ["a"])).toMatch(/nur bei Auswahllisten/);
  });
});

describe("kindFromPath", () => {
  it("maps API segments to kinds", () => {
    expect(kindFromPath("position-attributes")).toBe("position");
    expect(kindFromPath("trx-attributes")).toBe("trx");
    expect(kindFromPath("attributes")).toBeNull();
  });
});
