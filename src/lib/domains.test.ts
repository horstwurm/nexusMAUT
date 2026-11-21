import { describe, expect, it } from "vitest";
import { CODE_RE, codeFromLabel, labelOf } from "./domains";

describe("codeFromLabel", () => {
  it("makes a valid code from German labels", () => {
    expect(codeFromLabel("Beratung vor Ort")).toBe("beratung-vor-ort");
    expect(codeFromLabel("Brief / Post (Ä)")).toBe("brief-post-ae");
    expect(codeFromLabel("  E-Mail  ")).toBe("e-mail");
    expect(CODE_RE.test(codeFromLabel("Rückruf erwünscht"))).toBe(true);
  });
});

describe("labelOf", () => {
  it("falls back to the code", () => {
    const values = [{ code: "abo", label: "Abonnement" }];
    expect(labelOf(values, "abo")).toBe("Abonnement");
    expect(labelOf(values, "gone")).toBe("gone");
  });
});
