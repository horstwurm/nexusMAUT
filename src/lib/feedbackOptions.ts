// Feedback options of a journey step (relation journeyStepFeedbackOptions):
// the answers a customer can give, each with a fixed meaning – from the
// strongest sales signal (Lead) to none (Kein Interesse).

export const FEEDBACK_MEANINGS = ["LEAD", "CHANCE", "INTEREST", "INDIFFERENT", "NO_INTEREST_NOW", "NO_INTEREST"] as const;
export type FeedbackMeaning = (typeof FEEDBACK_MEANINGS)[number];

export const MEANING_INFO: Record<FeedbackMeaning, { label: string; badge: string }> = {
  LEAD: { label: "Lead", badge: "badge-ok" },
  CHANCE: { label: "Chance", badge: "badge-ok" },
  INTEREST: { label: "Interesse", badge: "badge-accent" },
  INDIFFERENT: { label: "Indifferent", badge: "" },
  NO_INTEREST_NOW: { label: "Kein Interesse aktuell", badge: "badge-warn" },
  NO_INTEREST: { label: "Kein Interesse", badge: "badge-danger" },
};

/** The first meanings (OK / WARN / NOK, until 2026-11-23) → today's; `init` converts stored options once. */
export const OLD_MEANINGS: Record<string, FeedbackMeaning> = { OK: "INTEREST", WARN: "INDIFFERENT", NOK: "NO_INTEREST" };
