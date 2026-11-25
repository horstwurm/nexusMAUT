// Journey types (fixed codes), shared by server and pages.

export const JOURNEY_TYPES = ["campaign", "event"] as const;
export type JourneyType = (typeof JOURNEY_TYPES)[number];

export const JOURNEY_TYPE_LABELS: Record<JourneyType, string> = {
  campaign: "Kampagne",
  event: "Event",
};

/** Journeys saved before the type existed are campaigns. */
export const journeyTypeOf = (j: { journeyType?: JourneyType | null }): JourneyType => j.journeyType ?? "campaign";
