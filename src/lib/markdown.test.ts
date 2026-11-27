import { describe, expect, it } from "vitest";
import { applyFormat, escapeMarkdown, markdownToHtml } from "./markdown";

describe("markdownToHtml", () => {
  it("keeps plain texts as before: paragraphs and line breaks", () => {
    expect(markdownToHtml("Guten Tag Frau Muster\n\nFreundliche Grüsse\nIhre Bank")).toBe("<p>Guten Tag Frau Muster</p>\n<p>Freundliche Grüsse<br>Ihre Bank</p>");
  });
  it("bold, italic, headings, separator", () => {
    expect(markdownToHtml("## Angebot\n**fett** und *kursiv* und __auch fett__ und _auch kursiv_\n---")).toBe(
      "<h2>Angebot</h2>\n<p><strong>fett</strong> und <em>kursiv</em> und <strong>auch fett</strong> und <em>auch kursiv</em></p>\n<hr>",
    );
  });
  it("lists", () => {
    expect(markdownToHtml("- eins\n- zwei\n1. a\n2. b")).toBe("<ul><li>eins</li><li>zwei</li></ul>\n<ol><li>a</li><li>b</li></ol>");
  });
  it("links: only http(s) and mailto, URL untouched by emphasis", () => {
    expect(markdownToHtml("[Termin](https://ex.ch/a_b_c?x=1&y=2)")).toBe('<p><a href="https://ex.ch/a_b_c?x=1&amp;y=2">Termin</a></p>');
    expect(markdownToHtml("[böse](javascript:alert(1))")).toBe("<p>[böse](javascript:alert(1))</p>");
    expect(markdownToHtml("[Mail](mailto:info@bank.ch)")).toBe('<p><a href="mailto:info@bank.ch">Mail</a></p>');
  });
  it("escapes all HTML", () => {
    expect(markdownToHtml('<script>alert("x")</script> & <b>')).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;</p>");
  });
  it("snake_case and placeholders stay as they are", () => {
    expect(markdownToHtml("snake_case_name {{Kunde.Vorname}}")).toBe("<p>snake_case_name {{Kunde.Vorname}}</p>");
  });
  it("backslash escapes are literal", () => {
    expect(markdownToHtml("\\*kein Stern\\* \\_x\\_")).toBe("<p>*kein Stern* _x_</p>");
  });
});

describe("escapeMarkdown", () => {
  it("customer values don't format", () => {
    const v = "Muster*Meier_ [AG]";
    expect(markdownToHtml(`Name: ${escapeMarkdown(v)}`)).toBe("<p>Name: Muster*Meier_ [AG]</p>");
  });
});

describe("applyFormat", () => {
  it("wraps the selection or inserts a sample", () => {
    expect(applyFormat("Hallo Welt", 6, 10, "bold")).toEqual({ value: "Hallo **Welt**", start: 8, end: 12 });
    expect(applyFormat("Hallo ", 6, 6, "italic")).toEqual({ value: "Hallo *kursiv*", start: 7, end: 13 });
  });
  it("link selects the URL", () => {
    const r = applyFormat("Termin", 0, 6, "link");
    expect(r.value).toBe("[Termin](https://)");
    expect(r.value.slice(r.start, r.end)).toBe("https://");
  });
  it("prefixes the selected lines", () => {
    expect(applyFormat("a\nb\nc", 0, 3, "bullet").value).toBe("- a\n- b\nc");
    expect(applyFormat("a\nb", 0, 3, "numbered").value).toBe("1. a\n2. b");
    expect(applyFormat("Titel\nText", 2, 2, "heading").value).toBe("## Titel\nText");
    expect(applyFormat("- a", 0, 3, "numbered").value).toBe("1. a");
  });
});
