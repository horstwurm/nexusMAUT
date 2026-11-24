// When an event's trigger service is due again (pure, tested) – shared by the timer and the page.
import type { UpdateFrequency } from "@/lib/events";

/** a call up to this much early still counts (the timer ticks every minute) */
export const DUE_TOLERANCE_MS = 60_000;

/** When the next automatic call is due after `last` (null = «Manuell», never automatic). */
export function nextDueAt(frequency: UpdateFrequency, last: Date | null): Date | null {
  if (frequency === "manual") return null;
  if (!last) return new Date(0); // never called: due now
  const next = new Date(last);
  if (frequency === "hourly") next.setTime(next.getTime() + 3_600_000);
  else if (frequency === "daily") next.setTime(next.getTime() + 86_400_000);
  else if (frequency === "weekly") next.setTime(next.getTime() + 7 * 86_400_000);
  else {
    // monthly: same day next month, clamped to its last day (31.1. → 28./29.2.)
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  return next;
}

/** Due for an automatic call at `now`? */
export function isDue(frequency: UpdateFrequency, last: Date | null, now: Date) {
  const next = nextDueAt(frequency, last);
  return next !== null && next.getTime() - DUE_TOLERANCE_MS <= now.getTime();
}
