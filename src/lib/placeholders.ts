// Placeholders in journey step contents: {{Kunde.Vorname}}, {{Kunde.<customer
// attribute>}}, {{Produkt.Name}}, {{Position.<type code>.<attribute>}},
// {{Transaktion.<type code>.<attribute>}}, {{Service.<service name>.<GET
// attribute>}} (what a service returns).
// List results of a service (GET attribute of type «Liste»):
//   {{Service.S.L.Anzahl}}  {{Service.S.L.Summe(Spalte)}}  {{Service.S.L.Erste.Spalte}}
//   {{#Service.S.L}} … {{Spalte}} … {{/Service.S.L}}   – repeated per row (one level)
// Conditions: {{#Wenn Kunde.Anrede = "Frau"}} … {{#Sonst …}} … {{#Sonst}} … {{/Wenn}} (conditions.ts)
// The catalog lists what exists (built from the attributes defined in Admin);
// unknown ones are flagged. Shared by server and editor; case-insensitive.

import { conditionText, evaluateCondition, parseCondition } from "./conditions";
import type { AttributeType } from "./typeAttributes";

export type PlaceholderKind = "value" | "count" | "sum" | "first" | "block" | "textblock";

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
  /** list attributes: the options (offered by «Bedingung einfügen») */
  options?: string[];
};

export const CATEGORIES = ["Kunde", "Produkte", "Positionen", "Transaktionen", "Services", "Bausteine"] as const;
export type PlaceholderCategory = (typeof CATEGORIES)[number];

export type PlaceholderGroup = { id: string; category: PlaceholderCategory; label: string; items: Placeholder[] };

type Attr = { attribute: string; attributeType: AttributeType; options?: string[] };
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
  /** text building blocks (Admin → Textbausteine) – {{Baustein.code}} */
  textBlocks?: { code: string; label: string; category: string }[];
};

export const token = (...path: string[]) => `{{${path.join(".")}}}`;
const withOptions = (a: Attr) => (a.attributeType === "list" && a.options?.length ? { options: a.options } : {});

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
          .map((a) => ({ token: token("Kunde", a.attribute), attribute: a.attribute, label: a.attribute, type: a.attributeType, ...withOptions(a) })),
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
        items: list.map((a) => ({ token: token(prefix, t.code, a.attribute), attribute: a.attribute, label: a.attribute, type: a.attributeType, ...withOptions(a) })),
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
          : [{ token: token("Service", s.name, a.attribute), attribute: a.attribute, label: a.attribute, type: a.attributeType, ...withOptions(a) }],
      ),
    });
  }
  if (input.textBlocks?.length)
    groups.push({
      id: "bausteine",
      category: "Bausteine",
      label: "Textbausteine",
      items: input.textBlocks.map((b) => ({
        token: token("Baustein", b.code),
        attribute: b.code,
        label: b.category ? `${b.label} (${b.category})` : b.label,
        type: "alpha",
        kind: "textblock",
      })),
    });
  return groups;
}

// --- parsing --------------------------------------------------------------------------------

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const normToken = (t: string) => t.replace(/\s+/g, " ").replace(/\{\{\s*|\s*\}\}/g, "").toLowerCase();

export type TemplateBranch = {
  /** {{#Wenn …}} / {{#Sonst …}} as written */
  token: string;
  /** the condition text («Kunde.Anrede = "Frau"»); null = {{#Sonst}} without one */
  cond: string | null;
  children: TemplateNode[];
};

export type TemplateNode =
  | { t: "text"; text: string }
  | { t: "ph"; token: string }
  /** {{#X}} … {{/X}}; `closed` false when the end is missing */
  | { t: "block"; token: string; name: string; children: TemplateNode[]; closed: boolean }
  /** {{#Wenn …}} … {{#Sonst …}} … {{#Sonst}} … {{/Wenn}} (conditions.ts) */
  | { t: "if"; token: string; branches: TemplateBranch[]; closed: boolean }
  /** {{/X}} without a start, a block inside a block, a misplaced Wenn / Sonst */
  | { t: "stray"; token: string; why: string };

const IF_START = /^#\s*wenn\b\s*([\s\S]*)$/i;
const IF_ELSE = /^#\s*sonst\b\s*([\s\S]*)$/i;
const IF_END = /^\/\s*wenn\s*$/i;

/**
 * Parses a text into text, placeholders, blocks (one level) and conditions
 * (one level; a condition may contain blocks, a block no condition). A
 * Wenn / Sonst / Wenn-Ende tag alone on its line takes the whole line with it,
 * so conditional paragraphs leave no blank lines behind.
 */
