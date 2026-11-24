import { describe, expect, it } from "vitest";
import { fromJson, fromTables, guessAttribute, normalizeRaw, parseCsv, tableFromGrid } from "./uploadData";

describe("parseCsv", () => {
  it("reads «;» with quotes, BOM and CRLF", () => {
    expect(parseCsv('﻿a;b;c\r\n1;"x;y";"sagt ""hallo"""\r\n2;;\r\n')).toEqual([
      ["a", "b", "c"],
      ["1", "x;y", 'sagt "hallo"'],
      ["2", "", ""],
    ]);
  });
  it("detects «,» and keeps line breaks in quotes", () => {
    expect(parseCsv('a,b\n"zwei\nZeilen",3')).toEqual([
      ["a", "b"],
      ["zwei\nZeilen", "3"],
    ]);
  });
});

describe("fromTables", () => {
  const tables = [
    tableFromGrid("typen", [
      ["typ", "bezeichnung", "ebene", "attribut", "attributtyp", "optionen"],
      ["konto", "Privatkonto", "Position", "Saldo", "num", ""],
      ["konto", "Privatkonto", "Transaktion", "Art", "list", "Ein|Aus"],
      ["konto", "Privatkonto", "Position", "Kaputt", "zahl", ""],
    ]),
    tableFromGrid("Kunden", [
      ["Kundennummer", "Vorname", "Nachname", "Geburtsdatum", "anrede"],
      ["K1", "Anna", "Muster", "1980-05-01", "Frau"],
      ["", "", "", "", ""],
    ]),
    tableFromGrid("positionen", [
      ["positionsnummer", "kundennummer", "typ", "produkt", "Saldo"],
      ["P1", "K1", "Konto", "Lohnkonto", "1200.5"],
    ]),
    tableFromGrid("transaktionen", [
      ["transaktionsnummer", "positionsnummer", "kundennummer", "typ", "Art"],
      [1, "P1", "K1", "konto", "Ein"],
    ]),
  ];
  const d = fromTables(tables);
  it("reads types with attributes per level and reports unknown attribute types", () => {
    expect(d.types).toEqual([
      { code: "konto", label: "Privatkonto", position: [{ name: "Saldo", type: "num", options: [] }], trx: [{ name: "Art", type: "list", options: ["Ein", "Aus"] }] },
    ]);
    expect(d.problems).toEqual([expect.stringContaining("«Kaputt» hat den unbekannten Typ «zahl»")]);
  });
  it("maps fixed columns case-insensitively, the rest are attributes; empty rows dropped", () => {
    expect(d.customers).toEqual([{ row: 2, key: "K1", name: "Anna", lastname: "Muster", dateOfBirth: "1980-05-01", attributes: { anrede: "Frau" } }]);
    expect(d.positions).toEqual([{ row: 2, key: "P1", customerKey: "K1", type: "konto", product: "Lohnkonto", values: { Saldo: "1200.5" } }]);
    expect(d.transactions).toEqual([{ row: 2, key: "1", positionKey: "P1", values: { Art: "Ein" } }]);
  });
  it("needs the customers table", () => {
    expect(fromTables([]).problems).toEqual(["Tabelle «Kunden» fehlt"]);
  });
});

describe("fromJson", () => {
  it("reads the JSON format with «werte»", () => {
    const d = fromJson({
      typen: [{ code: "depot", bezeichnung: "Depot", positionsattribute: [{ attribut: "Wert", attributtyp: "num" }], transaktionsattribute: [] }],
      kunden: [{ kundennummer: "K1", vorname: "Beat", nachname: "Beispiel", geburtsdatum: "1970-01-02", anrede: "Herr" }],
      positionen: [{ positionsnummer: "P1", kundennummer: "K1", typ: "depot", produkt: "Fondsdepot", werte: { Wert: 10 } }],
      transaktionen: [],
    });
    expect(d.problems).toEqual([]);
    expect(d.types?.[0]).toEqual({ code: "depot", label: "Depot", position: [{ name: "Wert", type: "num", options: [] }], trx: [] });
    expect(d.customers[0]).toMatchObject({ row: 1, key: "K1", attributes: { anrede: "Herr" } });
    expect(d.positions[0].values).toEqual({ Wert: 10 });
  });
  it("reports a missing customer list", () => {
    expect(fromJson({}).problems).toEqual(["JSON: Liste «kunden» fehlt"]);
  });
});

describe("normalizeRaw", () => {
  it("dates, booleans, numbers as text", () => {
    expect(normalizeRaw("24.11.2026", "date")).toBe("2026-11-24");
    expect(normalizeRaw(new Date("2026-01-05T00:00:00Z"), "date")).toBe("2026-01-05");
    expect(normalizeRaw("ja", "bool")).toBe(true);
    expect(normalizeRaw("Nein", "bool")).toBe(false);
    expect(normalizeRaw(1, "bool")).toBe(true);
    expect(normalizeRaw("vielleicht", "bool")).toBe("vielleicht");
    expect(normalizeRaw(42, "alpha")).toBe("42");
  });
});

describe("guessAttribute", () => {
  it("list for few texts, otherwise by type", () => {
    expect(guessAttribute(["Frau", "Herr", "Frau", ""])).toEqual({ type: "list", options: ["Frau", "Herr"] });
    expect(guessAttribute(["1'200", "3.5"])).toEqual({ type: "num", options: [] });
    expect(guessAttribute(["ja", "nein"])).toEqual({ type: "bool", options: [] });
    expect(guessAttribute(["01.02.1990"])).toEqual({ type: "date", options: [] });
  });
});
