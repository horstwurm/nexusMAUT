import { describe, expect, it } from "vitest";
import { isDue, nextDueAt } from "./eventSchedule";

const d = (iso: string) => new Date(iso);

describe("nextDueAt", () => {
  it("adds the interval to the last call", () => {
    expect(nextDueAt("hourly", d("2026-11-24T10:00:00Z"))).toEqual(d("2026-11-24T11:00:00Z"));
    expect(nextDueAt("daily", d("2026-11-24T10:00:00Z"))).toEqual(d("2026-11-25T10:00:00Z"));
    expect(nextDueAt("weekly", d("2026-11-24T10:00:00Z"))).toEqual(d("2026-12-01T10:00:00Z"));
  });
  it("monthly keeps the day, clamped to the month's end", () => {
    expect(nextDueAt("monthly", d("2026-11-24T10:00:00Z"))).toEqual(d("2026-12-24T10:00:00Z"));
    expect(nextDueAt("monthly", d("2027-01-31T08:00:00Z"))).toEqual(d("2027-02-28T08:00:00Z"));
    expect(nextDueAt("monthly", d("2026-12-15T08:00:00Z"))).toEqual(d("2027-01-15T08:00:00Z"));
  });
  it("never called = due now, manual = never", () => {
    expect(nextDueAt("daily", null)).toEqual(new Date(0));
    expect(nextDueAt("manual", d("2026-11-24T10:00:00Z"))).toBeNull();
    expect(nextDueAt("manual", null)).toBeNull();
  });
});

describe("isDue", () => {
  const last = d("2026-11-24T10:00:00Z");
  it("due from the interval on, a minute early still counts", () => {
    expect(isDue("hourly", last, d("2026-11-24T10:58:00Z"))).toBe(false);
    expect(isDue("hourly", last, d("2026-11-24T10:59:30Z"))).toBe(true);
    expect(isDue("hourly", last, d("2026-11-24T12:00:00Z"))).toBe(true);
  });
  it("never called is due, manual never", () => {
    expect(isDue("weekly", null, last)).toBe(true);
    expect(isDue("manual", null, last)).toBe(false);
  });
});
