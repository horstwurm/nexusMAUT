import { describe, expect, it } from "vitest";
import { markdownToText } from "./markdown";
import { blockCodesIn, expandBlocks, usesBlock } from "./textBlocks";

const blocks = [
  { code: "signatur", content: "Freundliche Grüsse\n**{{Kunde.Berater}}**\n\n" },
  { code: "anrede", content: '{{#Wenn Kunde.Anrede = "Frau"}}Sehr geehrte Frau{{#Sonst}}Guten Tag{{/Wenn}} {{Kunde.Nachname}}' },
  { code: "verschachtelt", content: "A {{Baustein.signatur}}" },
];

describe("expandBlocks", () => {
  it("inserts blocks (case-insensitive, trailing line breaks removed); placeholders and conditions stay for rendering", () => {
    expect(expandBlocks("{{Baustein.Anrede}},\n\nText\n\n{{ Baustein.signatur }}", blocks)).toBe(
      '{{#Wenn Kunde.Anrede = "Frau"}}Sehr geehrte Frau{{#Sonst}}Guten Tag{{/Wenn}} {{Kunde.Nachname}},\n\nText\n\nFreundliche Grüsse\n**{{Kunde.Berater}}**',
    );
  });
  it("«Nur Text»: formatting stripped", () => {
    expect(expandBlocks("{{Baustein.signatur}}", blocks, "text")).toBe("Freundliche Grüsse\n{{Kunde.Berater}}");
  });
  it("one level: a block inside a block and unknown blocks stay as tokens", () => {
    expect(expandBlocks("{{Baustein.verschachtelt}} {{Baustein.fehlt}}", blocks)).toBe("A {{Baustein.signatur}} {{Baustein.fehlt}}");
  });
  it("finds references", () => {
    expect(blockCodesIn("{{Baustein.Signatur}} {{ baustein.anrede }} {{Baustein.signatur}}")).toEqual(["signatur", "anrede"]);
    expect(usesBlock("x {{Baustein.ANREDE}}", "anrede")).toBe(true);
    expect(usesBlock(null, "anrede")).toBe(false);
  });
});

describe("markdownToText", () => {
  it("removes markers, keeps lists, placeholders and line breaks", () => {
    expect(markdownToText("## Titel\n**fett** und *kursiv*\n- Punkt\n---\n[Termin](https://x.ch) {{Kunde.snake_case}} \\*")).toBe(
      "Titel\nfett und kursiv\n- Punkt\nTermin (https://x.ch) {{Kunde.snake_case}} *",
    );
  });
});
