import { describe, expect, it } from "vitest";
import { buildCatalog, findPlaceholders, renderPlaceholders, unknownPlaceholders, usedGroups } from "./placeholders";

const catalog = buildCatalog({
  customerAttributes: [
    { attribute: "Segment", attributeType: "list" },
    { attribute: "Alter", attributeType: "num" }, // same name as the built-in → not twice
  ],
  types: [
    { code: "konto", label: "Konto" },
    { code: "beratung", label: "Beratung" },
  ],
  positionAttributes: { konto: [{ attribute: "Saldo", attributeType: "num" }] },
  trxAttributes: { konto: [{ attribute: "Betrag", attributeType: "num" }] },
  services: [
    { name: "Kundenstamm", getAttributes: [{ attribute: "Status", attributeType: "list" }] },
    { name: "Leer", getAttributes: [] }, // nothing to offer → no group
  ],
});

describe("buildCatalog", () => {
  it("groups customer, product, positions and transactions per type", () => {
    expect(catalog.map((g) => g.label)).toEqual([
      "Kunde",
      "Produkte und Dienstleistungen",
      "Position – Konto",
      "Transaktion – Konto",
      "Service – Kundenstamm",
    ]);
    expect(catalog.map((g) => g.category)).toEqual(["Kunde", "Produkte", "Positionen", "Transaktionen", "Services"]);
    const tokens = catalog.flatMap((g) => g.items.map((i) => i.token));
    expect(tokens).toContain("{{Kunde.Segment}}");
    expect(tokens).toContain("{{Position.konto.Saldo}}");
    expect(tokens).toContain("{{Transaktion.konto.Betrag}}");
    expect(tokens).toContain("{{Service.Kundenstamm.Status}}");
    expect(tokens.filter((t) => t === "{{Kunde.Alter}}")).toHaveLength(1);
  });
});

describe("findPlaceholders", () => {
  it("finds each once, tolerates spaces", () => {
    expect(findPlaceholders("Hallo {{Kunde.Vorname}}, {{ kunde.vorname }} – Saldo {{Position.konto.Saldo}}")).toEqual([
      "{{Kunde.Vorname}}",
      "{{Position.konto.Saldo}}",
    ]);
    expect(findPlaceholders("kein { Platzhalter }")).toEqual([]);
  });
});

describe("unknownPlaceholders", () => {
  it("flags typos and unknown attributes, case-insensitive otherwise", () => {
    const text = "{{KUNDE.vorname}} {{Kunde.Vornam}} {{Position.konto.Zins}} {{Transaktion.konto.Betrag}} {{service.kundenstamm.status}} {{Service.Kundenstamm.Kunde}}";
    expect(unknownPlaceholders(text, catalog)).toEqual(["{{Kunde.Vornam}}", "{{Position.konto.Zins}}", "{{Service.Kundenstamm.Kunde}}"]);
  });
});

describe("renderPlaceholders", () => {
  it("fills known placeholders, keeps text, flags unknown ones", () => {
    const segs = renderPlaceholders("Hallo {{ kunde.vorname }}! Saldo: {{Position.konto.Saldo}} {{Kunde.Gibtsnicht}}.", catalog, (g, item) =>
      g.id === "kunde" ? { value: "Anna" } : { value: null, note: `keine ${item.attribute}` },
    );
    expect(segs).toEqual([
      { kind: "text", text: "Hallo " },
      { kind: "placeholder", token: "{{ kunde.vorname }}", value: "Anna" },
      { kind: "text", text: "! Saldo: " },
      { kind: "placeholder", token: "{{Position.konto.Saldo}}", value: null, note: "keine Saldo" },
      { kind: "text", text: " " },
      { kind: "placeholder", token: "{{Kunde.Gibtsnicht}}", value: null, note: "unbekannter Platzhalter" },
      { kind: "text", text: "." },
    ]);
  });
});

// --- list results --------------------------------------------------------------------------
const listCatalog = buildCatalog({
  customerAttributes: [],
  types: [],
  positionAttributes: {},
  trxAttributes: {},
  services: [
    {
      name: "Depotpositionen",
      getAttributes: [
        {
          attribute: "Depot",
          attributeType: "alpha",
          list: {
            columns: [
              { attribute: "Name", attributeType: "alpha" },
              { attribute: "Kurs", attributeType: "num" },
            ],
          },
        },
      ],
    },
  ],
});
const B = "Service.Depotpositionen.Depot";

describe("list placeholders", () => {
  it("catalog: block, count, sum for number columns, first row per column", () => {
    expect(listCatalog[2].items.map((i) => i.token)).toEqual([
      `{{#${B}}}`,
      `{{${B}.Anzahl}}`,
      `{{${B}.Summe(Kurs)}}`,
      `{{${B}.Erste.Name}}`,
      `{{${B}.Erste.Kurs}}`,
    ]);
    expect(listCatalog[2].items[0].insert).toBe(`{{#${B}}}\n– {{Name}} · {{Kurs}}\n{{/${B}}}`);
  });
  it("checks blocks: columns known inside, closed, no strays", () => {
    const ok = `Anzahl {{${B}.Anzahl}}\n{{#${B}}}– {{name}} {{Kurs}} {{Kunde.Vorname}}\n{{/${B}}}`;
    expect(unknownPlaceholders(ok, listCatalog)).toEqual([]);
    expect(unknownPlaceholders(`{{#${B}}}{{Menge}}`, listCatalog)).toEqual([`{{#${B}}} (nicht geschlossen)`, "{{Menge}}"]);
    expect(unknownPlaceholders(`{{Name}} {{/${B}}}`, listCatalog)).toEqual(["{{Name}}", `{{/${B}}}`]);
    expect(unknownPlaceholders(`{{#${B}}}{{#${B}}}{{/${B}}}`, listCatalog)).toEqual([`{{#${B}}}`]);
    expect([...usedGroups(ok, listCatalog)].sort()).toEqual(["kunde", "service:Depotpositionen"]);
  });
  it("renders blocks per row, aggregates via valueOf", () => {
    const text = `({{${B}.Anzahl}})\n{{#${B}}}- {{Name}}: {{Kurs}}\n{{/${B}}}Ende`;
    const segs = renderPlaceholders(
      text,
      listCatalog,
      (_g, item) => ({ value: item.kind === "count" ? "2" : null }),
      () => ({ rows: [{ Name: "Nestlé", Kurs: "98.4" }, { Name: "Novartis", Kurs: null }] }),
    );
    const plain = segs.map((s) => (s.kind === "text" ? s.text : (s.value ?? `[${s.note}]`))).join("");
    expect(plain).toBe("(2)\n- Nestlé: 98.4\n- Novartis: [kein Wert in dieser Zeile]\nEnde");
  });
});
