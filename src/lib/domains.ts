// Admin-managed value lists ("domains"), shared by server and pages.

export const DOMAINS = {
  productServiceType: {
    title: "Produkt- und Dienstleistungstypen",
    field: "Typ",
    hint: "Typen für «Produkte und Dienstleistungen» der Kunden, z.B. Abonnement, Beratung.",
  },
  comPrefs: {
    title: "Kommunikationspräferenzen",
    field: "Art",
    hint: "Arten für die «Kommunikationspräferenzen» der Kunden, z.B. E-Mail, Telefon, Post.",
  },
  serviceType: {
    title: "Servicetypen",
    field: "Typ",
    hint: "Typen für die «Services», z.B. REST, Webhook, Datei-Export.",
  },
} as const;

export type DomainName = keyof typeof DOMAINS;
export const DOMAIN_NAMES = Object.keys(DOMAINS) as DomainName[];

/** Codes: lower-case letters, digits, - and _, starting with a letter or digit. */
export const CODE_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** A code proposal from a label: "Beratung vor Ort" → "beratung-vor-ort". */
export function codeFromLabel(label: string) {
  return label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Label of a code, or the code itself when unknown (deleted value). */
export const labelOf = (values: { code: string; label: string }[], code: string) =>
  values.find((v) => v.code === code)?.label ?? code;