export function parseTemplate(text: string): TemplateNode[] {
  const root: TemplateNode[] = [];
  let block: Extract<TemplateNode, { t: "block" }> | null = null;
  let cond: Extract<TemplateNode, { t: "if" }> | null = null;
  let last = 0;
  const target = () => (block ? block.children : cond ? cond.branches[cond.branches.length - 1].children : root);
  const add = (n: TemplateNode) => target().push(n);
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const inner = m[1].trim();
    const isIf = IF_START.test(inner) || IF_ELSE.test(inner) || IF_END.test(inner);
    let before = text.slice(last, m.index);
    let end = m.index! + m[0].length;
    if (isIf) {
      // standalone on its line → drop the line's indentation and its line break
      const lineStart = text.lastIndexOf("\n", m.index! - 1) + 1;
      const rest = text.slice(end);
      const nl = rest.indexOf("\n");
      if (lineStart >= last && !text.slice(lineStart, m.index).trim() && !(nl < 0 ? rest : rest.slice(0, nl)).trim()) {
        before = before.slice(0, before.length - (m.index! - lineStart));
        end += nl < 0 ? rest.length : nl + 1;
      }
    }
    if (before) add({ t: "text", text: before });
    last = end;
    const ifStart = IF_START.exec(inner);
    const ifElse = ifStart ? null : IF_ELSE.exec(inner);
    if (ifStart) {
      if (block || cond) add({ t: "stray", token: m[0], why: block ? "Bedingung im Block ist nicht möglich" : "Bedingung in einer Bedingung ist nicht möglich" });
      else {
        cond = { t: "if", token: m[0], branches: [{ token: m[0], cond: ifStart[1].trim(), children: [] }], closed: false };
        root.push(cond);
      }
    } else if (ifElse) {
      if (block) add({ t: "stray", token: m[0], why: "«Sonst» im Block ist nicht möglich" });
      else if (!cond) add({ t: "stray", token: m[0], why: "«Sonst» ohne «Wenn»" });
      else if (cond.branches[cond.branches.length - 1].cond === null) add({ t: "stray", token: m[0], why: "nach {{#Sonst}} ist kein weiteres «Sonst» möglich" });
      else cond.branches.push({ token: m[0], cond: ifElse[1].trim() || null, children: [] });
    } else if (IF_END.test(inner)) {
      if (block) add({ t: "stray", token: m[0], why: "Bedingungs-Ende im Block" });
      else if (!cond) add({ t: "stray", token: m[0], why: "Bedingungs-Ende ohne «Wenn»" });
      else {
        cond.closed = true;
        cond = null;
      }
    } else if (inner.startsWith("#")) {
      if (block) add({ t: "stray", token: m[0], why: "Block im Block ist nicht möglich" });
      else {
        const b: Extract<TemplateNode, { t: "block" }> = { t: "block", token: m[0], name: inner.slice(1).trim(), children: [], closed: false };
        add(b);
        block = b;
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

/** Is the token a condition tag ({{#Wenn …}}, {{#Sonst …}}, {{/Wenn}})? */
export const isConditionTag = (tok: string) => {
  const inner = tok.replace(/^\{\{\s*|\s*\}\}$/g, "");
  return IF_START.test(inner) || IF_ELSE.test(inner) || IF_END.test(inner);
};

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

/** A plain value placeholder (not a block) by its path as written in a condition («Kunde.Anrede»). */
const valueAt = (catalog: PlaceholderGroup[], path: string) => {
  const f = lookupPlaceholder(catalog, `{{${path}}}`);
  return f && f.item.kind !== "block" && f.item.kind !== "textblock" ? f : null;
};

/**
 * Problems in a text: unknown placeholders, unknown blocks, column names a
 * block doesn't have, blocks / conditions not closed, ends without a start,
 * conditions that can't be read or compare an unknown field.
 */
export function unknownPlaceholders(text: string, catalog: PlaceholderGroup[]): string[] {
  const out = new Set<string>();
  const known = (tok: string) => {
    const f = lookupPlaceholder(catalog, tok);
    return !!f && f.item.kind !== "block";
  };
  const visit = (nodes: TemplateNode[], columns?: string[]) => {
    for (const n of nodes) {
      if (n.t === "ph" && !isColumn(columns, n.token) && !known(n.token)) out.add(n.token);
      if (n.t === "stray") out.add(n.token);
      if (n.t === "block") {
        const b = lookupBlock(catalog, n.token);
        if (!b) out.add(n.token);
        if (!n.closed) out.add(`${n.token} (nicht geschlossen)`);
        visit(n.children, b?.item.columns ?? []);
      }
      if (n.t === "if") {
        if (!n.closed) out.add(`${n.token} (nicht geschlossen – {{/Wenn}} fehlt)`);
        for (const br of n.branches) {
          if (br.cond !== null) {
            const c = parseCondition(br.cond);
            if ("error" in c) out.add(`${br.token} (${c.error})`);
            else if (!valueAt(catalog, c.path)) out.add(`${br.token} (unbekanntes Feld «${c.path}»)`);
          }
          visit(br.children, columns);
        }
      }
    }
  };
  visit(parseTemplate(text));
  return [...out];
}

/** The catalog groups a text uses (placeholders, blocks, condition fields and global placeholders inside blocks). */
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
      } else if (n.t === "if") {
        for (const br of n.branches) {
          const c = br.cond === null ? null : parseCondition(br.cond);
          const f = c && !("error" in c) ? valueAt(catalog, c.path) : null;
          if (f) ids.add(f.group.id);
          visit(br.children);
        }
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

/** How a condition was decided when rendering (shown in «Testen»). */
export type ConditionTrace = {
  /** «Kunde.Anrede = "Frau"», or «Sonst» */
  condition: string;
  /** the field's value (formatted), null = none */
  value: string | null;
  /** true = this branch was taken; null = the condition couldn't be read */
  result: boolean | null;
  note?: string;
};

/**
 * Renders a text into plain parts and filled placeholders. Blocks repeat
 * their content per row, {{Spalte}} filled from the row; conditions keep the
 * first branch that holds (`trace` gets how each was decided). Unknown or
 * broken parts stay unfilled with a note.
 */
export function renderPlaceholders(text: string, catalog: PlaceholderGroup[], valueOf: ValueOf, rowsOf?: RowsOf, trace?: ConditionTrace[]): Segment[] {
  const out: Segment[] = [];
  const placeholder = (tok: string): Segment => {
    const f = lookupPlaceholder(catalog, tok);
    if (!f || f.item.kind === "block")
      return { kind: "placeholder", token: tok, value: null, note: /^\{\{\s*Baustein\./i.test(tok) ? "unbekannter Textbaustein" : "unbekannter Platzhalter" };
    return { kind: "placeholder", token: tok, ...valueOf(f.group, f.item) };
  };
  const renderBlock = (n: Extract<TemplateNode, { t: "block" }>) => {
    const b = lookupBlock(catalog, n.token);
    if (!b || !rowsOf) {
      out.push({ kind: "placeholder", token: n.token, value: null, note: b ? "keine Daten" : "unbekannter Block" });
      return;
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
  };
  const renderIf = (n: Extract<TemplateNode, { t: "if" }>) => {
    let taken: TemplateBranch | null = null;
    for (const br of n.branches) {
      if (br.cond === null) {
        trace?.push({ condition: "Sonst", value: null, result: true });
        taken = br;
        break;
      }
      const c = parseCondition(br.cond);
      if ("error" in c) {
        trace?.push({ condition: br.cond, value: null, result: null, note: c.error });
        continue;
      }
      const f = valueAt(catalog, c.path);
      if (!f) {
        trace?.push({ condition: br.cond, value: null, result: null, note: `unbekanntes Feld «${c.path}»` });
        continue;
      }
      const { value } = valueOf(f.group, f.item);
      const ok = evaluateCondition(c, value);
      trace?.push({ condition: conditionText(c), value, result: ok });
      if (ok) {
        taken = br;
        break;
      }
    }
    if (taken) renderNodes(taken.children);
    if (!n.closed) out.push({ kind: "placeholder", token: n.token, value: null, note: "Bedingung nicht geschlossen ({{/Wenn}} fehlt)" });
  };
  const renderNodes = (nodes: TemplateNode[]) => {
    for (const n of nodes) {
      if (n.t === "text") out.push({ kind: "text", text: n.text });
      else if (n.t === "ph") out.push(placeholder(n.token));
      else if (n.t === "stray") out.push({ kind: "placeholder", token: n.token, value: null, note: n.why });
      else if (n.t === "block") renderBlock(n);
      else renderIf(n);
    }
  };
  renderNodes(parseTemplate(text));
  return out;
}
