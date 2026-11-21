import { describe, expect, it } from "vitest";
import { safeReturn } from "./urls";

describe("safeReturn", () => {
  it("keeps local paths", () => expect(safeReturn("/customers?x=1")).toBe("/customers?x=1"));
  it("refuses other hosts", () => {
    for (const v of ["https://evil.ch", "//evil.ch", "/\\evil.ch", "", null]) expect(safeReturn(v)).toBe("/");
  });
});
