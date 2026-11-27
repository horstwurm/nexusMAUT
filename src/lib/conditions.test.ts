import { describe, expect, it } from "vitest";
import { conditionText, evaluateCondition, parseCondition, type Condition } from "./conditions";
import { buildCatalog, parseTemplate, renderPlaceholders, unknownPlaceholders, usedGroups, type ConditionTrace } from "./placeholders";

const c = (src: string) => parseCondition(src) as Condition;

describe("parseCondition", () => {
  it("reads fields with spaces, quoted values and aliases", () => {
    expect(parseCondition('Kunde.Anrede = "Frau"')).toEqual({ path: "Kunde.Anrede", op: "=", value: "Frau" });
    expect(parseCondition("Position.konto.Zinssatz % >= 1.5")).toEqual({ path: "Position.konto.Zinssatz %", op: "≥", value: "1.5" });
    expect(parseCondition("Kunde.Segment != 'VIP'")).toEqual({ path: "Kunde.Segment", op: "≠", value: "VIP" });
    expect(parseCondition("Produkt.Name enthält Hypothek")).toEqual({ path: "Produkt.Name", op: "enthält", value: "Hypothek" });
    expect(parseCondition("Kunde.Segment nicht leer")).toEqual({ path: "Kunde.Segment", op: "nicht leer", value: "" });
    expect(parseCondition("Kunde.Segment")).toEqual({ error: expect.stringContaining("Vergleich fehlt") });
  });
  it("writes conditions back", () => {
    expect(conditionText({ path: "Kunde.Anrede", op: "=", value: "Frau" })).toBe('Kunde.Anrede = "Frau"');
    expect(conditionText({ path: "Position.hypothek.Betrag", op: ">", value: "500'000" })).toBe("Position.hypothek.Betrag > 500'000");
    expect(conditionText({ path: "Kunde.Segment", op: "leer", value: "" })).toBe("Kunde.Segment leer");
  });
});

describe("evaluateCondition", () => {
  it("numbers as formatted (de-CH) or written", () => {
    expect(evaluateCondition(c("X > 500000"), "620’000")).toBe(true);
    expect(evaluateCondition(c("X ≤ 1'000"), "1’000")).toBe(true);
    expect(evaluateCondition(c("X = 12,5"), "12.5")).toBe(true);
  });
  it("dates as dd.mm.yyyy / yyyy-mm-dd / heute", () => {
    expect(evaluateCondition(c('X < "2027-01-01"'), "31.12.2026")).toBe(true);
    expect(evaluateCondition(c("X >= heute"), "01.01.2026", "2026-11-27")).toBe(false);
  });
  it("texts case-insensitive, enthält", () => {
    expect(evaluateCondition(c('X = "frau"'), "Frau")).toBe(true);
    expect(evaluateCondition(c("X enthält hypo"), "Festhypothek, Sparkonto")).toBe(true);
  });
  it("a missing value only matches «leer»", () => {
    expect(evaluateCondition(c("X leer"), null)).toBe(true);
    expect(evaluateCondition(c('X ≠ "Frau"'), null)).toBe(false);
    expect(evaluateCondition(c("X nicht leer"), "–")).toBe(false);
  });
});

const catalog = buildCatalog({
  customerAttributes: [{ attribute: "Anrede", attributeType: "list" }],
  types: [{ code: "hypothek", label: "Hypothek" }],
  positionAttributes: { hypothek: [{ attribute: "Betrag", attributeType: "num" }] },
  trxAttributes: {},
  services: [],
});
const values: Record<string, string | null> = { Anrede: "Frau", Nachname: "Muster", Vorname: "Anna", Betrag: null };
const render = (text: string, v = values) => {
  const trace: ConditionTrace[] = [];
  const segs = renderPlaceholders(text, catalog, (_g, item) => ({ value: v[item.attribute] ?? null }), undefined, trace);
  return { text: segs.map((s) => (s.kind === "text" ? s.text : (s.value ?? s.token))).join(""), trace };
};
const SALUTATION = '{{#Wenn Kunde.Anrede = "Frau"}}\nSehr geehrte Frau {{Kunde.Nachname}}\n{{#Sonst Kunde.Anrede = "Herr"}}\nSehr geehrter Herr {{Kunde.Nachname}}\n{{#Sonst}}\nGuten Tag {{Kunde.Vorname}} {{Kunde.Nachname}}\n{{/Wenn}}\n\nText';

describe("conditions in templates", () => {
  it("takes the first branch that holds; tags on their own line leave no lines behind", () => {
    expect(render(SALUTATION).text).toBe("Sehr geehrte Frau Muster\n\nText");
    expect(render(SALUTATION, { ...values, Anrede: "Herr" }).text).toBe("Sehr geehrter Herr Muster\n\nText");
    expect(render(SALUTATION, { ...values, Anrede: null }).text).toBe("Guten Tag Anna Muster\n\nText");
  });
  it("traces how it decided", () => {
    expect(render(SALUTATION, { ...values, Anrede: "Herr" }).trace).toEqual([
      { condition: 'Kunde.Anrede = "Frau"', value: "Herr", result: false },
      { condition: 'Kunde.Anrede = "Herr"', value: "Herr", result: true },
    ]);
  });
  it("inline, without Sonst: nothing when false", () => {
    expect(render("A{{#Wenn Position.hypothek.Betrag > 0}} mit Hypothek{{/Wenn}}.").text).toBe("A.");
  });
  it("flags broken conditions", () => {
    expect(unknownPlaceholders("{{#Wenn Kunde.Farbe = rot}}x{{/Wenn}}", catalog)).toEqual(["{{#Wenn Kunde.Farbe = rot}} (unbekanntes Feld «Kunde.Farbe»)"]);
    const broken = unknownPlaceholders("{{#Wenn Kunde.Anrede}}x", catalog);
    expect(broken).toHaveLength(2);
    expect(broken).toEqual(expect.arrayContaining([expect.stringContaining("Vergleich fehlt"), "{{#Wenn Kunde.Anrede}} (nicht geschlossen – {{/Wenn}} fehlt)"]));
    expect(unknownPlaceholders("{{#Sonst}}{{/Wenn}}", catalog)).toEqual(["{{#Sonst}}", "{{/Wenn}}"]);
    expect(unknownPlaceholders(SALUTATION, catalog)).toEqual([]);
  });
  it("no condition in a condition; fields of conditions count as used", () => {
    const nodes = parseTemplate("{{#Wenn Kunde.Anrede leer}}{{#Wenn Kunde.Anrede leer}}{{/Wenn}}");
    expect(nodes[0]).toMatchObject({ t: "if", closed: true });
    expect((nodes[0] as { branches: { children: { t: string }[] }[] }).branches[0].children[0]).toMatchObject({ t: "stray" });
    expect([...usedGroups("{{#Wenn Position.hypothek.Betrag > 1}}x{{/Wenn}}", catalog)]).toEqual(["position:hypothek"]);
  });
});
