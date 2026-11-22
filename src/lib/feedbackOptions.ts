// Feedback options of a journey step (relation journeyStepFeedbackOptions):
// the answers a customer can give, each with a fixed meaning.

export const FEEDBACK_MEANINGS = ["OK", "WARN", "NOK"] as const;
export type FeedbackMeaning = (typeof FEEDBACK_MEANINGS)[number];

export const MEANING_INFO: Record<FeedbackMeaning, { label: string; badge: string }> = {
  OK: { label: "OK", badge: "badge-ok" },
  WARN: { label: "Warnung", badge: "badge-warn" },
  NOK: { label: "Nicht OK", badge: "badge-danger" },
};
