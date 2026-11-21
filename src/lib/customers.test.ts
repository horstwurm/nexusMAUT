import { describe, expect, it } from "vitest";
import { dateOfBirthError, dayFromDb, dayToDb, formatDay } from "./customers";

const TODAY = "2026-11-20";

describe("dateOfBirthError", () => {
  it("accepts real past days", () => {
    expect(dateOfBirthError("1990-04-01", TODAY)).toBeNull();
    expect(dateOfBirthError("2000-02-29", TODAY)).toBeNull(); // leap year
    expect(dateOfBirthError(TODAY, TODAY)).toBeNull();
  });
  it("refuses impossible, future, too old and malformed dates", () => {
    expect(dateOfBirthError("2023-02-29", TODAY)).toMatch(/Ungültig/);
    expect(dateOfBirthError("1990-13-01", TODAY)).toMatch(/Ungültig/);
    expect(dateOfBirthError("2026-11-21", TODAY)).toMatch(/Zukunft/);
    expect(dateOfBirthError("1899-12-31", TODAY)).toMatch(/1900/);
    expect(dateOfBirthError("1.4.1990", TODAY)).toMatch(/JJJJ/);
  });
});

describe("day conversion", () => {
  it("stores UTC midnight and reads it back", () => {
    expect(dayToDb("1990-04-01").toISOString()).toBe("1990-04-01T00:00:00.000Z");
    expect(dayFromDb(dayToDb("1990-04-01"))).toBe("1990-04-01");
    expect(formatDay("1990-04-01")).toBe("01.04.1990");
  });
});
