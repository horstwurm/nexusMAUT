import { describe, expect, it } from "vitest";
import type { AttributeDef } from "./positions";
import { buildRequest, isCustomerNumberAttribute, isIdAttribute, isUnavailable, listSpecProblem, mapResponse, mockResponse, randomResponse, usesCustomerNumbers, type ServiceAttrDef } from "./serviceCall";

const def = (id: string, attribute: string, attributeType: AttributeDef["attributeType"], options: string[] = []): AttributeDef => ({
  id,
  attribute,
  attributeType,
  options,
});
const put = [def("p1", "Kundennummer", "alpha"), def("p2", "Betrag", "num"), def("p3", "Notiz", "alpha")];
const get = [def("g1", "Status", "list", ["ok", "Fehler"]), def("g2", "Bonität", "num"), def("g3", "Geprüft am", "date"), def("g4", "Aktiv", "bool")];

describe("buildRequest", () => {
  it("sends PUT attributes by name as JSON, leaves out empty ones", () => {
    const r = buildRequest("https://api.example.ch/k", "POST", put, { p1: "K-1", p2: 12.5 });
    expect(r.url).toBe("https://api.example.ch/k");
    expect(JSON.parse(r.body!)).toEqual({ Kundennummer: "K-1", Betrag: 12.5 });
  });
  it("GET: query parameters, no body, keeps existing query", () => {
    const r = buildRequest("https://api.example.ch/k?v=2", "GET", put, { p1: "K 1", p2: 3 });
    expect(r.body).toBeNull();
    expect(r.url).toBe("https://api.example.ch/k?v=2&Kundennummer=K+1&Betrag=3");
  });
});

describe("mapResponse", () => {
  it("maps by name case-insensitively and checks types", () => {
    const { values } = mapResponse(get, { status: "OK", "BONITÄT": 720, "geprüft am": "2026-11-21", aktiv: true, extra: 1 });
    expect(values.map((v) => [v.attribute, v.status, v.value])).toEqual([
      ["Status", "ok", "ok"],
      ["Bonität", "ok", 720],
      ["Geprüft am", "ok", "2026-11-21"],
      ["Aktiv", "ok", true],
    ]);
  });
  it("reports missing and invalid values", () => {
    const { values } = mapResponse(get, { Status: "unbekannt", Bonität: "viel" });
    expect(values.map((v) => v.status)).toEqual(["invalid", "invalid", "missing", "missing"]);
    expect(values[0].error).toMatch(/keine Option/);
  });
  it("unwraps data / result, rejects non-objects", () => {
    expect(mapResponse(get, { data: { Status: "ok" } }).values[0].status).toBe("ok");
    expect(mapResponse(get, [1, 2]).error).toMatch(/kein JSON-Objekt/);
  });
});

describe("mockResponse", () => {
  it("one valid sample value per GET attribute, stable", () => {
    const mock = mockResponse(get, "2026-11-21");
    expect(mock).toEqual({ Status: "ok", Bonität: mockResponse(get, "2026-11-21").Bonität, "Geprüft am": "2026-11-21", Aktiv: true });
    expect(typeof mock.Bonität).toBe("number");
    // the sample passes the same mapping as a real answer
    expect(mapResponse(get, mock).values.every((v) => v.status === "ok")).toBe(true);
    expect(mockResponse([def("a", "Name", "alpha")]).Name).toBe("Beispiel Name");
  });
});

describe("isUnavailable", () => {
  it("no answer, 404 and 5xx", () => {
    expect([null, 404, 500, 503].every(isUnavailable)).toBe(true);
    expect([200, 400, 422].some(isUnavailable)).toBe(false);
  });
});

// --- lists ------------------------------------------------------------------------------
const securities: ServiceAttrDef = {
  ...def("g9", "Wertschriften", "alpha"),
  list: {
    path: "",
    columns: [
      { attribute: "ISIN", attributeType: "alpha", options: [] },
      { attribute: "Menge", attributeType: "num", options: [] },
      { attribute: "Währung", attributeType: "list", options: ["CHF", "EUR"] },
    ],
  },
};

describe("list attributes", () => {
  it("maps rows and columns case-insensitively, typed", () => {
    const { values } = mapResponse([def("g2", "Bonität", "num"), securities], {
      Bonität: 1,
      wertschriften: [
        { isin: "CH0038863350", Menge: "120", währung: "chf" },
        { ISIN: "CH0012005267", Menge: 80, Währung: "EUR", extra: true },
      ],
    });
    const list = values[1];
    expect(list.status).toBe("ok");
    expect(list.list!.rows.map((r) => r.values)).toEqual([
      { ISIN: "CH0038863350", Menge: 120, Währung: "CHF" },
      { ISIN: "CH0012005267", Menge: 80, Währung: "EUR" },
    ]);
  });
  it("reports per row and column; empty list is fine", () => {
    const bad = mapResponse([securities], { Wertschriften: [{ ISIN: "x", Menge: "viel" }, 5] }).values[0];
    expect(bad.status).toBe("invalid");
    expect(bad.list!.rows[0].errors).toEqual(["Zeile 1: «Menge»: Zahl erwartet"]);
    expect(bad.list!.rows[1].errors).toEqual(["Zeile 2: kein Objekt"]);
    expect(bad.error).toMatch(/\+1 weitere/);
    expect(mapResponse([securities], { Wertschriften: [] }).values[0].status).toBe("ok");
    expect(mapResponse([securities], { Wertschriften: "x" }).values[0].error).toMatch(/keine Liste/);
    expect(mapResponse([securities], {}).values[0].status).toBe("missing");
  });
  it("finds the list at a path from the root", () => {
    const atPath = { ...securities, list: { ...securities.list!, path: "Portfolio.Items" } };
    const { values } = mapResponse([atPath], { portfolio: { items: [{ ISIN: "A", Menge: 1, Währung: "CHF" }] } });
    expect(values[0].list!.rows).toHaveLength(1);
  });
  it("sample data: 2 valid rows, at the path", () => {
    const atPath = { ...securities, list: { ...securities.list!, path: "portfolio.items" } };
    const mock = mockResponse([atPath], "2026-11-21");
    const rows = (mock.portfolio as { items: unknown[] }).items;
    expect(rows).toHaveLength(2);
    expect(mapResponse([atPath], mock).values[0].status).toBe("ok");
  });
  it("checks list definitions", () => {
    expect(listSpecProblem(securities.list!)).toBeNull();
    expect(listSpecProblem({ path: "", columns: [] })).toMatch(/mindestens eine Spalte/);
    expect(listSpecProblem({ path: "a..b", columns: securities.list!.columns })).toMatch(/Pfad/);
    expect(listSpecProblem({ path: "", columns: [securities.list!.columns[0], { ...securities.list!.columns[0], attribute: "isin" }] })).toMatch(/zweimal/);
    expect(listSpecProblem({ path: "", columns: [{ attribute: "X", attributeType: "list", options: [] }] })).toMatch(/Option/);
  });
});

