// Status of a KundenJourney step. Unfinished: Vorschlag → Bereit zur
// Ausführung, or Ausgesetzt; finished: Erledigt (content rendered for the
// customer and kept) or Übersprungen. A run is done when all steps are finished.

export const STEP_STATUSES = ["proposal", "ready", "suspended", "done", "skipped"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** not finished yet – keep the run active, count as «open» */
export const OPEN_STEP_STATUSES = ["proposal", "ready", "suspended"] as const satisfies readonly StepStatus[];
export const isOpenStep = (s: StepStatus) => (OPEN_STEP_STATUSES as readonly StepStatus[]).includes(s);

export const STEP_STATUS_INFO: Record<StepStatus, { label: string; badge: string }> = {
  proposal: { label: "Vorschlag", badge: "" },
  ready: { label: "Bereit zur Ausführung", badge: "badge-accent" },
  suspended: { label: "Ausgesetzt", badge: "badge-warn" },
  done: { label: "Erledigt", badge: "badge-ok" },
  skipped: { label: "Übersprungen", badge: "" },
};
