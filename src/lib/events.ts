// Events (Ereignisse): shared by server and pages.

/** Code of the service type (value list «Servicetypen») whose services may trigger events. */
export const TRIGGER_SERVICE_TYPE = "triggerservice";

/** How often an event's trigger service is to be asked – fixed codes, labels for the page. */
export const UPDATE_FREQUENCIES = ["hourly", "daily", "weekly", "monthly", "manual"] as const;
export type UpdateFrequency = (typeof UPDATE_FREQUENCIES)[number];

export const UPDATE_FREQUENCY_LABELS: Record<UpdateFrequency, string> = {
  hourly: "Stündlich",
  daily: "Täglich",
  weekly: "Wöchentlich",
  monthly: "Monatlich",
  manual: "Manuell",
};