describe("randomResponse (Mock services)", () => {
  // deterministic generator for the test
  const seq = (...xs: number[]) => {
    let i = 0;
    return () => xs[i++ % xs.length];
  };
  const defs = [
    { id: "1", attribute: "Saldo", attributeType: "num" as const, options: [] },
    { id: "2", attribute: "VIP", attributeType: "bool" as const, options: [] },
    { id: "3", attribute: "Stufe", attributeType: "list" as const, options: ["Gold", "Silber"] },
    { id: "4", attribute: "Seit", attributeType: "date" as const, options: [] },
    { id: "5", attribute: "Depot", attributeType: "alpha" as const, options: [], list: { path: "", columns: [{ attribute: "ISIN", attributeType: "alpha" as const, options: [] }] } },
  ];
  it("gives a valid random value per GET attribute", () => {
    const json = randomResponse(defs, "2026-11-22", seq(0.5, 0.2, 0.9, 0.5, 0.1, 0.3));
    const mapped = mapResponse(defs, json).values;
    expect(mapped.every((m) => m.status === "ok")).toBe(true);
    expect(typeof json.Saldo).toBe("number");
    expect(["Gold", "Silber"]).toContain(json.Stufe);
    expect(String(json.Seit)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(json.Depot)).toBe(true);
  });
  it("differs between calls", () => {
    const a = randomResponse(defs);
    const b = randomResponse(defs);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe("randomResponse with customer numbers", () => {
  const ids = ["c1", "c2", "c3"];
  const defs: ServiceAttrDef[] = [
    { id: "1", attribute: "Kundennummer", attributeType: "alpha", options: [] },
    { id: "2", attribute: "Hypothek", attributeType: "alpha", options: [] },
    {
      id: "3",
      attribute: "Treffer",
      attributeType: "alpha",
      options: [],
      list: { path: "", columns: [{ attribute: "Kunden-Nr.", attributeType: "alpha", options: [] }] },
    },
  ];
  it("recognises customer number names", () => {
    expect(["Kundennummer", "Kunden-Nr.", "KundenId", "customer_id", "Kunde"].every(isCustomerNumberAttribute)).toBe(true);
    expect(isCustomerNumberAttribute("Kundensegment")).toBe(false);
    expect(usesCustomerNumbers(defs)).toBe(true);
    expect(usesCustomerNumbers([defs[1]])).toBe(false);
  });
  it("takes them from the given customers, other text stays random", () => {
    for (let i = 0; i < 20; i++) {
      const json = randomResponse(defs, "2026-11-24", Math.random, { kind: "customer", values: ids }) as { Kundennummer: string; Hypothek: string; Treffer: { "Kunden-Nr.": string }[] };
      expect(ids).toContain(json.Kundennummer);
      expect(ids).not.toContain(json.Hypothek);
      // the rows use different customers as long as there are enough
      const rows = json.Treffer.map((r) => r["Kunden-Nr."]);
      expect(rows.every((r) => ids.includes(r))).toBe(true);
    }
  });
  it("random text without customers", () => {
    expect(["c1", "c2", "c3"]).not.toContain((randomResponse(defs) as { Kundennummer: string }).Kundennummer);
  });
});

describe("isIdAttribute per kind", () => {
  it("knows position and transaction numbers", () => {
    expect(["Positionsnummer", "Positions-Nr.", "positionId"].every((n) => isIdAttribute("position", n))).toBe(true);
    expect(["Transaktionsnummer", "Transaktions-ID", "trx_id"].every((n) => isIdAttribute("transaction", n))).toBe(true);
    expect(isIdAttribute("position", "Kundennummer")).toBe(false);
    expect(isIdAttribute("customer", "Positionsnummer")).toBe(false);
    // a plain «ID» belongs to whichever kind is asked
    expect(["customer", "position", "transaction"].every((k) => isIdAttribute(k as "customer", "ID"))).toBe(true);
  });
  it("mock answer fills the kind's attribute", () => {
    const defs: ServiceAttrDef[] = [
      { id: "1", attribute: "Positionsnummer", attributeType: "alpha", options: [] },
      { id: "2", attribute: "Kundennummer", attributeType: "alpha", options: [] },
    ];
    const json = randomResponse(defs, "2026-11-25", Math.random, { kind: "position", values: ["P1"] }) as Record<string, string>;
    expect(json.Positionsnummer).toBe("P1");
    expect(json.Kundennummer).not.toBe("P1");
  });
});
