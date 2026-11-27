import { describe, expect, it } from "vitest";
import { contentFormatOf, contentFromSegments, contentHtml } from "./contentFormats";
import type { Segment } from "./placeholders";

const segs: Segment[] = [
  { kind: "text", text: "**Guten Tag** " },
  { kind: "placeholder", token: "{{Kunde.Nachname}}", value: "Muster*AG" },
  { kind: "text", text: ", Konto " },
  { kind: "placeholder", token: "{{Position.konto.IBAN}}", value: null },
];

describe("contentFromSegments", () => {
  it("Markdown: values escaped, missing ones keep their token", () => {
    const c = contentFromSegments(segs, "markdown");
    expect(c).toBe("**Guten Tag** Muster\\*AG, Konto {{Position.konto.IBAN}}");
    expect(contentHtml(c, "markdown")).toBe("<p><strong>Guten Tag</strong> Muster*AG, Konto {{Position.konto.IBAN}}</p>");
  });
  it("Nur Text: values as they are, no HTML", () => {
    const c = contentFromSegments(segs, "text");
    expect(c).toBe("**Guten Tag** Muster*AG, Konto {{Position.konto.IBAN}}");
    expect(contentHtml(c, "text")).toBeNull();
  });
  it("actions without a format are formatted", () => {
    expect(contentFormatOf({})).toBe("markdown");
    expect(contentFormatOf({ contentFormat: "text" })).toBe("text");
  });
});
