// Placeholders in journey step contents: {{Kunde.Vorname}}, {{Kunde.<customer
// attribute>}}, {{Produkt.Name}}, {{Position.<type code>.<attribute>}},
// {{Transaktion.<type code>.<attribute>}}, {{Service.<service name>.<GET
// attribute>}} (what a service returns).
// List results of a service (GET attribute of type «Liste»):
//   {{Service.S.L.Anzahl}}  {{Service.S.L.Summe(Spalte)}}  {{Service.S.L.Erste.Spalte}}
//   {{#Service.S.L}} … {{Spalte}} … {{/Service.S.L}}   – repeated per row (one level)
// The catalog lists what exists (built from the attributes defined in Admin);
// unknown ones are flagged. Shared by server and editor; case-insensitive.

import type { AttributeType } from "./typeAttributes";

export type PlaceholderKind = "value" | "count" | "sum" | "first" | "block";

export type Placeholder = {
  /** the token, e.g. {{Position.konto.Saldo}} – for blocks the start {{#Service.S.L}} */
  token: string;
  /** the attribute / field it reads, e.g. «Saldo»; for list items the list attribute */
  attribute: string;
  /** shown in the picker, e.g. «Saldo» */
  label: string;
  /** value type (for the hint) */
  type: AttributeType;
  /** list results: what is read (missing = a plain value) */
  kind?: PlaceholderKind;
  /** list results: the column (sum / first) */
  column?: string;
  /** blocks: the list's columns (usable as {{Spalte}} inside) */
  columns?: string[];
  /** what the picker inserts, when it isn't the token (blocks: start, a sample line, end) */
  insert?: string;
};

export const CATEGORIES = ["Kunde", "Produkte", "Positionen", "Transaktionen", "Services"] as const;
export type PlaceholderCategory = (typeof CATEGORIES)[number];

export type PlaceholderGroup = { id: string; category: PlaceholderCategory; label: string; items: Placeholder[] };

type Attr = { attribute: string; attributeType: AttributeType };
/** a service GET attribute – a value, or a list with columns */
type ServiceGetAttr = Attr & { list?: { columns: Attr[] } | null };
export type CatalogInput = {
  customerAttributes: Attr[];
  /** product/service types: code + label */
  types: { code: string; label: string }[];
  /** type code → position / transaction attributes */
  positionAttributes: Record<string, Attr[]>;
  trxAttributes: Record<string, Attr[]>;
  /** services with what they return (GET attributes, values and lists) */
  services: { name: string; getAttributes: ServiceGetAttr[] }[];
};

export const token = (...path: string[]) => `{{${path.join(".")}}}`;

/** The placeholders of a list result: block, count, sum per number column, first row per column. */
function listItems(service: string, a: ServiceGetAttr & { list: { columns: Attr[] } }): Placeholder[] {
  const name = `Service.${service}.${a.attribute}`;
  const cols = a.list.columns;
  const sampleLine = `– ${cols.map((c) => `{{${c.attribute}}}`).join(" · ")}`;
  return [
    {
      token: `{{#${name}}}`,
      attribute: a.attribute,
      label: `${a.attribute}: Block (eine Zeile pro Eintrag)`,
      type: "alpha",
      kind: "block",
      columns: cols.map((c) => c.attribute),
      insert: `{{#${name}}}\n${sampleLine}\n{{/${name}}}`,
    },
    { token: `{{${name}.Anzahl}}`, attribute: a.attribute, label: `${a.attribute}: Anzahl`, type: "num", kind: "count" },
    ...cols
      .filter((c) => c.attributeType === "num")
      .map((c): Placeholder => ({
        token: `{{${name}.Summe(${c.attribute})}}`,
        attribute: a.attribute,
        label: `${a.attribute}: Summe ${c.attribute}`,
        type: "num",
        kind: "sum",
        column: c.attribute,
      })),
    ...cols.map((c): Placeholder => ({
      token: `{{${name}.Erste.${c.attribute}}}`,
      attribute: a.attribute,
      label: `${a.attribute}: erste Zeile · ${c.attribute}`,
      type: c.attributeType,
      kind: "first",
      column: c.attribute,
    })),
  ];
}

