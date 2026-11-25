// Events (Ereignisse): shared by server and pages.

/** Code of the service type (value list «Servicetypen») whose services may trigger events. */
export const TRIGGER_SERVICE_TYPE = "triggerservice";

/** What the IDs in a trigger service's answer refer to (`idRef`): Kundennummer, Positionsnummer or Transaktionsnummer. */
export const ID_REFS = ["customer", "position", "transaction"] as const;
export type IdRef = (typeof ID_REFS)[number];

export const ID_REF_LABELS: Record<IdRef, string> = {
  customer: "Kunde",
  position: "Position",
  transaction: "Transaktion",
};

/** Events saved before the field existed refer to customers. */
export const idRefOf = (e: { idRef?: IdRef | null }): IdRef => e.idRef ?? "customer";

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
