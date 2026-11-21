// Services: the two attribute relations, shared by server and pages.

export const SERVICE_ATTRIBUTE_KINDS = {
  put: { path: "put-attributes", title: "PUT-Attribute", hint: "Was der Service entgegennimmt (Eingabe), z.B. Kundennummer (Text), Betrag (Zahl)." },
  get: { path: "get-attributes", title: "GET-Attribute", hint: "Was der Service liefert (Ausgabe), z.B. Status (Auswahlliste), Datum (Datum)." },
} as const;
export type ServiceAttributeKind = keyof typeof SERVICE_ATTRIBUTE_KINDS;

/** The kind from an API path segment ("put-attributes" / "get-attributes"), or null. */
export const serviceKindFromPath = (segment: string) =>
  (Object.keys(SERVICE_ATTRIBUTE_KINDS) as ServiceAttributeKind[]).find((k) => SERVICE_ATTRIBUTE_KINDS[k].path === segment) ?? null;