/** All placeholders, grouped: Kunde, Produkt, one group per type for positions and transactions, one per service. */
export function buildCatalog(input: CatalogInput): PlaceholderGroup[] {
  const groups: PlaceholderGroup[] = [
    {
      id: "kunde",
      category: "Kunde",
      label: "Kunde",
      items: [
        { token: token("Kunde", "Vorname"), attribute: "Vorname", label: "Vorname", type: "alpha" },
        { token: token("Kunde", "Nachname"), attribute: "Nachname", label: "Nachname", type: "alpha" },
        { token: token("Kunde", "Geburtsdatum"), attribute: "Geburtsdatum", label: "Geburtsdatum", type: "date" },
        { token: token("Kunde", "Alter"), attribute: "Alter", label: "Alter (berechnet)", type: "num" },
        ...input.customerAttributes
          // a customer attribute named like a built-in field would be ambiguous – the built-in wins
          .filter((a) => !["vorname", "nachname", "geburtsdatum", "alter"].includes(a.attribute.toLowerCase()))
          .map((a) => ({ token: token("Kunde", a.attribute), attribute: a.attribute, label: a.attribute, type: a.attributeType })),
      ],
    },
    {
      id: "produkt",
      category: "Produkte",
      label: "Produkte und Dienstleistungen",
      items: [
        { token: token("Produkt", "Name"), attribute: "Name", label: "Name", type: "alpha" },
        { token: token("Produkt", "Typ"), attribute: "Typ", label: "Typ", type: "alpha" },
      ],
    },
  ];
  for (const [prefix, idPrefix, labelPrefix, category, attrs] of [
    ["Position", "position", "Position", "Positionen", input.positionAttributes],
    ["Transaktion", "trx", "Transaktion", "Transaktionen", input.trxAttributes],
  ] as const) {
    for (const t of input.types) {
      const list = attrs[t.code] ?? [];
      if (!list.length) continue;
      groups.push({
        id: `${idPrefix}:${t.code}`,
        category,
        label: `${labelPrefix} – ${t.label}`,
        items: list.map((a) => ({ token: token(prefix, t.code, a.attribute), attribute: a.attribute, label: a.attribute, type: a.attributeType })),
      });
    }
  }
  for (const s of input.services) {
    if (!s.getAttributes.length) continue;
    groups.push({
      id: `service:${s.name}`,
      category: "Services",
      label: `Service – ${s.name}`,
      items: s.getAttributes.flatMap((a) =>
        a.list
          ? listItems(s.name, a as ServiceGetAttr & { list: { columns: Attr[] } })
          : [{ token: token("Service", s.name, a.attribute), attribute: a.attribute, label: a.attribute, type: a.attributeType }],
      ),
    });
  }
  return groups;
}

// --- parsing --------------------------------------------------------------------------------

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const normToken = (t: string) => t.replace(/\s+/g, " ").replace(/\{\{\s*|\s*\}\}/g, "").toLowerCase();

export type TemplateNode =
  | { t: "text"; text: string }
  | { t: "ph"; token: string }
  /** {{#X}} … {{/X}}; `closed` false when the end is missing */
  | { t: "block"; token: string; name: string; children: TemplateNode[]; closed: boolean }
  /** {{/X}} without a start, or a block inside a block */
  | { t: "stray"; token: string; why: string };

/** Parses a text into text, placeholders and blocks (one level). */
export function parseTemplate(text: string): TemplateNode[] {
  const root: TemplateNode[] = [];
  let block: Extract<TemplateNode, { t: "block" }> | null = null;
  let last = 0;
  const add = (n: TemplateNode) => (block ? block.children : root).push(n);
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if (m.index! > last) add({ t: "text", text: text.slice(last, m.index) });
    last = m.index! + m[0].length;
    const inner = m[1].trim();
    if (inner.startsWith("#")) {
      if (block) add({ t: "stray", token: m[0], why: "Block im Block ist nicht möglich" });
      else {
        block = { t: "block", token: m[0], name: inner.slice(1).trim(), children: [], closed: false };
        root.push(block);
      }
    } else if (inner.startsWith("/")) {
      if (block && normToken(inner.slice(1)) === normToken(block.name)) {
        block.closed = true;
        block = null;
      } else add({ t: "stray", token: m[0], why: block ? "passt nicht zum offenen Block" : "Block-Ende ohne Anfang" });
    } else add({ t: "ph", token: m[0] });
  }
  if (last < text.length) add({ t: "text", text: text.slice(last) });
  return root;
}

