// Attributes of a product/service type, shared by server and pages. Two
// relations of productServiceType (1:n) with the same shape:
//   position – productServiceTypePositionAttributes (values in product positions)
//   trx      – productServiceTypeTrxAttributes (transaction attributes)

export const ATTRIBUTE_KINDS = {
  position: {
    relation: "productServiceTypePositionAttributes",
    path: "position-attributes",
    title: "Positionsattribute",
    hint: "Angaben pro Position eines Produkts / einer Dienstleistung dieses Typs, z.B. Laufzeit (Zahl) oder Stufe (Auswahlliste).",
  },
  trx: {
    relation: "productServiceTypeTrxAttributes",
    path: "trx-attributes",
    title: "Transaktionsattribute",
    hint: "Angaben zu Transaktionen von Produkten / Dienstleistungen dieses Typs, z.B. Betrag (Zahl) oder Kanal (Auswahlliste).",
  },
} as const;

export type AttributeKind = keyof typeof ATTRIBUTE_KINDS;
export const ATTRIBUTE_KIND_NAMES = Object.keys(ATTRIBUTE_KINDS) as AttributeKind[];

/** The kind from an API path segment ("position-attributes" / "trx-attributes"), or null. */
export const kindFromPath = (segment: string) => ATTRIBUTE_KIND_NAMES.find((k) => ATTRIBUTE_KINDS[k].path === segment) ?? null;

export const ATTRIBUTE_TYPES = {
  alpha: "Text",
  num: "Zahl",
  date: "Datum",
  bool: "Ja/Nein",
  list: "Auswahlliste",
} as const;

export type AttributeType = keyof typeof ATTRIBUTE_TYPES;
export const ATTRIBUTE_TYPE_NAMES = Object.keys(ATTRIBUTE_TYPES) as AttributeType[];

export const MAX_OPTIONS = 100;

/** Options of a list attribute: trimmed, without empty ones and duplicates (case-insensitive), order kept. */
export function normalizeOptions(options: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of options) {
    const o = raw.trim();
    if (!o || seen.has(o.toLowerCase())) continue;
    seen.add(o.toLowerCase());
    out.push(o);
  }
  return out;
}

/** Problem with an attribute definition, or null. Only `list` has options – and needs at least one. */
export function attributeDefinitionError(attributeType: AttributeType, options: string[]): string | null {
  if (attributeType === "list") {
    if (options.length === 0) return "Auswahlliste: mindestens eine Option";
    if (options.length > MAX_OPTIONS) return `Auswahlliste: höchstens ${MAX_OPTIONS} Optionen`;
    return null;
  }
  return options.length ? "Optionen gibt es nur bei Auswahllisten" : null;
}