/** The placeholders used in a text (as written, without duplicates, in order). */
export function findPlaceholders(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const t = `{{${m[1].trim()}}}`;
    if (!seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

/** The catalog entry (group + placeholder) of a token as written, or null. */
export function lookupPlaceholder(catalog: PlaceholderGroup[], written: string) {
  const want = normToken(written);
  for (const g of catalog) for (const p of g.items) if (normToken(p.token) === want) return { group: g, item: p };
  return null;
}

/** The block definition of a block start ({{#Service.S.L}}), or null. */
const lookupBlock = (catalog: PlaceholderGroup[], startToken: string) => {
  const found = lookupPlaceholder(catalog, startToken);
  return found?.item.kind === "block" ? found : null;
};

const isColumn = (columns: string[] | undefined, written: string) => !!columns?.some((c) => c.toLowerCase() === normToken(written));

/**
 * Problems in a text: unknown placeholders, unknown blocks, column names a
 * block doesn't have, blocks not closed, ends without a start.
 */
export function unknownPlaceholders(text: string, catalog: PlaceholderGroup[]): string[] {
  const out = new Set<string>();
  const known = (tok: string) => {
    const f = lookupPlaceholder(catalog, tok);
    return !!f && f.item.kind !== "block";
  };
  for (const n of parseTemplate(text)) {
    if (n.t === "ph" && !known(n.token)) out.add(n.token);
    if (n.t === "stray") out.add(n.token);
    if (n.t === "block") {
      const b = lookupBlock(catalog, n.token);
      if (!b) out.add(n.token);
      if (!n.closed) out.add(`${n.token} (nicht geschlossen)`);
      for (const c of n.children) {
        if (c.t === "ph" && !isColumn(b?.item.columns, c.token) && !known(c.token)) out.add(c.token);
        if (c.t === "stray") out.add(c.token);
      }
    }
  }
  return [...out];
}

/** The catalog groups a text uses (placeholders, blocks and global placeholders inside blocks). */
export function usedGroups(text: string, catalog: PlaceholderGroup[]): Set<string> {
  const ids = new Set<string>();
  const visit = (nodes: TemplateNode[]) => {
    for (const n of nodes) {
      if (n.t === "ph") {
        const f = lookupPlaceholder(catalog, n.token);
        if (f) ids.add(f.group.id);
      } else if (n.t === "block") {
        const b = lookupBlock(catalog, n.token);
        if (b) ids.add(b.group.id);
        visit(n.children);
      }
    }
  };
  visit(parseTemplate(text));
  return ids;
}

// --- rendering (test / preview) ------------------------------------------------------------

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "placeholder"; token: string; value: string | null; note?: string };

export type ValueOf = (group: PlaceholderGroup, item: Placeholder) => { value: string | null; note?: string };
/** A block's rows: formatted value per column (null = none); `note` e.g. «Beispieldaten». */
export type RowsOf = (group: PlaceholderGroup, item: Placeholder) => { rows: Record<string, string | null>[]; note?: string };

/**
 * Renders a text into plain parts and filled placeholders. Blocks repeat
 * their content per row, {{Spalte}} filled from the row. Unknown or broken
 * parts stay unfilled with a note.
 */
export function renderPlaceholders(text: string, catalog: PlaceholderGroup[], valueOf: ValueOf, rowsOf?: RowsOf): Segment[] {
  const out: Segment[] = [];
  const placeholder = (tok: string): Segment => {
    const f = lookupPlaceholder(catalog, tok);
    if (!f || f.item.kind === "block") return { kind: "placeholder", token: tok, value: null, note: "unbekannter Platzhalter" };
    return { kind: "placeholder", token: tok, ...valueOf(f.group, f.item) };
  };
  for (const n of parseTemplate(text)) {
    if (n.t === "text") out.push({ kind: "text", text: n.text });
    else if (n.t === "ph") out.push(placeholder(n.token));
    else if (n.t === "stray") out.push({ kind: "placeholder", token: n.token, value: null, note: n.why });
    else {
      const b = lookupBlock(catalog, n.token);
      if (!b || !rowsOf) {
        out.push({ kind: "placeholder", token: n.token, value: null, note: b ? "keine Daten" : "unbekannter Block" });
        continue;
      }
      const { rows, note } = rowsOf(b.group, b.item);
      if (!rows.length) out.push({ kind: "placeholder", token: n.token, value: null, note: note ?? "leere Liste" });
      for (const row of rows) {
        for (const c of n.children) {
          if (c.t === "text") out.push({ kind: "text", text: c.text });
          else if (c.t === "stray") out.push({ kind: "placeholder", token: c.token, value: null, note: c.why });
          else if (c.t === "ph" && isColumn(b.item.columns, c.token)) {
            const col = b.item.columns!.find((x) => x.toLowerCase() === normToken(c.token))!;
            const v = row[col] ?? null;
            out.push({ kind: "placeholder", token: c.token, value: v, ...(v === null ? { note: "kein Wert in dieser Zeile" } : note ? { note } : {}) });
          } else if (c.t === "ph") out.push(placeholder(c.token));
        }
      }
      if (!n.closed) out.push({ kind: "placeholder", token: n.token, value: null, note: "Block nicht geschlossen" });
    }
  }
  return out;
}
